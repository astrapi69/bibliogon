# Installation

> **Comfortable with the terminal?** The Docker / curl install path is on [Getting Started](getting-started.md). This page is the recommended path for users who prefer a graphical install.

Bibliogon ships a desktop launcher for Windows, macOS, and Linux. The launcher is a small program that handles the Bibliogon side of the install for you (downloading the release, preparing configuration, building Docker images, opening the browser). You only need to install Docker Desktop yourself; the launcher does the rest on first run.

## Prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) installed and running. The launcher detects this on startup; if Docker Desktop is missing or not started, the launcher shows a dialog with a direct link to the Docker download page and exits cleanly. The Bibliogon launcher does not (and per Docker's licensing terms cannot) install Docker Desktop for you.

## Pick your platform

| Platform | What you download | Launch flow |
|----------|-------------------|-------------|
| [Windows](launcher-windows.md) | `bibliogon-launcher.exe` | Double-click the `.exe`, approve the SmartScreen prompt on first run |
| [macOS](launcher-macos.md) | `bibliogon-launcher-macos.zip` (arm64) | Unzip, right-click the `.app`, approve the Gatekeeper prompt on first run |
| [Linux](launcher-linux.md) | `bibliogon-launcher-linux` (ELF binary) | `chmod +x`, then run from terminal or a file manager |

All three launchers share the same core:

- Docker Desktop detection on startup, with a clear dialog if it is missing or not running
- Welcome flow on first run (see below) that downloads and sets up Bibliogon if it is not already installed
- Browser opens at `http://localhost:7880` once the stack is healthy
- **Stop Bibliogon** button tears the stack down cleanly
- Activity log rotation (1 MB, 1 backup) written to the platform's config directory
- Auto-update notification on launcher start (opt-out in Settings)

## What you see on first run

If Docker Desktop is installed and running but Bibliogon itself is not yet on disk, the launcher walks you through the install:

1. **Welcome dialog**: a three-button window appears - "Bibliogon is not installed on this computer yet". Choose **Install** to proceed automatically, **Open install guide** to read the docs in your browser, or **Close** to exit.
2. **Folder picker**: if you chose Install, the launcher asks where Bibliogon should live (default: `~/bibliogon` on macOS / Linux, `%USERPROFILE%\bibliogon` on Windows). You can override; the choice is remembered.
3. **Download**: the launcher fetches the Bibliogon release ZIP from GitHub, extracts it, and writes a fresh `.env` with a generated secret. This step is fast (a few seconds on a normal connection).
4. **Docker build**: Docker downloads base images and builds the Bibliogon stack. First build is the slow part - typically 3-5 minutes depending on your machine and connection. Subsequent starts skip this.
5. **Health wait**: the launcher waits for the backend to report healthy on port 7880, then opens the browser at `http://localhost:7880`.
6. **Status window**: a small window stays open showing "Bibliogon is running on localhost:7880" with a **Stop Bibliogon** button. Closing the window stops the stack cleanly.

On subsequent launches, steps 1-3 are skipped. The launcher detects the existing install via a manifest file, runs `docker compose up`, waits for health, and opens the browser.

## What the launcher does not do

- **It does not install Docker Desktop.** Docker's licensing terms prohibit silent third-party installation, so this step stays manual. The launcher detects and instructs.
- **It does not run as a background service.** The launcher is a foreground program; closing its window stops Bibliogon. If you need Bibliogon running continuously, leave the launcher window open or use the terminal path (see Getting Started) and let `docker compose` run as a service.

## Terminal alternative

If you would rather use the command line - or want to script Bibliogon's lifecycle, run it on a server, or skip the launcher's GUI altogether - see [Getting Started](getting-started.md). The terminal path uses `start.sh` / `stop.sh` and produces an identical Docker stack on the same port. You can mix the two: install via the launcher, manage via the scripts, or vice versa.

## Config directory

Each platform stores launcher state (remembered install path, activity log, auto-update setting) in the standard user config directory:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\bibliogon\` |
| macOS | `~/Library/Application Support/bibliogon/` |
| Linux | `~/.config/bibliogon/` |

You can delete this directory at any time; the launcher asks you to pick the install folder again on the next start (or shows the welcome flow if no install is found).

## Uninstalling

See the [Uninstall](uninstall.md) page for both the launcher-driven path and the script-based fallback. Removal of your book data (Docker volumes) is opt-in on every platform.

## Next

Click your platform above to continue. When the launcher window shows "Bibliogon is running on localhost:7880", head to [Getting Started](getting-started.md) for the first book.
