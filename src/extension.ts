import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as net from 'net';

class OzOPIServer {
	server: cp.ChildProcess;
	compiler: net.Socket;
	compilerChannel: vscode.OutputChannel;
	emulatorChannel: vscode.OutputChannel;

	constructor() {
		this.server = null;
		this.compiler = null;
		this.compilerChannel = vscode.window.createOutputChannel("Oz Compiler");
		this.emulatorChannel = vscode.window.createOutputChannel("Oz Emulator");
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

		this.server = cp.spawn("ozengine", ["x-oz://system/OPI.ozf"], opts);
		this.server.stdout.once('data', (data: Buffer) => {
			let matches = data.toString().match("'oz-socket (\\d+) (\\d+)'");
			this.compiler = new net.Socket();
			this.compiler.connect(matches[1]);
			// matches[2] is the debugger socket

			this.emulatorChannel.clear();
			this.compilerChannel.clear();
			function push(channel: vscode.OutputChannel) {
				return function (data: Buffer) {
					console.log(data);
					channel.append(data.toString());
					channel.show();
				}
			}
			this.server.stdout.on('data', push(this.emulatorChannel));
			this.server.stderr.on('data', push(this.emulatorChannel));
			this.compiler.on('data', push(this.compilerChannel));
		});
	}

	stop() {
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
		}
	}

	private _send(data: string) {
		if (!this.compiler) return;
		this.compiler.write(data.trim() + "\n\x04\n");
	}

	send(data: string | Buffer) {
		this.start();
		this._send(data.toString());
	}
}

const oz = new OzOPIServer();

export function activate(context: vscode.ExtensionContext) {
	function register(cmd: string, callback: () => void) {
		context.subscriptions.push(vscode.commands.registerCommand(cmd, callback));
	}
	function registerText(cmd: string, callback: (textEditor: vscode.TextEditor) => void) {
		context.subscriptions.push(vscode.commands.registerTextEditorCommand(cmd, callback));
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