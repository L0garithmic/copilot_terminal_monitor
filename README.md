# Terminal Idle Monitor

Keep track of your terminal commands and get notified when things get stuck or run for too long.

## Features

- 🕒 **Idle Tracking**: Notifies you if a command hasn't produced output for a specific duration.
- ⏱️ **Total Time Tracking**: Alerting you when a process exceeds a total run-time threshold.
- 🚨 **Obnoxious Mode**: For cases where you absolutely cannot miss an alert—flashes the VS Code UI and uses modal popups.
- 💤 **Snooze**: Quickly silence alerts for a specific command for 1, 5, or 10 minutes.
- 📊 **Status Bar Integration**: See your command progress and idle state at a glance.
- ⚙️ **Settings UI**: Manage all settings via a custom user-friendly webview.

## Extension Settings

This extension contributes the following settings:

* `terminalIdleMonitor.enabled`: Enable/disable all monitoring.
* `terminalIdleMonitor.idleTimeout`: Seconds before an idle notification (Default: 60s).
* `terminalIdleMonitor.totalTimeout`: Seconds before a total duration notification (Default: 300s).
* `terminalIdleMonitor.statusBarAlwaysVisible`: Keep the icon in the status bar even when idle.
* `terminalIdleMonitor.displayIdleText`: Show "Idle" label next to the icon.
* `terminalIdleMonitor.obnoxiousMode`: Enable UI flashing and modal popups.
* `terminalIdleMonitor.obnoxiousColor`: The background color used during UI flashing.

## Requirements

Requires [VS Code Shell Integration](https://code.visualstudio.com/docs/terminal/shell-integration) to be enabled (default in most modern VS Code setups).
