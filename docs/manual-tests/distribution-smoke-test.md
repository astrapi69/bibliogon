# Distribution Smoke Test - YYYY-MM-DD

Combined smoke test covering the full distribution surface:
- Part 1: `install.sh` (all platforms, curl pipe)
- Part 2: D-01 Windows launcher basic flow
- Part 3: Launcher install/uninstall + cleanup retry + activity log
- Part 4: D-03 Linux PyInstaller binary
- Part 5: D-02 macOS `.app` bundle
- Part 6: `uninstall.sh` script (all platforms)

Copy this file before each test run (e.g.
`distribution-smoke-test-2026-04-XX.md`), fill in the fields,
commit the filled-in copy. Keep this template unchanged.

Not every part applies to every test session. Fill only the parts
relevant to the platform / artifact being tested and mark the rest
`N/A` in the Decision checklist at the bottom.

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

### Interrupted Uninstall Retry

Tests the cleanup.json persistence + retry logic (commit d75ec87 + a81e75a).

| Step | Setup | Expected | Observed | Status |
|------|-------|----------|----------|--------|
| Mid-uninstall kill | Click Uninstall, kill launcher process during Docker cleanup | cleanup.json exists in `%APPDATA%\bibliogon\` with partial step states |  | PASS / FAIL |
| Relaunch after kill | Start launcher again | Silent retry of remaining steps, no user-facing dialog |  | PASS / FAIL |
| Full cleanup | All steps complete after retry | cleanup.json deleted, install UI appears |  | PASS / FAIL |
| rmtree still fails | Make install_dir read-only between runs | One-time warning dialog, cleanup.json retained |  | PASS / FAIL |

### Activity Log Verification

Tests the `install.log` produced by the launcher (commit 1a44529).

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| Log exists after first launch | `%APPDATA%\bibliogon\install.log` created |  | PASS / FAIL |
| Install events logged | Each step (download, extract, manifest, Docker up) has an ISO-timestamped line |  | PASS / FAIL |
| Uninstall events logged | Each cleanup step has its own line |  | PASS / FAIL |
| Error events logged | Failed Docker cleanup step appears at ERROR level |  | PASS / FAIL |
| Log rotates | When log exceeds ~1 MB, `install.log.1` appears and a fresh `install.log` is started |  | PASS / FAIL |

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

## Part 5: macOS Launcher (.app bundle)

**Tests the macOS .app bundle built by the Launcher (macOS) workflow.**

### Prerequisites

- Apple Silicon Mac (arm64), macOS 13 or later
- Docker Desktop for Mac installed and running
- No existing Bibliogon installation (clean state)

### Preflight

- [ ] Downloaded `bibliogon-launcher-macos.zip` from the GitHub Actions run
- [ ] Downloaded `bibliogon-launcher-macos.zip.sha256` alongside
- [ ] Verified SHA256: `shasum -a 256 bibliogon-launcher-macos.zip` matches
- [ ] Unzipped: `Bibliogon Launcher.app` appears in Finder
- [ ] Optionally dragged the `.app` to `/Applications/`

### Happy-Path Test Results

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| First launch (double-click) | Gatekeeper blocks with "unidentified developer" dialog |  | PASS / FAIL |
| Gatekeeper bypass | Right-click -> Open, then "Open" in the second dialog. Launcher starts. |  | PASS / FAIL |
| Welcome dialog | Appears (no crash) |  | PASS / FAIL |
| Install guide button | Browser opens to launcher help page |  | PASS / FAIL |
| Close button | Launcher exits cleanly |  | PASS / FAIL |
| Install flow: folder picker | macOS folder picker opens with default `~/bibliogon` |  | PASS / FAIL |
| Install flow: download | Progress shown, ZIP downloaded, extracted |  | PASS / FAIL |
| Install flow: Docker build | `docker compose up --build -d` runs, progress visible |  | PASS / FAIL |
| Install flow: browser open | Default browser opens at `http://localhost:7880`, Dashboard loads |  | PASS / FAIL |
| Manifest written | `~/Library/Application Support/bibliogon/install.json` exists |  | PASS / FAIL |
| Activity log written | `~/Library/Application Support/bibliogon/install.log` exists |  | PASS / FAIL |
| Second launch | No Gatekeeper dialog, main UI appears, Uninstall button visible |  | PASS / FAIL |
| Uninstall: confirmation | Dialog shows install path, Cancel/Uninstall buttons |  | PASS / FAIL |
| Uninstall: Docker cleanup | Stack stopped, volumes + images removed |  | PASS / FAIL |
| Uninstall: dir removal | Install directory deleted |  | PASS / FAIL |
| Uninstall: UI transition | Welcome dialog returns, no Uninstall button |  | PASS / FAIL |

### macOS-specific Edge Cases

| Step | Setup | Expected | Observed | Status |
|------|-------|----------|----------|--------|
| App in /Applications | Move .app to /Applications, launch from Launchpad | Works the same as from any location |  | PASS / FAIL |
| App quarantined | Download fresh (preserves xattr com.apple.quarantine) | First-launch right-click -> Open flow still works |  | PASS / FAIL |
| Docker Desktop not running | Quit Docker Desktop, launch installer | Error dialog with docker.com install URL |  | PASS / FAIL |
| Spotlight search | Cmd+Space -> "Bibliogon Launcher" | App indexed, appears in Spotlight |  | PASS / FAIL |

### Known limitations (initial D-02)

- **arm64 only:** Apple Silicon Macs (M1/M2/M3/M4). Intel Macs are not supported in this build. Tracking as optional follow-up.
- **Unsigned:** Gatekeeper bypass required on first launch. Code signing + notarization require an Apple Developer account.
- **ZIP distribution:** no DMG. User unzips and drags .app to /Applications manually.
- **No tkinter system deps:** unlike Linux, macOS Python ships with tkinter built-in. No extra setup needed.

---

## Part 6: uninstall.sh Script (all platforms)

**Tests the shell-based uninstall path (alternative to launcher UI uninstall).**
Relevant when the launcher was never installed, when the user prefers a terminal
workflow, or on platforms where no launcher binary exists yet.

### Prerequisites

- [ ] Bibliogon installed via `install.sh` or by the launcher
- [ ] Bibliogon stack currently running OR stopped - both states must work
- [ ] Some books and chapters exist (to verify the warning is taken seriously)

### Run the script

```bash
cd ~/bibliogon
bash uninstall.sh
```

### Test Results

| Step | Expected | Observed | Status |
|------|----------|----------|--------|
| Warning banner | Red ASCII banner listing everything that will be removed |  | PASS / FAIL |
| Confirmation prompt | `Type 'yes' to confirm uninstall:` |  | PASS / FAIL |
| Abort on wrong input | Typing anything other than "yes" prints "Uninstall cancelled." and exits 0 with nothing removed |  | PASS / FAIL |
| Proceed on "yes" | Typing `yes` starts the sequence |  | PASS / FAIL |
| Stack stopped | `docker compose down` runs; no container remains |  | PASS / FAIL |
| Volumes removed | `docker volume ls \| grep bibliogon` returns nothing |  | PASS / FAIL |
| Images removed | `docker images \| grep bibliogon` returns nothing |  | PASS / FAIL |
| Manifest removed | Launcher manifest directory deleted at platform path |  | PASS / FAIL |
| Install directory removed | `~/bibliogon` no longer exists |  | PASS / FAIL |
| Summary printed | Green success banner with reinstall command |  | PASS / FAIL |

### Platform-specific manifest path

Verify the correct path was removed:

| Platform | Path |
|----------|------|
| Linux | `~/.config/bibliogon/` |
| macOS | `~/Library/Application Support/bibliogon/` |
| Windows Git Bash | `%APPDATA%/bibliogon/` and (legacy) `%APPDATA%/Bibliogon/` |

### Edge Cases

| Step | Setup | Expected | Observed | Status |
|------|-------|----------|----------|--------|
| No Docker running | Stop Docker Desktop, run script | Non-fatal: `compose down` errors silently, volumes/images steps skip |  | PASS / FAIL |
| No install dir | Already uninstalled, run `uninstall.sh` from old path | Script fails at `cd` - expected, no partial state |  | PASS / FAIL |
| POSIX sh only | Run with `sh uninstall.sh` (not bash) | Script completes without bashism errors |  | PASS / FAIL |

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
- [ ] Part 5: macOS .app bundle runs (Gatekeeper bypass), install/uninstall flow works
- [ ] Part 6: uninstall.sh script removes everything cleanly on target platform
- [ ] D-01 marked `[x]` in ROADMAP, launcher ready for release asset
- [ ] Issues require iteration (listed above)
