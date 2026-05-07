# Architecture overview

This page is a distilled, outside-reader view of how Bibliogon is structured. The internal source-of-truth lives in [`.claude/rules/architecture.md`](https://github.com/astrapi69/bibliogon/blob/main/.claude/rules/architecture.md) and the per-component README files; this page lifts the parts external contributors should know to navigate the codebase without having to read every internal rule.

## Four layers

```
1. Frontend        React 19 + TypeScript + TipTap + Vite 8 (Rolldown)
2. Backend         FastAPI + SQLAlchemy + SQLite + Pydantic v2
3. PluginForge     External PyPI package (pluginforge ^0.5.0), based on pluggy
4. Plugins         Standalone Python packages, registered via entry points
```

New features go into a plugin unless they touch Book/Chapter CRUD, the editor base, backup/restore, or the UI shell — those are the core responsibilities. Everything else is a plugin.

## Two repositories

| Repository | Purpose | License |
|------------|---------|---------|
| [astrapi69/pluginforge](https://github.com/astrapi69/pluginforge) | Application-agnostic plugin framework, built on pluggy. Has its own release cycle. | MIT |
| [astrapi69/bibliogon](https://github.com/astrapi69/bibliogon) | This repo. Book + article authoring platform. Pins `pluginforge ^0.5.0`. | MIT |

PluginForge changes are a separate codebase + a separate release. Do not edit PluginForge from inside Bibliogon — open a PR against the PluginForge repo and bump the pin here when it ships.

## Backend

### Layout

```
backend/app/
  main.py                # FastAPI app + lifespan + global exception handler
  paths.py               # Single source of truth for filesystem paths (data, uploads, db)
  hookspecs.py           # PluginForge hook specifications
  exceptions.py          # BibliogonError hierarchy
  models/                # SQLAlchemy 2.0 mapped classes (Book, Chapter, Asset, ...)
  routers/               # FastAPI routers (one per resource)
  config/                # YAML configs (app.yaml, plugins/*.yaml, i18n/*.yaml)
```

### Rules

- **Pydantic v2** for every request/response schema.
- **SQLAlchemy 2.0 mapped columns** for models.
- **Routers stay thin**: validate input, call a service, return the response. No business logic.
- **Services throw `BibliogonError` subclasses**, never `HTTPException`. The global exception handler in `main.py` maps each subclass to an HTTP status code (`NotFoundError` → 404, `ValidationError` → 400, `ConflictError` → 409, `ExportError`/`PluginError` → 500, `ExternalServiceError` → 502).
- **Frontend never bypasses the API client.** Every `fetch` call routes through `frontend/src/api/client.ts`; bare `fetch("/api/...")` calls in components are a documented anti-pattern.
- **Config via YAML**, not hardcoded values. Plugin settings live in `backend/config/plugins/{name}.yaml`.

## Plugins

### Structure per plugin

```
plugins/bibliogon-plugin-{name}/
  bibliogon_{name}/
    plugin.py          # {Name}Plugin(BasePlugin) — hook implementations
    routes.py          # FastAPI router (delegates to service functions)
    {module}.py        # business logic (no FastAPI imports)
  tests/
    test_{name}.py     # pytest tests
  pyproject.toml       # entry point: [project.entry-points."bibliogon.plugins"]
```

### Conventions

- Plugin class inherits from `pluginforge.BasePlugin`.
- `depends_on` is a class attribute (e.g. `depends_on = ["export"]`).
- `license_tier = "core"` for all plugins today (licensing infrastructure exists but is dormant; `LICENSING_ENABLED = False` in `backend/app/licensing.py`).
- Hook specs are versioned (`api_version = 1`) in `backend/app/hookspecs.py`. Bump the version when adding a hook spec; existing plugins keep working until they explicitly opt into the new spec.
- Plugin packages: `bibliogon-plugin-{name}` (kebab-case). Inner package: `bibliogon_{name}` (snake_case).

### Plugin install via ZIP

Third-party plugins ship as a ZIP through Settings → Plugins. The ZIP must contain `plugin.yaml` and a Python package with `plugin.py`. The installer extracts to `plugins/installed/{name}/` and writes the config to `config/plugins/{name}.yaml`. Plugin name validation rejects anything that is not lowercase letters, digits, hyphens, and a path-traversal check rejects malicious ZIPs.

For the full plugin authoring flow including hooks, lifecycle, and packaging, see the [Plugin Developer Guide](plugins.md).

## Frontend

### UI strategy

| Library | Purpose |
|---------|---------|
| Radix UI | Unstyled accessible primitives (Dialog, Tabs, Dropdown, Select, Tooltip) |
| @dnd-kit | Drag-and-drop (chapter sorting, list reordering) |
| TipTap | WYSIWYG/Markdown editor (StarterKit + 15 extensions + 1 community) |
| Lucide React | Icons |
| react-toastify | Toast notifications |

Rejected: shadcn/ui (Tailwind-only), MUI (too opinionated), Ant Design (too heavy).

### Theming

Three themes (Warm Literary, Cool Modern, Nord) × Light + Dark = 6 variants. Everything goes through CSS variables in `frontend/src/styles/global.css`. New UI elements MUST use CSS variables; hardcoded `#fff` etc. is a documented bug class.

### Plugin UI (manifest-driven)

Plugins declare UI extensions via `get_frontend_manifest()`. The frontend queries `/api/plugins/manifests` at startup and inserts plugin UI into predefined slots:

| Slot | Location |
|------|----------|
| `sidebar_actions` | BookEditor sidebar |
| `toolbar_buttons` | Editor toolbar |
| `editor_panels` | Next to the editor |
| `settings_section` | Settings → Plugins |
| `export_options` | Export dialog |

For complex plugin UIs, plugins can ship a compiled JS bundle as a Web Component (custom element) inside the ZIP.

### Storage format

TipTap JSON is the storage format — **not** HTML, **not** Markdown. Markdown is only an editor input/display mode; conversion (JSON ↔ Markdown ↔ HTML) is the export plugin's job. The DB column is `Chapter.content`.

### State management

React state + props today. No global state library (Redux, Zustand, etc.). If global state ever becomes necessary, the documented choice is Zustand, not Redux.

## Data flow

```
UI (React) -> API client -> FastAPI router -> service/plugin -> SQLAlchemy -> SQLite
```

Unidirectional. Routers never reach into the DB directly. Frontend code never appears in the backend. Services never know about HTTP.

## Persistence

- **Backend**: SQLAlchemy + SQLite. Single-writer; minimize writes, batch where possible.
- **Frontend**: no local persistence for book data. Everything goes through the API. IndexedDB is used only for the autosave recovery draft (chapter edits while disconnected).
- **Assets**: filesystem under the data directory; served via `/api/assets/`.
- **Backups**: `.bgb` ZIP files containing the DB + assets + audiobook MP3s (optional).
- **Project import**: `.bgp` ZIP files following the write-book-template structure.

### Filesystem layout

Production data lives **outside** the project tree. Resolution order is:

1. `BIBLIOGON_DATA_DIR` env var (highest priority — used in tests, Docker, admin overrides)
2. `platformdirs.user_data_dir("bibliogon")`:
   - Linux/macOS: `~/.local/share/bibliogon/`
   - Windows: `%LOCALAPPDATA%\bibliogon\`
3. Tests: a `tmp_path_factory`-managed dir, set by `backend/tests/conftest.py` before any `app.*` import.

Two tripwires guard against tests touching production data:

- A `.bibliogon-production` marker file written by the FastAPI lifespan. If any test ever sees it, the entire test run aborts with `pytest.exit(returncode=2)`.
- `BIBLIOGON_TEST=1` + `TEST_DATABASE_URL=sqlite:///:memory:` set before the first `app.*` import.

If `make test` ever exits with code 2, do **not** delete the marker — investigate why a test pointed at production. The April 2026 data-loss incident is the origin of both tripwires.

## Error handling

```
Frontend       Catches ApiError -> toast + "Report issue" button on 5xx
API client     Converts HTTP errors to ApiError. The only place fetch() lives.
Router         Thin. Catches nothing. Global exception handler maps.
Service        Throws BibliogonError subclasses. No HTTP awareness.
Plugin         Throws PluginError(plugin_name, message).
External       ExternalServiceError(service, message) for Pandoc/TTS/LanguageTool.
```

Each layer handles only what it can; everything else flows up. The global exception handler in `backend/app/main.py` maps `BibliogonError` subclasses to HTTP status codes, includes a stacktrace in the response when `BIBLIOGON_DEBUG=true`, and logs everything ≥ 500 with `exc_info=True`.

The frontend `ApiError` carries `status`, `detail`, and (in debug mode) `traceback`. On 5xx, the toast offers a "Report issue" button that opens a pre-filled GitHub Issue with the stacktrace, browser info, and app version. Generic error messages like "Export failed" without details are forbidden — they make GitHub Issues worthless.

## Tests

- **Backend**: pytest. Plugin tests in `plugins/{name}/tests/`.
- **Frontend**: Vitest (happy-dom).
- **E2E**: Playwright. Smoke specs in `e2e/smoke/`, full regression in `e2e/full/`.
- **Mutation**: mutmut (Python) + Stryker (TypeScript) — set up but not yet wired into CI.
- **Coverage**: opt-in (`make test-coverage`). CI runs it on every push and uploads HTML reports as GitHub Actions artifacts.

`make test` covers backend + plugins + Vitest, no coverage. Must stay green after every change.

## Versioning

The whole monorepo ships in lock-step at every release. Only one file is hand-edited at release time: `backend/pyproject.toml`. Everything else propagates via `make sync-versions` (frontend `package.json`, launcher pyproject + spec plist + `__init__.py`, all 10 plugin pyprojects, `install.sh` + `install.ps1` regenerated from templates). `verify_version_pins.sh` enforces lock-step at CI; deviations block the release. See [Contributing](contributing.md) for the release workflow.

## Offline / local-first

- SQLite by default — no external DB required.
- Assets local on the filesystem.
- Frontend is plain static files served by nginx in the Docker production setup.
- License validation is offline (signed keys; no license server). Currently dormant.
- Exception: plugins with external APIs (TTS, LanguageTool, AI providers) need network access.

## Related projects

- [pluginforge](https://github.com/astrapi69/pluginforge) — the plugin framework (PyPI). Bibliogon-agnostic, MIT.
- [manuscripta](https://github.com/astrapi69/manuscripta) — the book export pipeline (PyPI). Wraps Pandoc + the write-book-template scaffolder + TTS adapters.
- [write-book-template](https://github.com/astrapi69/write-book-template) — the on-disk project structure that manuscripta consumes.

> Last verified for v0.29.0 (2026-05-07).
