# Distribution Smoke Test - YYYY-MM-DD

Combined smoke test for the install path and the Windows + Linux launchers.
Copy this file before each test run (e.g.
`distribution-smoke-test-2026-04-XX.md`), fill in the fields,
commit the filled-in copy. Keep this template unchanged.

## Environment

- OS version (Windows + Linux distro/kernel):
- Docker Desktop / Docker Engine version:
- Git Bash version (Windows only):
- Bibliogon version (git tag or commit):
- Launcher version (from the .exe properties dialog or `--version`):
- Launcher SHA256 (from the CI artifact or release asset):

---

## Part 1: Install Bibliogon via official install path

**Do this BEFORE the launcher smoke test. If any step fails, STOP -
this is a blocker for launcher testing.**

### Prerequisites

- [ ] Fresh Windows environment (VM or new user account recommended)
- [ ] Git Bash installed
- [ ] Docker Desktop installed and running
- [ ] No previous Bibliogon installation at `%USERPROFILE%\bibliogon`

### Install via curl

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

### Install Test Results

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| Git clone | Repo cloned to `~/bibliogon`, correct VERSION tag checked out |  | PASS / FAIL |
| .env creation | `.env` created with random secret key |  | PASS / FAIL |
| Docker build (backend) | `docker compose -f docker-compose.prod.yml up --build` completes without errors. Specifically: no "Path /plugins/... does not exist" errors from Poetry. |  | PASS / FAIL |
| Docker build (frontend) | Frontend image builds, nginx starts |  | PASS / FAIL |
| Health check | Backend responds to health check within start_period |  | PASS / FAIL |
| UI loads | `http://localhost:7880` shows Bibliogon dashboard |  | PASS / FAIL |
| Create a book | Can create a new book and add a chapter |  | PASS / FAIL |

### Install Failure Notes

If the install fails, capture:
- Full console output from the failing step
- `docker compose logs` output
- Docker Desktop version and resource allocation

```
```

---

## Part 2: D-01 Launcher Smoke Test

**Requires: Part 1 passed. Bibliogon is installed and running
(or was running and was stopped - the launcher will restart it).**

### Preflight

- [ ] Downloaded `bibliogon-launcher.exe` from GitHub release or CI artifact
- [ ] Downloaded `bibliogon-launcher.exe.sha256` alongside
- [ ] Verified with PowerShell: `Get-FileHash -Algorithm SHA256 .\bibliogon-launcher.exe` matches the hex string in `.sha256`
- [ ] Bibliogon repo exists at `%USERPROFILE%\bibliogon` (installed in Part 1)

### Happy-Path Test Results

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| SHA256 match | `Get-FileHash` output equals `.sha256` content (case-insensitive) |  | PASS / FAIL |
| SmartScreen dialog | "Windows protected your PC" with Publisher "Asterios Raptis" visible after clicking "More info" |  | PASS / FAIL |
| Run anyway | Launcher starts after clicking "Run anyway" |  | PASS / FAIL |
| Docker installed check | No error when Docker Desktop is installed |  | PASS / FAIL |
| Docker daemon check | No error when Docker Desktop engine is running |  | PASS / FAIL |
| Folder picker (first run only) | Appears if repo is not at `%USERPROFILE%\bibliogon`; remembers choice |  | PASS / FAIL / N/A |
| `.env` auto-create | Generated if missing, with a random secret |  | PASS / FAIL |
| Tkinter starting window | Appears with "Starting Bibliogon..." during compose up |  | PASS / FAIL |
| Health check wait | Window shows "Waiting for Bibliogon to answer..." step |  | PASS / FAIL |
| Browser opens to Bibliogon | Default browser launches at `http://localhost:7880` and Dashboard loads |  | PASS / FAIL |
| Status window switches to running | "Bibliogon is running on localhost:7880" with Stop button |  | PASS / FAIL |
| Stop button | `docker compose down` runs, window closes cleanly, no containers left |  | PASS / FAIL |
| Re-launch detection | Second .exe invocation shows "Bibliogon is already running - opening browser" and just opens the browser |  | PASS / FAIL |
| Close via window X | Same shutdown path as Stop button |  | PASS / FAIL |

### Failure-Path Test Results

| Step | Setup | Expected | Observed | Status |
|------|-------|----------|----------|--------|
| Docker not running | Quit Docker Desktop, then launch | Dialog "Docker Desktop is not running" with Retry / Cancel |  | PASS / FAIL |
| Docker not installed | Temporarily rename `docker.exe` on PATH (restore after) | Dialog with docker.com install URL |  | PASS / FAIL |
| Port 7880 occupied | `python -m http.server 7880` in another terminal before launch | Dialog mentions the port value and points at `.env` |  | PASS / FAIL |
| Wrong repo path | Delete or rename the bibliogon folder before launch | "Bibliogon is not installed yet" welcome dialog with install guide link |  | PASS / FAIL |
| Installation moved | After successful run: move the bibliogon folder, re-launch | "Installation moved" three-button dialog (Choose folder / Install guide / Cancel) |  | PASS / FAIL |
| Health check timeout | Break the backend (e.g. invalid env var in `.env`), launch | After 60s, dialog shows last 20 log lines with Retry / Cancel |  | PASS / FAIL |

---

## Part 3: Launcher Install/Uninstall Flow

**Tests the built-in installer that replaced install.sh on Windows.**

### Install Flow

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| Launch with no manifest | Install UI appears (Install / Open guide / Close) |  | PASS / FAIL |
| Click Install | Folder picker opens |  | PASS / FAIL |
| Accept default folder | Download progress indicator visible |  | PASS / FAIL |
| Download completes | Files extracted to chosen folder |  | PASS / FAIL |
| .env created | .env file present with random secret |  | PASS / FAIL |
| Manifest written | `%APPDATA%\bibliogon\install.json` exists with correct content |  | PASS / FAIL |
| Success dialog | "Installation complete" with Start button |  | PASS / FAIL |
| Click Start | Main UI appears, Bibliogon starts |  | PASS / FAIL |

### Uninstall Flow

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| Uninstall button visible | Only when manifest exists (after install) |  | PASS / FAIL |
| Click Uninstall | Confirmation dialog shows install path |  | PASS / FAIL |
| Cancel confirmation | Nothing deleted |  | PASS / FAIL |
| Confirm uninstall | Install directory removed |  | PASS / FAIL |
| Manifest deleted | `install.json` no longer present |  | PASS / FAIL |
| UI transitions | Install UI reappears (Install button, no Uninstall) |  | PASS / FAIL |

### Edge Cases

| Step | Setup | Expected | Observed | Status |
|------|-------|----------|----------|--------|
| Manifest but dir missing | Delete install_dir manually, launch | Treat as not installed, show install UI |  | PASS / FAIL |
| Network failure | Disconnect network, click Install | Error dialog, manifest not written |  | PASS / FAIL |
| Cancel folder picker | Click Install, then cancel picker | Returns to welcome dialog |  | PASS / FAIL |
| Docker locked files | Docker running, attempt uninstall | Error dialog with locked path |  | PASS / FAIL |

---

## Part 4: Linux Launcher (D-03)

**Tests the Linux PyInstaller binary built by the Launcher (Linux) workflow.**

### Preflight

- [ ] Downloaded `bibliogon-launcher` artifact from the GitHub Actions run
- [ ] Downloaded `bibliogon-launcher.sha256` alongside
- [ ] Verified SHA256: `sha256sum bibliogon-launcher` matches the hex string in `.sha256`
- [ ] Made executable: `chmod +x bibliogon-launcher`

### Happy-Path Test Results

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| First run (no manifest) | Welcome dialog appears (no crash) |  | PASS / FAIL |
| Install guide button | Browser opens to launcher help page |  | PASS / FAIL |
| Close button | Launcher exits cleanly, return code 0 |  | PASS / FAIL |
| Install flow: folder picker | Tkinter folder picker opens with default `~/bibliogon` |  | PASS / FAIL |
| Install flow: download | Progress shown, ZIP downloaded, extracted |  | PASS / FAIL |
| Install flow: Docker build | `docker compose up --build -d` runs, progress visible |  | PASS / FAIL |
| Install flow: browser open | Default browser opens at `http://localhost:7880`, Dashboard loads |  | PASS / FAIL |
| Manifest written | `~/.config/bibliogon/install.json` exists with correct content |  | PASS / FAIL |
| Second run (manifest present) | Main UI appears with Uninstall button |  | PASS / FAIL |
| Uninstall: confirmation | Dialog shows install path, Cancel/Uninstall buttons |  | PASS / FAIL |
| Uninstall: Docker cleanup | Stack stopped, volumes + images removed |  | PASS / FAIL |
| Uninstall: dir removal | Install directory deleted |  | PASS / FAIL |
| Uninstall: UI transition | Welcome dialog returns, no Uninstall button |  | PASS / FAIL |

### Linux-specific Edge Cases

| Step | Setup | Expected | Observed | Status |
|------|-------|----------|----------|--------|
| No tkinter system package | Rare on end-user systems, but test on minimal container | Binary fails with libtk error; document required package (`sudo apt install python3-tk`) |  | PASS / FAIL / N/A |
| Docker via rootless/podman | Run with podman-docker alias | Compose commands succeed or show clear error |  | PASS / FAIL / N/A |
| Wayland session | Launch from GNOME/KDE on Wayland | Tkinter renders via XWayland fallback |  | PASS / FAIL |

---

## Issues Found

- None / List any bugs or UX problems:

## Log Excerpts

Attach relevant sections of `%APPDATA%\Bibliogon\launcher.log` for any failing step.

```
```

## Decision

- [ ] Part 1: Install path verified, no Docker build errors
- [ ] Part 2: D-01 launcher happy path passes
- [ ] Part 2: D-01 failure paths pass
- [ ] Part 3: Install flow works (download, extract, manifest, start)
- [ ] Part 3: Uninstall flow works (confirm, remove, manifest delete)
- [ ] Part 3: Edge cases handled (missing dir, network failure, cancel)
- [ ] Part 4: Linux launcher binary runs, install/uninstall flow works
- [ ] D-01 marked `[x]` in ROADMAP, launcher ready for release asset
- [ ] Issues require iteration (listed above)
