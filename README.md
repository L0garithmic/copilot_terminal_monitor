# Terminal Idle Monitor

Keep track of your terminal commands and get notified when things get stuck or run for too long.

## Features

- 🕒 **Idle Tracking**: Notifies you if a command hasn't produced output for a specific duration.
- ⏱️ **Total Time Tracking**: Alerting you when a process exceeds a total run-time threshold.
- 🛑 **Auto-Terminate**: Automatically kill processes that exceed your specified run-time or idle thresholds.
- 🧊 **Gentle & Hard Termination**: Supports sending `Ctrl+C` (SIGINT) for graceful stops, with automatic hard-close escalation.
- 🚨 **Obnoxious Mode**: Flashes the VS Code UI and uses modal popups for unmissable alerts.
- 💤 **Snooze**: Silence alerts for a specific command for 5, 10, or 15 minutes.
- 📊 **Status Bar Integration**: Live updates of runtime and idle state with dynamic icons.
- 🏷️ **Tag-Style Exclusions**: Modern exclusion management with tag-based patterns and quick removal.

## Extension Settings

This extension contributes the following settings:

* `terminalIdleMonitor.enabled`: Enable/disable all monitoring.
* `terminalIdleMonitor.idleTimeout`: Seconds before an idle notification (Default: 60s).
* `terminalIdleMonitor.totalTimeout`: Minutes before a total duration notification (Default: 5m).
* `terminalIdleMonitor.onlyMonitorActive`: Restrict monitoring to the active terminal tab only.
* `terminalIdleMonitor.autoTerminateEnabled`: Enable automated process termination.
* `terminalIdleMonitor.enableExclusions`: Enable terminal title patterns to ignore.
* `terminalIdleMonitor.excludePatterns`: Comma-separated list of titles to exclude.
* `terminalIdleMonitor.useSigInt`: Attempt to send `Ctrl+C` before killing the terminal.
* `terminalIdleMonitor.hardTerminateRetries`: Number of SIGINT attempts before force-closing.
* `terminalIdleMonitor.obnoxiousMode`: Enable UI flashing and modal popups.

## Requirements

Requires [VS Code Shell Integration](https://code.visualstudio.com/docs/terminal/shell-integration) to be enabled (default in most modern VS Code setups).
