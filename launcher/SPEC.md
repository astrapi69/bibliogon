# Bibliogon Desktop Launcher - Specification

This document is the single source of truth for the Bibliogon launcher.

## Architecture: Actions + GUI + CLI

Three layers, strictly separated:

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Schicht 1 - Actions | `bibliogon_launcher/actions.py` | Pure Python, no tkinter. Each function takes simple params, returns a verified `(ok, detail)` tuple. Fully unit-tested. |
| Schicht 2 - GUI | `bibliogon_launcher/gui.py` (+ `tray.py`) | One persistent `tk.Tk` window. Thin renderer over actions. Pure helpers (`classify_port`, `buttons_for_state`) are unit-tested; the window is manually tested per `TESTPLAN.md`. |
| Schicht 3 - CLI | `bibliogon_launcher/cli.py` | argparse layer with one flag per GUI action. Delegates to actions. |
| Dispatcher | `bibliogon_launcher/__main__.py` | CLI flags -> `cli.run`; otherwise -> `gui.run` (imported lazily so the CLI runs without tkinter). |

Engine modules reused by all layers: `docker`, `config`, `health`,
`installer`, `cleanup`, `manifest`, `settings`, `i18n`, `lockfile`,
`update_check`.

## Grundprinzip: one persistent window

ONE window. Opens on start. Never closes itself. Everything happens IN
this window: Docker check, state, install, progress, errors, success,
management. No dialog opens another dialog; no window closes another
window.

Forbidden in GUI code: programmatic `destroy()` / `quit()` / `close()`,
except the user's `WM_DELETE_WINDOW` (X button) and the tray "Quit"
action. The X button minimizes to the system tray while Bibliogon is
running (when pystray is available); otherwise it closes the launcher.

## Actions API (Schicht 1)

```python
check_docker() -> tuple[bool, str]
get_state(project) -> str                  # no_docker|not_installed|running|stopped
check_port(port) -> tuple[bool, str]
find_free_port(start) -> tuple[bool, int, str]
install(compose_file, project, port) -> tuple[bool, str]
start(compose_file, project) -> tuple[bool, str]
stop(project) -> tuple[bool, str]
uninstall(project) -> tuple[bool, str]
health_check(port, path, timeout) -> tuple[bool, str]
open_browser(port, path) -> None
get_version() -> str
load_config(path) -> dict
save_config(path, config) -> None
set_port(path, port) -> tuple[bool, str]
```

Plus `set_repo_port(repo, port)` (writes the `.env` port that Compose
maps) and `resolve_compose_file()` / `source_checkout_repo()` (locate the
compose file - local checkout preferred, then manifest, then configured
repo). Every action verifies its result (install/start confirm a
container is actually running; stop confirms none is; uninstall reports
the exact failed steps and never claims "done" on failure).

## CLI <-> GUI parity (Schicht 3)

| Action | CLI | GUI |
|--------|-----|-----|
| Check Docker | `--check` | automatic on start |
| Status | `--status` | automatic on start |
| Install | `--install` | [Install] button |
| Start | `--start` | [Start] button |
| Stop | `--stop` | [Stop] button |
| Uninstall | `--uninstall` | [Uninstall] button |
| Open browser | `--open` | [Open browser] button |
| Set port | `--port 7880` | port field |
| Version | `--version` | footer (`v{version}`) |
| Debug | `--debug` | modifier; verbose logging to stdout + log file |

## Docker check first

On start the launcher checks Docker (installed + daemon running) before
anything else. The `no_docker` state shows the reason and a Re-check
button.

## Three states

- **not_installed**: status + editable port field + [Install].
- **running**: "running on port N" + read-only port (green indicator,
  "in use by Bibliogon") + [Open browser] [Stop] [Uninstall].
- **stopped**: status + editable port field + [Start] [Uninstall].

State changes update the buttons and text in place; the window stays
open.

## Port field

Editable when not installed / stopped, read-only while running. Live
validation: free (green), in use (red), in use by Bibliogon (green while
running), invalid range (red, `1024-65535`). Persisted to `launcher.json`
(`set_port`) and to the repo `.env` (`set_repo_port`). On conflict the
launcher can suggest the next free port (`find_free_port`).

## System tray

Optional `pystray` + `Pillow` extra: `pip install bibliogon-launcher[tray]`.
When Bibliogon is running and the tray is available, the X button hides
the window to the tray (tooltip "Bibliogon running on port N"); the tray
menu offers Open / Open browser / Stop / Quit. Without pystray the X
button closes the launcher. The import guard fails open (a headless
`pystray` import raising `Xlib.error.DisplayNameError` degrades to "no
tray", never a crash). The frozen PyInstaller binary excludes pystray.

## Uninstall

Confirmed in-window (no separate dialog), then the reusable
`cleanup.uninstall_bibliogon` runs with live per-step progress: stop
stack, remove volumes, remove images, remove install dir, remove
shortcuts, delete manifest, remove config dirs. A failed step is
reported as a failure - never "complete". The same teardown is available
headless via `--uninstall` and as standalone scripts
(`scripts/cleanup-bibliogon.{sh,ps1}`).

## Container identity

Everything is `bibliogon` (container/image/Compose project = `bibliogon`,
window title "Bibliogon", config dir `~/.bibliogon` / `%USERPROFILE%\.bibliogon`).
A regression test (`tests/test_management.py::TestNoForeignProjectReference`)
fails if any `adaptive-learner` reference leaks into the launcher modules
or the compose files.

## Docker / Compose

Compose project name `bibliogon` (passed as `-p` on every invocation).
Default port 7880. Compose file resolved from the local repo checkout
first (`docker-compose.prod.yml`), then the manifest install dir, then
the configured repo. The chosen port is written into `.env` before
`docker compose up`.

## Debug mode

`python -m bibliogon_launcher --debug` logs to stdout AND the rotating
log file (DEBUG level), with timestamps. Works with the GUI and CLI.

## Version

The launcher version is synced with the app version via
`make sync-versions`; never hardcoded. `actions.get_version()` returns
`bibliogon_launcher.__version__`.

## Tests

- `actions.py`: >= 5 tests per action (`tests/test_actions.py`).
- `cli.py`: full parity coverage (`tests/test_cli.py`).
- `gui.py` / `tray.py`: pure helpers (`tests/test_gui.py`); the window
  itself is manual (`TESTPLAN.md`).
- Engine modules keep their existing tests.

## Deliberate deviations from the original spec

- **Management dialog (#521)** is replaced by the single-window
  `running` state with its [Open browser] / [Stop] / [Uninstall]
  buttons, which is the spec's own "one window, no dialog opens a
  dialog" principle applied to the previously-separate management
  dialog.
- **`install(compose_file, project, port)`** operates on an existing
  compose file (set port -> build -> start). Acquiring Bibliogon for a
  first install (download a release ZIP when no local checkout exists)
  is orchestration handled by the GUI/CLI before calling `install`, so
  the action stays pure and testable.
- **`stop(project)` / `uninstall(project)`** take only the project name
  (`docker compose -p <project> down` needs no `-f` for a running
  project), matching the spec's signatures.
- **Welcome / settings / stale-target / management dialogs** from the
  previous launcher are intentionally dropped: each opened a second
  window, which the single-window principle forbids. The non-blocking
  startup behaviours that fit one window are kept (silent
  retry-pending-cleanup, single-instance lock).
- **i18n**: 16 new single-window keys are added across all 8 catalogs;
  EN/DE/ES/FR are translated, EL/PT/TR/JA carry the English fallback
  pending a native-speaker pass (PT/TR/JA are already flagged pending).
