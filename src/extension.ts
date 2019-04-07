
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as net from 'net';
import * as events from 'events';
import { processCompilerOutput } from './linter';

const OZ_LANGUAGE = "oz";
interface CompilerMessage {
	character: number,
	data: string,
	filename: string,
	line: number,
}

class OzOPIServer {
	server: cp.ChildProcess;
	compiler: net.Socket;
	compilerChannel: vscode.OutputChannel;
	emulatorChannel: vscode.OutputChannel;
	queue: Array<CompilerMessage>;
	events: events.EventEmitter;
	diagnosticCollection: vscode.DiagnosticCollection;

	constructor() {
		this.server = null;
		this.compiler = null;
		this.events = new events.EventEmitter();
		this.queue = new Array();
		this.compilerChannel = vscode.window.createOutputChannel("Oz Compiler");
		this.emulatorChannel = vscode.window.createOutputChannel("Oz Emulator");
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection(OZ_LANGUAGE);
	}

	private display(channel: vscode.OutputChannel) {
		return function (data: string | Buffer) {
			channel.show(true /* do not take focus */);
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

			//output printing of compiler data
			if (vscode.workspace.getConfiguration(OZ_LANGUAGE).get("showCompilerOutput", true)) {
				this.compiler.on('data', this.display(this.compilerChannel));
			}

			// parse the exceptions with the linter
			if (vscode.workspace.getConfiguration(OZ_LANGUAGE).get("enableLinter", false)) {
				// we need to store all compiler output until we get a rejected/accepted
				let compilerOutput = "";
				const REGEX_COMPILER_END = /\%.*?\s\-+\s[rejected|accepted]+/
				this.compiler.on(
					'data',
					function (d) {
						let output = d.toString();
						if (REGEX_COMPILER_END.test(output)) {
							processCompilerOutput(compilerOutput + output).then(
								errors => {
									oz.diagnosticCollection.clear();

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

									oz.diagnosticCollection.set(entries);
								}).catch(error => {
									vscode.window.showErrorMessage(error)
								});
							compilerOutput = "";
						}
						else {
							compilerOutput = compilerOutput + output;
							return;
						}
					});
			}
			this.events.on('push', (data) => this.process_msgs());
			this.events.emit('push');
		});
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
			message.data.trim() + "\n%%vscode-oz:linter:filename:" + message.filename + ":line:" + message.line + ":char:" + message.character + "\n\n\x04\n");
	}

	send(data: string | Buffer, filename: string, startingLine: number, startingCharacter: number) {
		this.start();
		this.queue.push({ character: startingCharacter, data: data.toString(), filename: filename, line: startingLine });
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
		oz.send(textEditor.document.getText(), textEditor.document.fileName, 0, 0);
	});

	registerText('oz.feedRegion', (textEditor) => {
		oz.send(textEditor.document.getText(textEditor.selection), textEditor.document.fileName, textEditor.selection.start.line, textEditor.selection.start.character);
	});

	registerText('oz.feedLine', (textEditor) => {
		oz.send(textEditor.document.lineAt(textEditor.selection.start.line).text, textEditor.document.fileName, textEditor.selection.start.line, 0);
	});

	registerText('oz.feedParagraph', (textEditor) => {
		let begin = textEditor.selection.start.line;
		let end = begin;

		while (begin > 0
			&& !textEditor.document.lineAt(--begin).isEmptyOrWhitespace) { }
		while (end < textEditor.document.lineCount - 1
			&& !textEditor.document.lineAt(++end).isEmptyOrWhitespace) { }

		let paragraph = new vscode.Selection(begin, 0, end + 1, 0);
		oz.send(textEditor.document.getText(paragraph), textEditor.document.fileName, begin, 0);
	});

	context.subscriptions.push(oz.diagnosticCollection);
}

export function deactivate() {
	oz.stop();
}
