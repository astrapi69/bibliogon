# Installation

> **Comfortable with the terminal?** The Docker / curl install path is on [Getting Started](getting-started.md). This page is the recommended path for users who prefer a graphical install.

Bibliogon ships a desktop launcher for Windows, macOS, and Linux. The launcher is a small program that handles the Bibliogon side of the install for you (downloading the release, preparing configuration, building Docker images, opening the browser). You only need to install Docker Desktop yourself; the launcher does the rest on first run.

## Prerequisites

- Docker Desktop installed and running. See the [Bibliogon Docker installation guide](install/docker-desktop.md) for step-by-step instructions per platform plus a "Is Docker safe to install?" section. The launcher detects Docker on startup; if it is missing or not started, the launcher shows a three-button dialog (open the Docker download page, open the Bibliogon Docker guide, or quit). The Bibliogon launcher does not (and per Docker's licensing terms cannot) install Docker Desktop for you.

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

1. **Welcome dialog**: a "Before you start" window appears on the first ever launch and explains what Bibliogon needs (Docker Desktop, ~800 MB), what the first run looks like (~2 GB / 5-10 minutes), and includes a brief Docker security note plus links to the [Bibliogon Docker installation guide](install/docker-desktop.md). Click **Got it, continue** to proceed.
2. **Install prompt** (when no Bibliogon copy is on disk): a short "Bibliogon is not installed" dialog with **Install** / **Open install guide** / **Cancel**.
3. **Folder picker**: if you chose Install, the launcher asks where Bibliogon should live (default: `~/bibliogon` on macOS / Linux, `%USERPROFILE%\bibliogon` on Windows). You can override; the choice is remembered.
4. **Download**: the launcher fetches the Bibliogon release ZIP from GitHub, extracts it, and writes a fresh `.env` with a generated secret. This step is fast (a few seconds on a normal connection).
5. **Docker build**: Docker downloads base images and builds the Bibliogon stack. First build is the slow part - typically 3-5 minutes depending on your machine and connection. Subsequent starts skip this.
6. **Health wait**: the launcher waits for the backend to report healthy on port 7880, then opens the browser at `http://localhost:7880`.
7. **Status window**: a small window stays open showing "Bibliogon is running on localhost:7880" with a **Stop Bibliogon** button. Closing the window stops the stack cleanly.

On subsequent launches, the welcome dialog and install prompt are skipped. The launcher detects the existing install via a manifest file, runs `docker compose up`, waits for health, and opens the browser.

## Pre-install update check

Before showing the welcome dialog on a fresh machine, the launcher contacts GitHub to confirm it targets the current Bibliogon. If a newer release is available, a dialog appears with three options: **Open download page** (opens the GitHub release page in your browser so you can grab a newer launcher), **Continue with older version** (proceeds with the install anyway, useful when you deliberately want an older release), or **Cancel**. The check always runs on a fresh machine regardless of the auto-update setting; the auto-update toggle in Settings governs only the post-install notification check that runs after the app is up. If GitHub is unreachable, the launcher fails open and proceeds with the embedded target version.

## What the launcher does not do

- **It does not install Docker Desktop.** Docker's licensing terms prohibit silent third-party installation, so this step stays manual. The launcher detects and instructs.
- **It does not run as a background service.** The launcher is a foreground program; closing its window stops Bibliogon. If you need Bibliogon running continuously, leave the launcher window open or use the terminal path (see Getting Started) and let `docker compose` run as a service.

## Terminal alternative

If you would rather use the command line - or want to script Bibliogon's lifecycle, run it on a server, or skip the launcher's GUI altogether - see [Getting Started](getting-started.md). The terminal path uses `start.sh` / `stop.sh` and produces an identical Docker stack on the same port. You can mix the two: install via the launcher, manage via the scripts, or vice versa.

## Where Bibliogon stores your data

Books, uploads, and the SQLite database live in your user data directory:

| Platform | Path |
|----------|------|
| Linux / macOS | `~/.local/share/bibliogon/` |
| Windows | `%LOCALAPPDATA%\bibliogon\` |
| Docker | `/app/data/` inside the `bibliogon-data` named volume |

This is automatic. If you upgrade from an older version (v0.25.0 or earlier) where data lived inside the project directory (`backend/bibliogon.db`, `backend/uploads/`), Bibliogon migrates everything to the new location on first start and leaves a `.migrated-YYYY-MM-DD` breadcrumb at each old path so you can verify the move before deleting the old files.

## Config directory

Launcher state (remembered install path, activity log, auto-update setting) lives in the standard user config directory:

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
