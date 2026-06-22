# Bibliogon Launcher - Manual Test Plan

The pure logic (`actions`, `cli`, and the GUI/tray helpers) is covered by
the automated suite (`poetry run pytest`). The single tkinter window
needs a display and is verified manually with this checklist. Run on a
machine with Docker Desktop.

## Prerequisites

- Docker Desktop installed.
- A local checkout (so `docker-compose.prod.yml` resolves) or a network
  connection (so a first `--install` can download a release).

## GUI states

1. **Fresh install (no containers)**
   - Launch with `python -m bibliogon_launcher`.
   - Docker check runs first; state shows "Bibliogon is not installed."
   - Port field is editable; type `7880` -> green "free"; type `80` ->
     red "1024-65535"; type a busy port -> red "in use".
   - Click [Install]; progress lines appear in the scrollable area;
     finishes with "Installation complete. Bibliogon is ready." and the
     state flips to running. Window stays open throughout.

2. **Already running -> management in place**
   - Relaunch while the stack is up.
   - State shows "Bibliogon is running on port 7880."; port field is
     read-only with a green "in use by Bibliogon" indicator.
   - [Open browser] opens `http://localhost:7880/` and does NOT close
     the window.
   - [Stop] stops the stack with progress; state flips to stopped.

3. **Installed but stopped**
   - From the stopped state, [Start] starts the stack and flips to
     running.

4. **Port conflict**
   - Start another program on 7880, then launch the launcher in the
     not-installed/stopped state: the port indicator shows red "in use".

5. **Docker not running**
   - Quit Docker Desktop, launch the launcher: state shows the Docker
     guidance; [Re-check] re-runs the check after you start Docker.

6. **Window / icon**
   - Title is "Bibliogon"; footer shows `v{version}`.
   - X button while running minimizes to tray (if pystray installed) or
     closes (otherwise). Never closes while an operation is mid-flight.

7. **Command-line options** (no display needed)
   - `--version` prints the version.
   - `--check` prints Docker readiness, exit 0/1.
   - `--status` prints `running` / `stopped` / `not_installed` /
     `no_docker`.
   - `--stop`, `--start`, `--install`, `--open`, `--port 7900`.
   - `--debug` (with the GUI) streams verbose logs to stdout + the log
     file.

8. **Error handling**
   - Disconnect the network mid `--install` download: a clear failure
     line appears; the window stays open.
   - Corrupt the compose file and [Start]: the failure detail appears in
     the progress area.

## System tray (only when `pip install bibliogon-launcher[tray]`)

9. X button while running -> window hides, tray icon appears with tooltip
   "Bibliogon running on port N".
10. Double-click the tray icon -> window restores.
11. Right-click the tray icon -> menu (Open / Open browser / Stop /
    Quit) works.
12. Tray "Quit" -> window and tray both close.

## Cleanup scripts

13. `scripts/cleanup-bibliogon.sh [PORT]` (Linux/macOS) and
    `scripts/cleanup-bibliogon.ps1 -Port N` (Windows) stop + remove the
    stack, prompt before deleting data volumes, and report whether the
    port is free afterwards.
