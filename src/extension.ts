import * as vscode from 'vscode';

interface ExecutionData {
	startTime: number;
	lastActivity: number;
	terminal: vscode.Terminal;
	commandLine: string;
	idleNotified: boolean;
	obnoxiousNotified: boolean;
	totalNotified: boolean;
	snoozeUntil: number;
	forceNextObnoxious?: boolean;
}

export function activate(context: vscode.ExtensionContext) {
	const activeExecutions = new Map<
		vscode.TerminalShellExecution,
		ExecutionData
	>();
	let flashInterval: NodeJS.Timeout | undefined;
	let flashState = false;
	let currentFlashTarget: vscode.ConfigurationTarget | undefined;
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
		const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
		const hasWorkspace = !!(
			vscode.workspace.workspaceFolders &&
			vscode.workspace.workspaceFolders.length > 0
		);
		currentFlashTarget =
			config.get<boolean>('obnoxiousPerWindow') && hasWorkspace
				? vscode.ConfigurationTarget.Workspace
				: vscode.ConfigurationTarget.Global;

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
				.update('colorCustomizations', customizations, currentFlashTarget);
		}, 500);
	};

	const stopFlashing = async () => {
		if (flashInterval) {
			clearInterval(flashInterval);
			flashInterval = undefined;
			if (currentFlashTarget !== undefined) {
				await vscode.workspace
					.getConfiguration('workbench')
					.update('colorCustomizations', {}, currentFlashTarget);
				currentFlashTarget = undefined;
			}
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
							'obnoxiousModeTime',
							'obnoxiousSnooze',
							'obnoxiousPerWindow',
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

			const idleTimeout = config.get<number>('idleTimeout') || 60;
			const obnoxiousTimeout = config.get<number>('obnoxiousModeTime');
			const isObnoxiousMode = config.get<boolean>('obnoxiousMode');

			const isPastIdle = idle >= idleTimeout;
			const isPastObnoxious =
				obnoxiousTimeout !== null &&
				obnoxiousTimeout !== undefined &&
				idle >= obnoxiousTimeout;

			let triggerIdleNow = false;
			let isObnoxious = false;

			if (!isNotificationShowing) {
				if (!activeData.obnoxiousNotified) {
					if (isPastObnoxious) {
						triggerIdleNow = true;
						isObnoxious = true;
					} else if (activeData.forceNextObnoxious && isPastIdle) {
						triggerIdleNow = true;
						isObnoxious = true;
					} else if (
						isObnoxiousMode &&
						isPastIdle &&
						!activeData.idleNotified
					) {
						triggerIdleNow = true;
						isObnoxious = true;
					}
				}

				if (!triggerIdleNow && !activeData.idleNotified && isPastIdle) {
					triggerIdleNow = true;
					isObnoxious = false;
				}
			}

			if (triggerIdleNow) {
				activeData.idleNotified = true;
				if (isObnoxious) {
					activeData.obnoxiousNotified = true;
					activeData.forceNextObnoxious = false;
				}
				isNotificationShowing = true;
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
							activeData!.obnoxiousNotified = false;
						} else if (s?.startsWith('Snooze')) {
							const mins = parseInt(s.match(/\d+/)![0]);
							activeData!.snoozeUntil = Date.now() + mins * 60000;
							activeData!.idleNotified = false;
							activeData!.obnoxiousNotified = false;
							activeData!.totalNotified = false;
							if (config.get<boolean>('obnoxiousSnooze')) {
								activeData!.forceNextObnoxious = true;
							}
						}
					});
			}

			if (
				!isNotificationShowing &&
				!activeData.totalNotified &&
				elapsed >= (config.get<number>('totalTimeout') || 300)
			) {
				const isObnoxiousTotal =
					isObnoxiousMode || activeData.forceNextObnoxious;
				activeData.totalNotified = true;
				isNotificationShowing = true;
				if (isObnoxiousTotal) {
					startFlashing(config.get<string>('obnoxiousColor') || '#ff0000');
					activeData.forceNextObnoxious = false;
				}
				vscode.window
					.showInformationMessage(
						`TOTAL: "${cmdSummary}" (${elapsed}s)`,
						{ modal: isObnoxiousTotal },
						'Snooze 5m',
						'Snooze 10m',
						'Snooze 15m',
					)
					.then(async (s) => {
						isNotificationShowing = false;
						if (isObnoxiousTotal) {
							await stopFlashing();
						}
						if (s?.startsWith('Snooze')) {
							const mins = parseInt(s.match(/\d+/)![0]);
							activeData!.snoozeUntil = Date.now() + mins * 60000;
							activeData!.idleNotified = false;
							activeData!.obnoxiousNotified = false;
							activeData!.totalNotified = false;
							if (config.get<boolean>('obnoxiousSnooze')) {
								activeData!.forceNextObnoxious = true;
							}
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
				obnoxiousNotified: false,
				totalNotified: false,
				snoozeUntil: 0,
			};
			activeExecutions.set(event.execution, data);
			try {
				for await (const _ of event.execution.read()) {
					data.lastActivity = Date.now();
					data.idleNotified = false;
					data.obnoxiousNotified = false;
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
    .section { margin-bottom: 20px; padding: 15px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; }
    .setting-item { margin-bottom: 12px; }
    .setting-item:last-child { margin-bottom: 0; }
    label { display: block; font-weight: bold; margin-bottom: 4px; }
    .checkbox-label { display: flex; align-items: center; font-weight: bold; cursor: pointer; }
    .checkbox-label input { margin-right: 8px; }
    input[type="number"], input[type="text"], select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px; width: 120px; }
    .desc { font-size: 0.85em; opacity: 0.8; margin-top: 2px; margin-left: 24px; }
    .obnoxious { border-left: 5px solid #ff0000; background: rgba(255,0,0,0.05); }
    h2 { border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 10px; margin-top: 0; }
    h3 { margin-top: 0; margin-bottom: 15px; font-size: 1.1em; opacity: 0.9; }
    .flex-row { display: flex; gap: 20px; flex-wrap: wrap; }
  </style></head><body>
    <h2>Copilot Terminal Monitor Settings</h2>
    
    <div class="section">
      <h3>General Settings</h3>
      <div class="setting-item">
        <label class="checkbox-label"><input type="checkbox" ${config.get('enabled') ? 'checked' : ''} onchange="update('enabled', this.checked)"> Enable Monitoring</label>
      </div>
      
      <div class="flex-row">
        <div class="setting-item">
          <label>Idle Timeout (seconds)</label>
          <input type="number" value="${config.get('idleTimeout')}" onchange="update('idleTimeout', parseInt(this.value))">
        </div>
        <div class="setting-item">
          <label>Total Timeout (seconds)</label>
          <input type="number" value="${config.get('totalTimeout')}" onchange="update('totalTimeout', parseInt(this.value))">
        </div>
        <div class="setting-item">
          <label>Status Bar Alignment</label>
          <select onchange="update('statusBarAlignment', this.value)">
            <option value="Left" ${alignment === 'Left' ? 'selected' : ''}>Left Side</option>
            <option value="Right" ${alignment === 'Right' ? 'selected' : ''}>Right Side</option>
          </select>
        </div>
      </div>

      <div class="setting-item">
        <label class="checkbox-label"><input type="checkbox" ${config.get('statusBarAlwaysVisible') ? 'checked' : ''} onchange="update('statusBarAlwaysVisible', this.checked)"> Always Show Status Bar</label>
      </div>
      <div class="setting-item">
        <label class="checkbox-label"><input type="checkbox" ${config.get('displayIdleText') ? 'checked' : ''} onchange="update('displayIdleText', this.checked)"> Display "Idle" text</label>
      </div>
    </div>
    
    <div class="section obnoxious">
      <label class="checkbox-label"><input type="checkbox" ${config.get('obnoxiousMode') ? 'checked' : ''} onchange="update('obnoxiousMode', this.checked)"> 🚨 OBNOXIOUS MODE</label>
      
      <div style="display: ${config.get('obnoxiousMode') ? 'block' : 'none'}; margin-top: 15px; border-top: 1px solid var(--vscode-widget-border); padding-top: 15px;">
        <div class="flex-row">
          <div class="setting-item">
            <label>Alert Color (Hex)</label>
            <input type="text" value="${config.get('obnoxiousColor')}" onchange="update('obnoxiousColor', this.value)">
          </div>
          <div class="setting-item">
            <label>Obnoxious Mode Time (seconds)</label>
            <input type="number" placeholder="Idle timeout" value="${config.get('obnoxiousModeTime') || ''}" onchange="update('obnoxiousModeTime', this.value ? parseInt(this.value) : null)">
          </div>
        </div>
        
        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('obnoxiousSnooze') ? 'checked' : ''} onchange="update('obnoxiousSnooze', this.checked)"> Obnoxious Snooze</label>
          <div class="desc">Snoozing a notification will make the next alert obnoxious.</div>
        </div>
        
        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('obnoxiousPerWindow') ? 'checked' : ''} onchange="update('obnoxiousPerWindow', this.checked)"> Per-Window Obnoxious Mode</label>
          <div class="desc">Flashing only affects the current window (requires a workspace).</div>
        </div>
      </div>
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
