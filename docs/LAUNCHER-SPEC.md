# Bibliogon Desktop Launcher - Specification

The Bibliogon desktop launcher starts the Docker stack, waits for health,
opens the browser, and stops the stack on exit - all from a single window,
with no `docker compose` typing.

Since #588 the launcher is **not** bespoke code. It is the published,
reusable **[`docker-app-launcher`](https://pypi.org/project/docker-app-launcher/)**
PyPI package (MIT, by Aster), the same library the sibling project
adaptive-learner uses. Bibliogon supplies only **configuration**
(`launcher/launcher.json`) and a three-responsibility wrapper; all
behaviour - the persistent window, the Docker-first flow, the CLI verbs,
and i18n - lives in the library.

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
| `locale` | `de` | Default UI language (the library ships DE/EN). |
| `repo_url` | `https://github.com/astrapi69/bibliogon` | Project link. |
| `releases_url` | `.../releases/latest` | Update-check + "new version" link. |
| `docs_url` | Docker-install help | Shown when Docker is missing. |
| `update_check_enabled` | `true` | Background GitHub-releases version check. |
| `app_version` | `0.57.0` | The app version. **Kept in sync by `make sync-versions`** (see below). |

`LauncherConfig` accepts more fields than Bibliogon sets (timeouts, window
size, `legacy_names`, `cleanup_configs`, lifecycle hooks, ...); unset fields
use the library defaults. See `docker_app_launcher.config.LauncherConfig` for
the full list. Bibliogon deliberately omits `cleanup_configs` so the cleanup
verb never targets the live data dir (`~/.local/share/bibliogon`, where book
data lives).

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
python -m bibliogon_launcher --uninstall  # remove containers/images (keeps data)
python -m bibliogon_launcher --cleanup  # remove stale leftovers
python -m bibliogon_launcher --open     # open the browser, then exit
python -m bibliogon_launcher --port N   # override the host port
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
