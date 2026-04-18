# Installation

Bibliogon runs on Windows, macOS, and Linux. On every platform, the app itself is the same Docker-based stack at `http://localhost:7880`; only the way you start and stop it differs.

## Pick your platform

| Platform | What you download | Launch flow |
|----------|-------------------|-------------|
| [Windows](launcher-windows.md) | `bibliogon-launcher.exe` | Double-click the `.exe`, approve the SmartScreen prompt on first run |
| [macOS](launcher-macos.md) | `bibliogon-launcher-macos.zip` (arm64) | Unzip, right-click the `.app`, approve the Gatekeeper prompt on first run |
| [Linux](launcher-linux.md) | `bibliogon-launcher-linux` (ELF binary) | `chmod +x`, then run from terminal or a file manager |

All three launchers share the same core:

- One-time folder picker on first run, remembered via `install.json`
- Docker check before starting the stack
- Browser opens at `http://localhost:7880` when the stack is ready
- **Stop Bibliogon** button tears the stack down cleanly
- Activity log rotation (1 MB, 1 backup) written to the platform's config directory
- Auto-update notification on launcher start (opt-out in Settings)

## What the launcher does not do

The launcher is **not** a full installer. It expects Bibliogon itself to be on your disk first (cloned or unzipped from the release). If you double-click the launcher on a fresh machine with nothing else, it tells you to install Bibliogon first and exits. This is tracked as a future item (D-05) and depends on user feedback.

If you prefer a terminal workflow instead of the launcher, see the top-level `install.sh` script in the [main repository README](https://github.com/astrapi69/bibliogon#installation).

## Config directory

Each platform stores launcher state (remembered install path, activity log, auto-update setting) in the standard user config directory:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\bibliogon\` |
| macOS | `~/Library/Application Support/bibliogon/` |
| Linux | `~/.config/bibliogon/` |

You can delete this directory at any time; the launcher asks you to pick the install folder again on the next start.

## Uninstalling

See the [Uninstall](uninstall.md) page for both the launcher-driven path and the script-based fallback. Removal of your book data (Docker volumes) is opt-in on every platform.

## Next

Click your platform above to continue. When the launcher window shows "Bibliogon is running on localhost:7880", head to [Getting Started](getting-started.md) for the first book.
