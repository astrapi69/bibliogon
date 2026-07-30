# Bibliogon Desktop Launcher - Specification

The Bibliogon desktop launcher starts the Docker stack, waits for health,
opens the browser, and stops the stack on exit - all from a single window,
with no `docker compose` typing.

Since #588 the launcher is **not** bespoke code. It is the published,
reusable **[`docker-app-launcher`](https://pypi.org/project/docker-app-launcher/)**
PyPI package (MIT, by Aster), the same library the sibling project
adaptive-learner uses. Bibliogon pins `docker-app-launcher = "^0.25.1"`
in `launcher/pyproject.toml` and supplies only **configuration**
(`launcher/launcher.json`) and a three-responsibility wrapper; all
behaviour - the persistent window, the Docker-first flow, the CLI verbs,
and i18n - lives in the library.

Notable library behaviour by bump:

Since the 0.19.0 bump:

- **Second launch focuses the running window** (upstream #31): with
  `single_instance: true`, starting the launcher while an instance runs
  brings the existing window to the foreground instead of exiting
  silently or opening a duplicate.
- **Keyboard accessibility** (upstream #31): the window's controls are
  reachable and operable via keyboard (focus traversal + activation).
- **Hard error on a missing `--config`** (upstream #32): a `--config`
  path that does not exist aborts with a clear error instead of falling
  back to defaults. The Bibliogon wrapper always injects a
  `launcher.json` resolved from `__file__`, so this is a defensive
  guarantee, not a behaviour change for end users.

Since the 0.25.1 bump:

- **Force-recreate on every compose start** (upstream 0.24.0): on some
  Compose generations an app update built the new image but silently
  kept the OLD container running (health answered from the old one).
  The launcher now force-recreates deterministically - the fix that
  motivated this bump for Bibliogon's compose mode.
- **One-step update** (upstream #92): `--update` CLI verb + a GUI
  Update button wrap stop, re-acquire (rebuild), start, health check;
  named volumes preserved; on a failed health check a rollback hint
  names the previous image.
- **`--doctor`** (upstream #75/#76): one diagnostic pass over config
  identity, daemon, toolchain, readiness blockers, port drift, and the
  real health probe; exit 0/1.
- **Live log follow in the GUI** (upstream #72): the App-logs button
  streams the running stack's logs into the log panel.
- **Operation lifecycle + concurrency guard** (upstream 0.25.0/#102):
  operations end in a defined idle state, are cancellable, and a
  PID-bound cross-process guard prevents a GUI and a CLI operation
  from touching the same container side by side.
- **Command transparency** (upstream #49): every external command is
  logged before it runs; failures report the first meaningful stderr
  line + exit code + the exact command.
- **Pre-build pre-flight** (upstream #61/#59/#63): advisory disk-space
  check and an up-front "install needs the network" warning with
  distinct network-failure classification; Snap-confinement detection
  logs a startup warning about non-snap-writable paths.
- **New deployment modes `dockerfile` + `image`** (upstream #51/#78):
  not used by Bibliogon - the compose mode stays; existing configs are
  unaffected by default.

> **System tray.** The optional minimize-to-tray feature needs the library's
> `tray` extra (pystray + a GTK backend), which on Linux pulls heavyweight
> system libraries and inflates the frozen binary ~6x. Bibliogon therefore
> ships **without** the tray extra; the window's close button closes the
> launcher. `tray_icon_path` stays in the config so the feature works for
> anyone who installs the extra manually (`pip install pystray`).

This document is the **configuration reference**. For end-user install
instructions see the per-platform help pages
(`docs/help/{en,de}/launcher-{linux,macos,windows}.md`).

## Layout

```
launcher/
├── launcher.json                     # the configuration (this document)
├── bibliogon_launcher/
│   ├── __init__.py                   # __version__ literal (sync-versions target)
│   └── __main__.py                   # thin wrapper -> docker_app_launcher
├── bibliogon-launcher.spec           # PyInstaller spec (bundles launcher.json)
├── bibliogon.ico / scripts/make_icon.py
└── tests/                            # thin integration tests
```

### The wrapper (`bibliogon_launcher/__main__.py`)

Has exactly three jobs, then delegates to `docker_app_launcher.__main__.main`:

1. **Resolve the compose directory** - probes `$BIBLIOGON_DIR`, the source
   checkout (repo root two levels up), then `~/bibliogon`; `chdir`s into the
   first that contains `docker-compose.prod.yml`. The library resolves the
   compose file and writes `.env` relative to the CWD, so the launcher must
   run with the repo as its working directory.
2. **Inject `--config launcher.json`** (resolved from `__file__`, so it works
   from any CWD and from the frozen bundle).
3. **Preserve `--version`** - prints `bibliogon_launcher <version>` (the app
   version, not the library's).

## `launcher.json`

Read at runtime by `docker_app_launcher.config.LauncherConfig.from_json()`.
The fields Bibliogon sets:

| Field | Value | Meaning |
|-------|-------|---------|
| `app_name` | `Bibliogon` | Display name (window title, dialogs). |
| `app_slug` | `bibliogon` | Lowercase id (artifact names). |
| `container_name` | `bibliogon` | Container-name filter for state detection. |
| `image_name` | `bibliogon` | Image-name filter for cleanup. |
| `compose_project` | `bibliogon` | `docker compose -p` project name. |
| `compose_file` | `docker-compose.prod.yml` | The stack the launcher manages. |
| `default_port` | `7880` | Host port when `.env` carries none. |
| `env_port_key` | `BIBLIOGON_PORT` | The `.env` key the port is written to (matches `${BIBLIOGON_PORT:-7880}` in the prod compose). |
| `health_check_path` | `/api/health` | Polled until ready. |
| `health_check_key` | `status` | JSON key checked in the health response. |
| `health_check_value` | `ok` | Expected value (`{"status": "ok"}`). |
| `browser_path` | `/` | Opened in the browser once healthy. |
| `icon_path` | `frontend/public/icon-192.png` | The Tk window icon (the #402 PWA icon set). Resolved CWD-relative; the wrapper `chdir`s to the repo root, so it resolves from a source checkout. PNG, not SVG (Tk cannot load SVG). Best-effort: a missing file is silently skipped. |
| `tray_icon_path` | `frontend/public/icon-192.png` | The system-tray icon; falls back to `icon_path`. Config-only unless the optional tray extra is installed (see below). |
| `config_dir` | `~/.config/bibliogon` | Where the launcher keeps its own state/logs. |
| `locale` | `auto` | UI language. `auto` detects the OS locale (the library ships 11 catalogs: de/en + 9 AI-translated); an in-window picker lets the user switch live. Resolved to the actual locale at load. |
| `single_instance` | `true` | A second launch focuses the running window instead of starting a duplicate (focus-existing since library 0.19.0, upstream #31). |
| `log_level` | `INFO` | Launcher log verbosity (`log_max_size` / `log_backup_count` cap the rotating log). |
| `repo_url` | `https://github.com/astrapi69/bibliogon` | Project link. |
| `releases_url` | `.../releases/latest` | Update-check + "new version" link. |
| `docs_url` | Docker-install help | Shown when Docker is missing. |
| `update_check_enabled` | `true` | Background GitHub-releases version check. |
| `app_version` | `0.59.0` | The app version. **Kept in sync by `make sync-versions`** (see below). |

`LauncherConfig` accepts more fields than Bibliogon sets (timeouts, window
size, `legacy_names`, `cleanup_configs`, lifecycle hooks, ...); unset fields
use the library defaults. See `docker_app_launcher.config.LauncherConfig` for
the full list. Bibliogon deliberately leaves `cleanup_configs`,
`cleanup_search_paths`, and `legacy_names` empty: the cleanup verb scans
`cleanup_search_paths` for `legacy_names` subdirectories, and that scan's
skip-list does **not** include the live data dir - so a path like
`~/.local/share` with `legacy_names: ["bibliogon"]` would offer the book-data
dir (`~/.local/share/bibliogon`) for deletion. Container/image cleanup via
`compose_project` is unaffected.

## CLI

The wrapper forwards every flag the library accepts:

```
python -m bibliogon_launcher            # GUI (persistent window)
python -m bibliogon_launcher --version  # app version, then exit
python -m bibliogon_launcher --debug    # GUI + verbose stdout logging
python -m bibliogon_launcher --check    # Docker status, then exit
python -m bibliogon_launcher --status   # app state (running/stopped/...), exit
python -m bibliogon_launcher --install  # build + start + health, then exit
python -m bibliogon_launcher --start    # start the stopped stack, then exit
python -m bibliogon_launcher --stop     # stop the running stack, then exit
python -m bibliogon_launcher --update   # stop + rebuild + start + health, then exit
python -m bibliogon_launcher --doctor   # full diagnostic pass, exit 0/1
python -m bibliogon_launcher --uninstall  # remove containers/images (keeps data)
python -m bibliogon_launcher --cleanup  # remove stale leftovers
python -m bibliogon_launcher --open     # open the browser, then exit
python -m bibliogon_launcher --port N   # override the host port
python -m bibliogon_launcher --log-level LEVEL  # override launcher log verbosity
```

## Build (PyInstaller)

`bibliogon-launcher.spec` builds a single-file binary. It:

- uses `bibliogon_launcher/__main__.py` as the entry point;
- bundles `launcher.json` at the bundle root;
- pulls the library's submodules via
  `docker_app_launcher.pyinstaller.build_info.hidden_imports()`;
- embeds the Windows icon + version metadata (win32 only) and builds the
  macOS `.app` bundle (whose `CFBundleVersion` is a `sync-versions` target).

```bash
make launcher           # run the launcher locally (logs to launcher/logs/)
make test-launcher      # run the integration tests
cd launcher && poetry run pyinstaller bibliogon-launcher.spec --clean --noconfirm
```

CI builds the binary on Linux/macOS/Windows
(`.github/workflows/launcher-*.yml`): install `python3-tk`, `poetry install`,
`pytest tests/`, then the spec build.

## Version sync

`app_version` in `launcher.json`, `__version__` in
`bibliogon_launcher/__init__.py`, the spec's `CFBundle*` plist entries, and
`launcher/pyproject.toml` all derive from the canonical
`backend/pyproject.toml` via `make sync-versions` (`scripts/sync_versions.py`).
`make sync-versions-check` and `scripts/verify_version_pins.sh` fail if any
drifts. Never hand-edit these launcher version values; bump
`backend/pyproject.toml` and run `make sync-versions`.

## Tests

`launcher/tests/test_launcher.py` keeps the suite thin (the library tests
its own internals):

- the entry point imports cleanly and exposes `main`;
- `--version` reports the app version;
- `--check` routes through the package;
- `launcher.json` parses into the expected `LauncherConfig`;
- a regression guard that no `adaptive-learner` identifier leaks into the
  launcher source, `launcher.json`, or the compose files.
