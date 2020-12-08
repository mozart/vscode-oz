
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as net from 'net';
import * as events from 'events';
import { processCompilerOutput, IOzMessage } from './linter';

const OZ_LANGUAGE = "oz";
interface CompilerMessage {
	character: number,
	data: string,
	filename: string,
	line: number,
}

const REGEX_COMPILER_END = /\%.*?\s\-+\s[rejected|accepted]+/

class OzOPIServer {
	server: cp.ChildProcess;
	compiler: net.Socket;
	compilerChannel: vscode.OutputChannel;
	emulatorChannel: vscode.OutputChannel;
	queue: Array<CompilerMessage>;
	events: events.EventEmitter;
	diagnosticCollection: vscode.DiagnosticCollection;
	compilerOutput: string;

	constructor() {
		this.server = null;
		this.compiler = null;
		this.events = new events.EventEmitter();
		this.queue = new Array();
		this.compilerChannel = vscode.window.createOutputChannel("Oz Compiler");
		this.emulatorChannel = vscode.window.createOutputChannel("Oz Emulator");
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection(OZ_LANGUAGE);
	}

	private display(channel: vscode.OutputChannel, shouldFocus?: () => boolean) {
		return function (data: string | Buffer) {
			channel.show(shouldFocus && shouldFocus());
			channel.append(data.toString());
		}
	}

	start() {
		if (this.server) return;

		let opts: cp.SpawnOptions = {
			stdio: [
				"ignore", //ignore stdin
				"pipe", //stdout
				"pipe", //stderr
			]
		};
		if (vscode.workspace.rootPath) opts.cwd = vscode.workspace.rootPath;

		let cmd = vscode.workspace.getConfiguration(OZ_LANGUAGE).get("ozenginePath", "ozengine");
		function onError(err: any) {
			let msg = "Failed to start oz";
			if (cmd == 'ozengine') {
				msg += ".\n Please verify Mozart install and/or " +
					"set `oz.ozenginePath` in your config.\n";
			} else {
				msg += " at " + cmd + ":\n";
			}
			vscode.window.showErrorMessage(msg + err);
			this.stop();
		}

		try {
			this.server = cp.spawn(cmd, ["x-oz://system/OPI.ozf"], opts);
		} catch (err) {
			onError(err);
		}
		this.server.on('error', (err) => { onError(err); })

		this.server.stdout.once('data', (data: Buffer) => {
			let matches = data.toString().match("'oz-socket (\\d+) (\\d+)'");
			this.compiler = new net.Socket();
			this.compiler.connect(matches[1]);
			// matches[2] is the debugger socket

			this.emulatorChannel.clear();
			this.compilerChannel.clear();

			this.server.stdout.on('data', this.display(this.emulatorChannel));
			this.server.stderr.on('data', this.display(this.emulatorChannel));

			// Dump compiler output in the compiler channel
			this.compiler.on('data', this.display(this.compilerChannel,
				() => vscode.workspace.getConfiguration(OZ_LANGUAGE).get("showCompilerOutput", true)
			));

			// parse the exceptions with the linter
			this.compiler.on('data', this.parse_errors);

			this.events.on('push', (data) => this.process_msgs());
			this.events.emit('push');
		});
	}

	private parse_errors = (data: string | Buffer) => {
		// we need to store all compiler output until we get a rejected/accepted
		let output = data.toString();
		this.compilerOutput += output

		if (REGEX_COMPILER_END.test(output)) {
			if (vscode.workspace.getConfiguration(OZ_LANGUAGE).get("enableLinter", false)) {
				try {
					let errors = processCompilerOutput(this.compilerOutput)
					this.process_errors(errors)
				} catch (e) {
					vscode.window.showErrorMessage(e)
				}
			}
			this.compilerOutput = "";
		}
	};

	private process_errors(errors: IOzMessage[]) {
		this.diagnosticCollection.clear();

		let diagnosticMap: Map<vscode.Uri, vscode.Diagnostic[]> = new Map();;

		errors.forEach(
			error => {
				let currentUri = vscode.Uri.file(error.fileName);
				var line = error.line - 1;
				var startColumn = error.column;
				var endColumn = error.column;
				let errorRange = new vscode.Range(line, startColumn, line, endColumn);
				let errorDiagnostic = new vscode.Diagnostic(errorRange, error.message, error.severity);
				let diagnostics = diagnosticMap.get(currentUri);
				if (!diagnostics) {
					diagnostics = [];
				}
				diagnostics.push(errorDiagnostic);
				diagnosticMap.set(currentUri, diagnostics);
			})

		let entries: [vscode.Uri, vscode.Diagnostic[]][] = [];
		diagnosticMap.forEach(
			(diagnostic, uri) => {
				entries.push([uri, diagnostic]);
			});

		this.diagnosticCollection.set(entries);
	}


	stop() {
		this.events.removeAllListeners();
		this.queue = new Array();

		if (this.compiler) {
			this.compiler.removeAllListeners();
			this._send({ character: 0, data: "{Application.exit 0}", filename: "", line: 0 });
			this.compiler.destroy();
			this.compiler = null;
		}

		if (this.server) {
			this.server.stdout.removeAllListeners();
			this.server.stderr.removeAllListeners();
			this.server.removeAllListeners();
			this.server.kill();
			this.server = null;

			this.display(this.compilerChannel)("Oz halted.");
		}
	}

	private process_msgs() {
		let msgs = this.queue;
		this.queue = new Array();

		msgs.forEach(msg => this._send(msg));
	}

	private _send(message: CompilerMessage) {
		if (!this.compiler) {
			console.error("[invariant violation] Trying to send code to a dead Oz process.")
			return;
		}
		// the added info as a comment allows the linter to correctly identify which
		// file the user is running to write its diagnostic
		this.compiler.write(
			message.data
			+ "\n%%vscode-oz:linter:filename:" + message.filename + ":line:" + message.line + ":char:" + message.character
			+ "\n\x04\n");
	}

	send(data: string, filename: string, offset: vscode.Position) {
		this.start();
		this.queue.push({
			data: data,
			filename,
			line: offset.line,
			character: offset.character,
		});
		this.events.emit('push');
	}
}

const oz = new OzOPIServer();

export function activate(context: vscode.ExtensionContext) {
	function register(cmd: string, callback: () => void) {
		context.subscriptions.push(vscode.commands.registerCommand(cmd, callback));
	}
	function registerText(cmd: string, callback: (textEditor: vscode.TextEditor) => void) {
		context.subscriptions.push(vscode.commands.registerTextEditorCommand(cmd, (textEditor) => {
			if (textEditor.document.languageId != OZ_LANGUAGE) {
				return;
			}
			callback(textEditor);
		}));
	}

	oz.start();

	register('oz.halt', () => oz.stop())

	registerText('oz.feedFile', (textEditor) => {
		oz.send(textEditor.document.getText(), textEditor.document.fileName, new vscode.Position(0, 0));
	});

	registerText('oz.feedRegion', (textEditor) => {
		oz.send(textEditor.document.getText(textEditor.selection), textEditor.document.fileName, textEditor.selection.start);
	});

	registerText('oz.feedLine', (textEditor) => {
		let line: vscode.TextLine = textEditor.document.lineAt(textEditor.selection.start.line)
		oz.send(line.text, textEditor.document.fileName, line.range.start);
	});

	registerText('oz.feedParagraph', (textEditor) => {
		let startLine = textEditor.selection.start.line;
		let endLine = textEditor.selection.end.line;

		while (startLine > 0
			   && !textEditor.document.lineAt(startLine - 1).isEmptyOrWhitespace) {
			startLine -= 1;
		}

		while (endLine < textEditor.document.lineCount - 1
			   && !textEditor.document.lineAt(endLine + 1).isEmptyOrWhitespace) {
			endLine += 1;
		}

		const startCharacter = 0;
		const endCharacter = textEditor.document.lineAt(endLine).text.length;

		let paragraph = new vscode.Selection(startLine, startCharacter, endLine, endCharacter);
		oz.send(textEditor.document.getText(paragraph), textEditor.document.fileName, paragraph.start);
	});

	context.subscriptions.push(oz.diagnosticCollection);
}

export function deactivate() {
	oz.stop();
}
