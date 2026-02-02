import * as vscode from 'vscode';

interface ExecutionData {
	startTime: number;
	lastActivity: number;
	terminal: vscode.Terminal;
	commandLine: string;
	idleNotified: boolean;
	totalNotified: boolean;
	snoozeUntil: number;
}

export function activate(context: vscode.ExtensionContext) {
	const activeExecutions = new Map<
		vscode.TerminalShellExecution,
		ExecutionData
	>();
	let flashInterval: NodeJS.Timeout | undefined;
	let flashState = false;
	let isNotificationShowing = false;

	let statusBarItem: vscode.StatusBarItem;

	const createStatusBar = () => {
		if (statusBarItem) {
			statusBarItem.dispose();
		}
		const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
		const alignment =
			config.get<string>('statusBarAlignment') === 'Left'
				? vscode.StatusBarAlignment.Left
				: vscode.StatusBarAlignment.Right;
		statusBarItem = vscode.window.createStatusBarItem(alignment, 100);
		statusBarItem.command = 'terminal-idle-monitor.openSettings';
		statusBarItem.text = '$(terminal-cmd)';
		if (
			config.get<boolean>('enabled') &&
			config.get<boolean>('statusBarAlwaysVisible')
		) {
			statusBarItem.show();
		}
	};

	createStatusBar();

	const startFlashing = (color: string) => {
		if (flashInterval) {
			return;
		}
		flashInterval = setInterval(async () => {
			flashState = !flashState;
			const customizations = flashState
				? {
						'titleBar.activeBackground': color,
						'titleBar.activeForeground': '#ffffff',
						'activityBar.background': color,
						'statusBar.background': color,
					}
				: {};
			await vscode.workspace
				.getConfiguration('workbench')
				.update(
					'colorCustomizations',
					customizations,
					vscode.ConfigurationTarget.Global,
				);
		}, 500);
	};

	const stopFlashing = async () => {
		if (flashInterval) {
			clearInterval(flashInterval);
			flashInterval = undefined;
			await vscode.workspace
				.getConfiguration('workbench')
				.update('colorCustomizations', {}, vscode.ConfigurationTarget.Global);
		}
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'terminal-idle-monitor.openSettings',
			() => {
				const panel = vscode.window.createWebviewPanel(
					'terminalIdleMonitorSettings',
					'Copilot Terminal Monitor Settings',
					vscode.ViewColumn.One,
					{ enableScripts: true },
				);
				panel.webview.html = getSettingsHtml(
					vscode.workspace.getConfiguration('terminalIdleMonitor'),
				);
				panel.webview.onDidReceiveMessage(async (message) => {
					if (message.command === 'update') {
						await vscode.workspace
							.getConfiguration('terminalIdleMonitor')
							.update(
								message.key,
								message.value,
								vscode.ConfigurationTarget.Global,
							);
						panel.webview.html = getSettingsHtml(
							vscode.workspace.getConfiguration('terminalIdleMonitor'),
						);
						if (message.key === 'statusBarAlignment') {
							createStatusBar();
						}
					} else if (message.command === 'reset') {
						const cfg = vscode.workspace.getConfiguration(
							'terminalIdleMonitor',
						);
						const keys = [
							'enabled',
							'idleTimeout',
							'totalTimeout',
							'statusBarAlignment',
							'statusBarAlwaysVisible',
							'displayIdleText',
							'obnoxiousMode',
							'obnoxiousColor',
						];
						for (const key of keys) {
							await cfg.update(
								key,
								undefined,
								vscode.ConfigurationTarget.Global,
							);
						}
						panel.webview.html = getSettingsHtml(
							vscode.workspace.getConfiguration('terminalIdleMonitor'),
						);
						createStatusBar();
					}
				});
				panel.onDidDispose(() => stopFlashing());
			},
		),
	);

	const checkInterval = setInterval(async () => {
		const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
		if (!config.get<boolean>('enabled')) {
			statusBarItem.hide();
			return;
		}

		const now = Date.now();
		const activeTerminal = vscode.window.activeTerminal;
		let activeData: ExecutionData | undefined;
		for (const data of activeExecutions.values()) {
			if (data.terminal === activeTerminal) {
				activeData = data;
				break;
			}
		}

		if (activeData) {
			const isSnoozed = now < activeData.snoozeUntil;
			if (isSnoozed) {
				statusBarItem.text = `$(terminal-cmd) Snoozed (${Math.ceil((activeData.snoozeUntil - now) / 1000)}s)`;
				statusBarItem.show();
				return;
			}

			const elapsed = Math.floor((now - activeData.startTime) / 1000);
			const idle = Math.floor((now - activeData.lastActivity) / 1000);
			statusBarItem.text = `$(terminal-cmd) ${elapsed}s (Idle: ${idle}s)`;
			statusBarItem.show();

			const cmdSummary =
				activeData.commandLine.length > 30
					? activeData.commandLine.substring(0, 27) + '...'
					: activeData.commandLine;

			if (
				!isNotificationShowing &&
				!activeData.idleNotified &&
				idle >= (config.get<number>('idleTimeout') || 60)
			) {
				activeData.idleNotified = true;
				isNotificationShowing = true;
				const isObnoxious = config.get<boolean>('obnoxiousMode');
				if (isObnoxious) {
					startFlashing(config.get<string>('obnoxiousColor') || '#ff0000');
				}
				vscode.window
					.showWarningMessage(
						`IDLE: "${cmdSummary}" (${idle}s)`,
						{ modal: isObnoxious },
						'Reset Timer',
						'Snooze 5m',
						'Snooze 10m',
						'Snooze 15m',
					)
					.then(async (s) => {
						isNotificationShowing = false;
						if (isObnoxious) {
							await stopFlashing();
						}
						if (s === 'Reset Timer') {
							activeData!.lastActivity = Date.now();
							activeData!.idleNotified = false;
						} else if (s?.startsWith('Snooze')) {
							const mins = parseInt(s.match(/\d+/)![0]);
							activeData!.snoozeUntil = Date.now() + mins * 60000;
							activeData!.idleNotified = false;
							activeData!.totalNotified = false;
						}
					});
			}

			if (
				!isNotificationShowing &&
				!activeData.totalNotified &&
				elapsed >= (config.get<number>('totalTimeout') || 300)
			) {
				activeData.totalNotified = true;
				isNotificationShowing = true;
				const isObnoxious = config.get<boolean>('obnoxiousMode');
				if (isObnoxious) {
					startFlashing(config.get<string>('obnoxiousColor') || '#ff0000');
				}
				vscode.window
					.showInformationMessage(
						`TOTAL: "${cmdSummary}" (${elapsed}s)`,
						{ modal: isObnoxious },
						'Snooze 5m',
						'Snooze 10m',
						'Snooze 15m',
					)
					.then(async (s) => {
						isNotificationShowing = false;
						if (isObnoxious) {
							await stopFlashing();
						}
						if (s?.startsWith('Snooze')) {
							const mins = parseInt(s.match(/\d+/)![0]);
							activeData!.snoozeUntil = Date.now() + mins * 60000;
							activeData!.idleNotified = false;
							activeData!.totalNotified = false;
						}
					});
			}
		} else {
			if (config.get<boolean>('statusBarAlwaysVisible')) {
				statusBarItem.text = config.get<boolean>('displayIdleText')
					? '$(terminal-cmd) Idle'
					: '$(terminal-cmd)';
				statusBarItem.show();
			} else {
				statusBarItem.hide();
			}
		}
	}, 1000);

	context.subscriptions.push(
		new vscode.Disposable(() => {
			clearInterval(checkInterval);
			if (statusBarItem) {
				statusBarItem.dispose();
			}
		}),
	);

	context.subscriptions.push(
		vscode.window.onDidStartTerminalShellExecution(async (event) => {
			const data: ExecutionData = {
				startTime: Date.now(),
				lastActivity: Date.now(),
				terminal: event.terminal,
				commandLine: event.execution.commandLine.value || 'Unknown',
				idleNotified: false,
				totalNotified: false,
				snoozeUntil: 0,
			};
			activeExecutions.set(event.execution, data);
			try {
				for await (const _ of event.execution.read()) {
					data.lastActivity = Date.now();
					data.idleNotified = false;
				}
			} catch {
			} finally {
				activeExecutions.delete(event.execution);
			}
		}),
	);
	context.subscriptions.push(
		vscode.window.onDidEndTerminalShellExecution((e) =>
			activeExecutions.delete(e.execution),
		),
	);
}

function getSettingsHtml(config: vscode.WorkspaceConfiguration): string {
	const alignment = config.get<string>('statusBarAlignment') || 'Left';
	return `<!DOCTYPE html><html><head><style>
    body { font-family: sans-serif; padding: 20px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
    .setting { margin-bottom: 20px; padding: 15px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; }
    label { display: block; font-weight: bold; margin-bottom: 5px; }
    input[type="number"], input[type="text"], select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 5px; width: 120px; }
    .desc { font-size: 0.9em; opacity: 0.8; margin-top: 5px; }
    .obnoxious { border-left: 5px solid #ff0000; background: rgba(255,0,0,0.05); }
    h2 { border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 10px; }
  </style></head><body>
    <h2>Copilot Terminal Monitor Settings</h2>
    <div class="setting"><label><input type="checkbox" ${config.get('enabled') ? 'checked' : ''} onchange="update('enabled', this.checked)"> Enable Monitoring</label></div>
    <div class="setting"><label>Idle Timeout (seconds)</label><input type="number" value="${config.get('idleTimeout')}" onchange="update('idleTimeout', parseInt(this.value))"></div>
    <div class="setting"><label>Total Timeout (seconds)</label><input type="number" value="${config.get('totalTimeout')}" onchange="update('totalTimeout', parseInt(this.value))"></div>
    
    <div class="setting">
      <label>Status Bar Alignment</label>
      <select onchange="update('statusBarAlignment', this.value)">
        <option value="Left" ${alignment === 'Left' ? 'selected' : ''}>Left Side</option>
        <option value="Right" ${alignment === 'Right' ? 'selected' : ''}>Right Side</option>
      </select>
    </div>

    <div class="setting"><label><input type="checkbox" ${config.get('statusBarAlwaysVisible') ? 'checked' : ''} onchange="update('statusBarAlwaysVisible', this.checked)"> Always Show Status Bar</label></div>
    <div class="setting"><label><input type="checkbox" ${config.get('displayIdleText') ? 'checked' : ''} onchange="update('displayIdleText', this.checked)"> Display "Idle" text</label></div>
    
    <div class="setting obnoxious">
      <label><input type="checkbox" ${config.get('obnoxiousMode') ? 'checked' : ''} onchange="update('obnoxiousMode', this.checked)"> 🚨 OBNOXIOUS MODE</label>
      <br>
      <label>Alert Color (Hex)</label>
      <input type="text" value="${config.get('obnoxiousColor')}" onchange="update('obnoxiousColor', this.value)">
    </div>

    <div style="margin-top: 30px;">
      <button onclick="reset()" style="background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 8px 15px; cursor: pointer; border-radius: 2px;">Reset to Defaults</button>
    </div>

    <script>
      const vscode = acquireVsCodeApi(); 
      function update(key, value) { vscode.postMessage({ command: 'update', key, value }); }
      function reset() { vscode.postMessage({ command: 'reset' }); }
    </script>
  </body></html>`;
}
export function deactivate() {}
