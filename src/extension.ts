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
    :root {
      --spacing: 16px;
      --radius: 8px;
    }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 16px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      line-height: 1.4;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .section { 
      margin-bottom: 16px;
      padding: 12px 16px;
      background-color: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: var(--radius);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .setting-item { margin-bottom: 10px; }
    .setting-item:last-child { margin-bottom: 0; }
    
    label { display: block; font-size: 0.85em; font-weight: 600; margin-bottom: 4px; opacity: 0.9; }
    .checkbox-label { 
      display: flex;
      align-items: center;
      font-weight: 600;
      font-size: 0.9em;
      cursor: pointer;
      user-select: none;
      transition: opacity 0.2s;
    }
    .checkbox-label:hover { opacity: 0.8; }
    .checkbox-label input { 
      appearance: none;
      width: 16px;
      height: 16px;
      margin-right: 10px;
      border: 1px solid var(--vscode-checkbox-border);
      background: var(--vscode-checkbox-background);
      border-radius: 3px;
      position: relative;
      cursor: pointer;
    }
    .checkbox-label input:checked { 
      background: var(--vscode-checkbox-selectBackground);
      border-color: var(--vscode-checkbox-selectBorder);
    }
    .checkbox-label input:checked::after {
      content: '✓';
      position: absolute;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #ffffff;
      font-size: 11px;
      font-weight: bold;
    }

    input[type="number"], input[type="text"], select { 
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 4px 8px;
      border-radius: 4px;
      width: 130px;
      font-size: 0.9em;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    input:focus, select:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    
    .desc { font-size: 0.8em; opacity: 0.65; margin-top: 2px; margin-left: 26px; font-weight: normal; }
    
    .obnoxious { 
      border-left: 4px solid #ff4444;
      background: linear-gradient(to right, rgba(255,68,68,0.05), transparent);
    }
    .obnoxious-active {
        background: linear-gradient(to right, rgba(255,68,68,0.08), transparent);
    }

    h2 { 
      margin-top: 0;
      margin-bottom: 16px;
      font-size: 1.5em;
      font-weight: 400;
      border-bottom: 1px solid var(--vscode-widget-border);
      padding-bottom: 8px;
    }
    h3 { margin-top: 0; margin-bottom: 12px; font-size: 1.1em; letter-spacing: 0.5px; text-transform: uppercase; opacity: 0.7; }
    
    .flex-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
    
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      cursor: pointer;
      border-radius: 4px;
      font-size: 0.9em;
      font-weight: 600;
      transition: background 0.2s;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  </style></head><body>
    <div class="container">
      <h2>Terminal Monitor Settings</h2>
      
      <div class="section">
        <h3>General Monitoring</h3>
        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('enabled') ? 'checked' : ''} onchange="update('enabled', this.checked)"> Enable Terminal Monitoring</label>
        </div>
        
        <div class="flex-row">
          <div class="setting-item">
            <label>Idle Time Threshold</label>
            <input type="number" value="${config.get('idleTimeout')}" onchange="update('idleTimeout', parseInt(this.value))">
            <div class="desc" style="margin-left:0">Seconds until alert</div>
          </div>
          <div class="setting-item">
            <label>Total Running Time</label>
            <input type="number" value="${config.get('totalTimeout')}" onchange="update('totalTimeout', parseInt(this.value))">
            <div class="desc" style="margin-left:0">Seconds until alert</div>
          </div>
          <div class="setting-item">
            <label>Status Bar Position</label>
            <select onchange="update('statusBarAlignment', this.value)">
              <option value="Left" ${alignment === 'Left' ? 'selected' : ''}>Left Side</option>
              <option value="Right" ${alignment === 'Right' ? 'selected' : ''}>Right Side</option>
            </select>
          </div>
        </div>

        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('statusBarAlwaysVisible') ? 'checked' : ''} onchange="update('statusBarAlwaysVisible', this.checked)"> Keep Status Bar Visible</label>
        </div>
        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('displayIdleText') ? 'checked' : ''} onchange="update('displayIdleText', this.checked)"> Show "Idle" Status</label>
        </div>
      </div>
      
      <div class="section obnoxious ${config.get('obnoxiousMode') ? 'obnoxious-active' : ''}">
        <h3>Alert Intensity</h3>
        <div class="setting-item">
          <label class="checkbox-label" style="font-size: 1em; color: #ff4444;">
            <input type="checkbox" ${config.get('obnoxiousMode') ? 'checked' : ''} onchange="update('obnoxiousMode', this.checked)"> 
            🚨 OBNOXIOUS MODE
          </label>
        </div>
        
        <div style="display: ${config.get('obnoxiousMode') ? 'block' : 'none'}; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,68,68,0.2);">
          <div class="flex-row">
            <div class="setting-item">
              <label>Flash Color (Hex)</label>
              <input type="text" value="${config.get('obnoxiousColor')}" onchange="update('obnoxiousColor', this.value)">
            </div>
            <div class="setting-item">
              <label>Intensify After (seconds)</label>
              <input type="number" placeholder="At idle" value="${config.get('obnoxiousModeTime') || ''}" onchange="update('obnoxiousModeTime', this.value ? parseInt(this.value) : null)">
            </div>
          </div>
          
          <div class="setting-item">
            <label class="checkbox-label"><input type="checkbox" ${config.get('obnoxiousSnooze') ? 'checked' : ''} onchange="update('obnoxiousSnooze', this.checked)"> Escalating Snooze</label>
            <div class="desc">Next alert becomes obnoxious after snoozing.</div>
          </div>
          
          <div class="setting-item">
            <label class="checkbox-label"><input type="checkbox" ${config.get('obnoxiousPerWindow') ? 'checked' : ''} onchange="update('obnoxiousPerWindow', this.checked)"> Isolate to Current Window</label>
            <div class="desc">Only flash active project window.</div>
          </div>
        </div>
      </div>

      <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
        <button class="secondary" onclick="reset()">Reset All to Defaults</button>
      </div>
    </div>

    <script>
      const vscode = acquireVsCodeApi(); 
      function update(key, value) { vscode.postMessage({ command: 'update', key, value }); }
      function reset() { vscode.postMessage({ command: 'reset' }); }
    </script>
  </body></html>`;
}
export function deactivate() {}
