
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as net from 'net';
import * as events from 'events';

class OzOPIServer {
	server: cp.ChildProcess;
	compiler: net.Socket;
	compilerChannel: vscode.OutputChannel;
	emulatorChannel: vscode.OutputChannel;
	queue: Array<string>;
	events: events.EventEmitter;

	constructor() {
		this.server = null;
		this.compiler = null;
		this.events = new events.EventEmitter();
		this.queue = new Array();
		this.compilerChannel = vscode.window.createOutputChannel("Oz Compiler");
		this.emulatorChannel = vscode.window.createOutputChannel("Oz Emulator");
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

		let cmd = vscode.workspace.getConfiguration("oz").get("ozemulatorPath", "ozemulator");
		this.server = cp.spawn(cmd, ["x-oz://system/OPI.ozf"], opts);
		this.server.on('error', (err) => {
			let msg = "Failed to start oz";
			if (cmd == 'ozemulator') {
				msg += ".\n Please verify Mozart install and/or "+
				       "set `oz.ozemulatorPath` in your config.\n";
			} else {
				msg += " at "+cmd+":\n";
			}
			vscode.window.showErrorMessage(msg + err);
			this.stop();
		})
		this.server.stdout.once('data', (data: Buffer) => {
			let matches = data.toString().match("'oz-socket (\\d+) (\\d+)'");
			this.compiler = new net.Socket();
			this.compiler.connect(matches[1]);
			// matches[2] is the debugger socket

			this.emulatorChannel.clear();
			this.compilerChannel.clear();

			this.server.stdout.on('data', this.display(this.emulatorChannel));
			this.server.stderr.on('data', this.display(this.emulatorChannel));
			this.compiler.on('data', this.display(this.compilerChannel));

			this.events.on('push', (data) => this.process_msgs());
			this.events.emit('push');
		});
	}

	stop() {
		this.events.removeAllListeners();
		this.queue = new Array();

		if (this.compiler) {
			this.compiler.removeAllListeners();
			this._send("{Application.exit 0}");
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

	private _send(data: string) {
		if (!this.compiler) {
			console.error("[invariant violation] Trying to send code to a dead Oz process.")
			return;
		}
		this.compiler.write(data.trim() + "\n\x04\n");
	}

	send(data: string | Buffer) {
		this.start();
		this.queue.push(data.toString());
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
			if (textEditor.document.languageId != "oz") {
				return;
			}
			callback(textEditor);
		}));
	}

	oz.start();

	register('oz.halt', () => oz.stop())

	registerText('oz.feedFile', (textEditor) => {
		oz.send(textEditor.document.getText());
	});

	registerText('oz.feedRegion', (textEditor) => {
		oz.send(textEditor.document.getText(textEditor.selection));
	});

	registerText('oz.feedLine', (textEditor) => {
		oz.send(textEditor.document.lineAt(textEditor.selection.start.line).text);
	});

	registerText('oz.feedParagraph', (textEditor) => {
		let begin = textEditor.selection.start.line;
		let end = begin;

		while (begin > 0
			&& !textEditor.document.lineAt(--begin).isEmptyOrWhitespace) {}
		while (end < textEditor.document.lineCount-1 
			&& !textEditor.document.lineAt(++end).isEmptyOrWhitespace) {}
		
		let paragraph = new vscode.Selection(begin, 0, end+1, 0);
		oz.send(textEditor.document.getText(paragraph));
	})
}

export function deactivate() {
	oz.stop();
}
