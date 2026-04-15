# D-01 Manual Smoke Test - YYYY-MM-DD

Template for the Windows launcher smoke test. Copy this file into
place before each test run (e.g. `d01-launcher-smoke-test-2026-04-XX.md`),
fill in the fields, commit the filled-in copy. Keep this template
unchanged so future sessions have a clean start.

## Environment

- Windows version:
- Docker Desktop version:
- Bibliogon version (git tag or commit):
- Launcher version (from the .exe properties dialog):
- Launcher SHA256 (from the CI artifact or release asset):

## Preflight

- [ ] Downloaded `bibliogon-launcher.exe` from GitHub release or CI artifact
- [ ] Downloaded `bibliogon-launcher.exe.sha256` alongside
- [ ] Verified with PowerShell: `Get-FileHash -Algorithm SHA256 .\bibliogon-launcher.exe` matches the hex string in `.sha256`
- [ ] Bibliogon repo cloned at `%USERPROFILE%\bibliogon` (or custom path noted below)

## Test Results

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

## Failure-path scenarios

| Step | Setup | Expected | Observed | Status |
|------|-------|----------|----------|--------|
| Docker not running | Quit Docker Desktop, then launch | Dialog "Docker Desktop is not running" with Retry / Cancel |  | PASS / FAIL |
| Docker not installed | Temporarily rename `docker.exe` on PATH (restore after) | Dialog with docker.com install URL |  | PASS / FAIL |
| Port 7880 occupied | `python -m http.server 7880` in another terminal before launch | Dialog mentions the port value and points at `.env` |  | PASS / FAIL |
| Wrong repo path | Delete or rename the bibliogon folder before launch | First-run folder picker appears, rejecting folders without `docker-compose.prod.yml` |  | PASS / FAIL |
| Health check timeout | Break the backend (e.g. invalid env var in `.env`), launch | After 60s, dialog shows last 20 log lines with Retry / Cancel |  | PASS / FAIL |

## Issues found

- None / List any bugs or UX problems:

## Log excerpts

Attach relevant sections of `%APPDATA%\Bibliogon\launcher.log` for any failing step.

```
```

## Decision

- [ ] D-01 marked `[x]` in ROADMAP, launcher/tag ready for release asset attachment
- [ ] Issues require iteration before completion (list above, file a follow-up commit or issue)
