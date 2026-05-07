# Cross-platform installer scripts

Bibliogon ships four install entry points that all do the same thing — download Bibliogon, build the Docker image, start the app on `http://localhost:7880`. Pick the one your operating system understands.

## Quick reference

| Platform | Entry point | How |
|----------|-------------|-----|
| Linux / macOS (terminal) | `install.sh` | `curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh \| bash` |
| Windows (PowerShell) | `install.ps1` | `irm https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.ps1 \| iex` |
| macOS (Finder double-click) | `install.command` | Clone or download the repo, then double-click `install.command` in Finder |
| Windows (double-click) | `install.cmd` | Clone or download the repo, then double-click `install.cmd` |

## What each script does

All four entry points run the same five steps:

1. Check for Docker (and Docker Compose). Abort with a download link if missing.
2. Clone the Bibliogon repo at the pinned release tag (or download a tarball if `git` is missing).
3. Generate the `BIBLIOGON_SECRET_KEY` and `BIBLIOGON_CREDENTIALS_SECRET` if they do not already exist.
4. Write a `.env` file in the install directory.
5. Run `docker compose up -d` and wait for the health endpoint.

The default install directory is `~/bibliogon` (Linux/macOS) or `%USERPROFILE%\bibliogon` (Windows). Override with the `BIBLIOGON_DIR` environment variable. Override the version with `BIBLIOGON_VERSION=vX.Y.Z`.

## Prerequisites

- **Docker Desktop** (Windows, macOS) or **Docker Engine + Compose plugin** (Linux). See the [Docker Desktop installation guide](docker-desktop.md).
- **~5 GB disk space** for the Docker image + your data.
- **Internet access** to download Bibliogon and pull base images.

You do **not** need Python, Node, Poetry, npm, or any other tooling installed. Everything runs inside the Docker container.

## install.sh (Linux / macOS, curl-pipe)

The original entry point. Single-line install:

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

The script is generated at release time from `install.sh.template`; the committed file is checked into the repo so the curl-pipe URL works directly. Reading the script before running it is supported and encouraged: `curl -fsSL ... -o install.sh`, inspect, then `bash install.sh`.

## install.ps1 (Windows, PowerShell)

PowerShell mirror of `install.sh`, generated from `install.ps1.template` via `make sync-versions`. Same five steps, written in PowerShell:

```powershell
irm https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.ps1 | iex
```

`irm` (`Invoke-RestMethod`) downloads the script; `iex` (`Invoke-Expression`) runs it. Same caveat as curl-pipe: download and inspect first if you prefer (`irm ... -OutFile install.ps1`).

## install.command (macOS, Finder double-click)

A 10-line wrapper around `install.sh` that lets users start the install without opening Terminal. Finder treats `.command` files as runnable. After cloning or downloading the repo:

1. Open Finder, navigate to the Bibliogon folder.
2. Double-click `install.command`.
3. Approve the Gatekeeper warning the first time (right-click → Open is the documented bypass).

The wrapper carries no version placeholder; it just `cd`s to its directory and runs `install.sh`, so `install.sh` is the single source of truth for version.

## install.cmd (Windows, double-click)

A 7-line batch wrapper around `install.ps1`. Double-click in Explorer to run; `install.cmd` invokes PowerShell with `-NoProfile -ExecutionPolicy Bypass` so corporate Windows installations with Group-Policy-locked user-side ExecutionPolicy still launch the installer. The user does **not** need to run `Set-ExecutionPolicy` separately.

The same SmartScreen warning applies on first run: click "More info" → "Run anyway".

## Unsigned binaries

All four wrappers ship **unsigned** per launch decision. That means:

- **macOS users see a Gatekeeper warning** the first time they double-click `install.command`. The documented bypass is right-click the file in Finder → Open → Open in the dialog.
- **Windows users see a SmartScreen warning** the first time they run `install.cmd`. The bypass is "More info" → "Run anyway" in the SmartScreen dialog.

Paid signing certificates would remove these warnings. They are deferred until adoption justifies the per-platform signing cost. The warnings do not affect security — they only mean the binary was not signed by a paid certificate authority. The repo is open source and the install scripts are short enough to read in a couple of minutes if you want to verify what they do.

## Manual install (no wrapper)

The wrappers are convenience. The underlying flow is just:

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
./start.sh
```

`start.sh` does the same `.env` generation + `docker compose up -d` the wrapper scripts do. Use this path if you prefer to read the repo before committing.

## Stopping, restarting, uninstalling

Once installed:

```bash
cd ~/bibliogon && ./stop.sh         # Stop
cd ~/bibliogon && ./start.sh        # Restart
cd ~/bibliogon && ./stop.sh && cd ~ && rm -rf ~/bibliogon  # Full removal
```

The Bibliogon launcher (the binary you download from GitHub Releases) wraps the same lifecycle in a tray-icon UI; see [Windows Launcher](../launcher-windows.md), [macOS Launcher](../launcher-macos.md), [Linux Launcher](../launcher-linux.md).

> Last verified for v0.29.0 (2026-05-07).
