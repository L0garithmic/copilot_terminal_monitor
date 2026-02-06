# Changelog

All notable changes to the "terminal-idle-monitor" extension will be documented in this file.

## [1.2.6] - 2026-02-05

### Added
- **Quick Menu**: Clicking the status bar icon now opens a menu to toggle Destructive Mode or open Settings.
- **Workspace-Specific Destructive Mode**: Toggle Auto-Terminate for just the current workspace instead of globally.
- **Visual Indicators**: Status bar icon now distinguishes between Global (`$(warning)`) and Workspace (`$(chat-sparkle-warning)`) destructive modes.

### Changed
- **Settings Default**: The Settings UI now updates Workspace configuration by default if a workspace is open, allowing for easier project-specific tuning.
- **Dynamic Feedback**: UI updates immediately when configuration changes are made through any interface.

## [1.2.5] - 2026-02-02

### Changed
- **Resources Section**: Added `bugs` and `repository` configuration to ensure the "Resources" links (Issues, Repository, Homepage) appear in the VS Code extension marketplace/sidebar.
- **Metadata**: Synchronized versioning and author details.
## [1.2.3] - 2026-02-02

### Added
- **Danger Zone**: Introduced automation tools for terminal management.
- **Auto-Terminate**: Automatically kill long-running processes after a set threshold (configured in minutes).
- **Gentle Termination**: Support for sending `Ctrl+C` (SIGINT) to signal processes to stop gracefully.
- **Hard Terminate Escalation**: Improved failsafe that force-closes terminals if Gentle Termination fails after a specified number of retries.
- **Active Terminal Focus**: Option to restrict monitoring only to the currently visible terminal.
- **Manual Control**: New "Terminate" action button directly in the idle/run-time alerts.

### Changed
- **Time Units**: Thresholds for "Total Run Time" and "Auto Terminate" are now set in minutes for better usability.
- **Visual Feedback**: The status bar icon dynamically changes to `chat-sparkle-warning` when Auto-Terminate is active.
- **UI Improvements**: Hiding numeric spinners in the settings UI for a cleaner look; improved layout of the Danger Zone.
- **Branding**: Updated official publisher to **LunarWerx**.

### Fixed
- **Settings Sync**: Resetting defaults now correctly clears both Global and Workspace configurations, ensuring consistency across all windows.
- **Webview Stability**: Hardened conditional UI logic to ensure settings appear correctly after resets.

## [1.0.0] - 2026-02-02

### Added
- **Dual Threshold Monitoring**: Track both "Idle" time (no output) and "Total" execution time.
- **Obnoxious Mode**: High-intensity alerts with modal popups and flashing UI (configurable colors).
- **Snooze Functionality**: Notifications now include snooze options for 1, 5, or 10 minutes.
- **Status Bar Item**: Live updates of run time and idle time. Customizable "terminal-cmd" icon.
- **Webview Settings Page**: A dedicated UI for managing all extension configurations.
- **Persistence**: Settings are saved globally across sessions.
