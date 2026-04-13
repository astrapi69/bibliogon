# Architecture rules

## Layered architecture (4 layers, ALWAYS respected)

```
1. Frontend        React 18 + TypeScript + TipTap + Vite
2. Backend         FastAPI + SQLAlchemy + SQLite + Pydantic v2
3. PluginForge     External PyPI package (pluginforge ^0.5.0), based on pluggy
4. Plugins         Standalone packages, registered via entry points
```

New features ALWAYS belong in a plugin, unless they touch the core (Book/Chapter CRUD, editor base functionality, backup/restore, UI shell).

## Two repositories

| Repo | Purpose | License |
|------|---------|---------|
| `pluginforge` | Application-agnostic plugin framework (PyPI) | MIT |
| `bibliogon` | Book authoring platform, uses PluginForge | MIT (all plugins free during development) |

PluginForge is EXTERNAL. Changes to PluginForge are a separate repo and a separate release cycle. Bibliogon pins `pluginforge ^0.5.0`.

## Backend (Python/FastAPI)

### Structure per plugin

```
plugins/bibliogon-plugin-{name}/
  bibliogon_{name}/
    plugin.py          # {Name}Plugin(BasePlugin), hook implementations
    routes.py          # FastAPI router (delegates to service functions)
    {module}.py        # business logic (no FastAPI code here)
  tests/
    test_{name}.py     # pytest tests
  pyproject.toml       # entry point: [project.entry-points."bibliogon.plugins"]
```

### Rules

- Plugin class inherits from BasePlugin (pluginforge).
- Business logic in its own modules, NOT in routes.py.
- routes.py contains only FastAPI endpoints that delegate to service functions.
- Hook specs live in backend/app/hookspecs.py. Define new hooks there, with api_version.
- Pydantic v2 for all request/response schemas.
- SQLAlchemy models in backend/app/models/.
- Configuration via YAML (backend/config/plugins/{name}.yaml), NOT hardcoded.
- Extend i18n strings in backend/config/i18n/{lang}.yaml (5 languages: DE, EN, ES, FR, EL).
- Plugin dependencies as a class attribute: `depends_on = ["export"]`.
- Proprietary plugins need a license check via the pre_activate callback.
- MIT plugins (export, help, getstarted) are free, no license check.

### Plugin installation (ZIP)

Third-party plugins are installed as a ZIP through Settings > Plugins:
1. The ZIP must contain: plugin.yaml, a Python package with plugin.py
2. Extraction to plugins/installed/{name}/
3. Config to config/plugins/{name}.yaml
4. Dynamic registration via sys.path + PluginManager
5. Plugin names: lowercase letters, digits, hyphens only
6. Path traversal check on ZIP paths

### Licensing

- Bibliogon-specific, NOT part of PluginForge.
- Code in backend/app/licensing.py.
- HMAC-SHA256 signed license keys, offline-validatable.
- Licenses in config/licenses.json, managed through the Settings UI.
- Format: BIBLIOGON-{PLUGIN}-v{N}-{base64 payload}.{base64 signature}

## Frontend (React/TypeScript)

### UI component strategy

| Library | Purpose |
|---------|---------|
| Radix UI | Unstyled accessible primitives (Dialog, Tabs, Dropdown, Select, Tooltip) |
| @dnd-kit | Drag-and-drop (chapter sorting, list reordering) |
| TipTap | WYSIWYG/Markdown editor (StarterKit + 15 extensions) |
| Lucide React | Icons |
| react-toastify | Toast notifications |

Rejected: shadcn/ui (requires Tailwind), MUI (too opinionated), Ant Design (too heavy).

### Theming

- 3 themes: Warm Literary, Cool Modern, Nord (each with Light + Dark = 6 variants).
- Everything via CSS variables. New UI elements MUST use CSS variables.
- No Tailwind. Custom properties in frontend/src/styles/global.css.

### Plugin UI (manifest-driven)

Plugins declare UI extensions via get_frontend_manifest(). The frontend queries /api/plugins/manifests.

Predefined UI slots:

| Slot | Location |
|------|----------|
| sidebar_actions | BookEditor sidebar |
| toolbar_buttons | Editor toolbar |
| editor_panels | Next to the editor |
| settings_section | Settings > Plugins |
| export_options | ExportDialog |

For complex plugin UIs: Web Components as custom elements (compiled JS bundle in the plugin ZIP).

### TipTap editor

- 15 official extensions + 1 community (Figure/Figcaption).
- 24 toolbar buttons.
- Before writing custom code, ALWAYS check whether an official TipTap extension exists.
- See lessons-learned.md for known TipTap pitfalls.

### Component structure

- Pages in frontend/src/pages/ (Dashboard, BookEditor, Settings, Help, GetStarted).
- Shared components in frontend/src/components/.
- API calls ONLY through frontend/src/api/client.ts, never fetch() directly in components.

### UX patterns for forms

- **Stepped modal** for creation dialogs: step 1 shows only required fields, step 2 is collapsible (Radix Collapsible, "More details") for optional fields.
- **Reason:** modals stay compact for quick creation, optional fields don't clutter it.
- **Example:** CreateBookModal - step 1: title, author (required only). Step 2: genre, subtitle, language, series.
- **Collapsible:** Radix Collapsible (@radix-ui/react-collapsible) for expandable sections in modals. Collapsed when opened.
- **Input fields with suggestions:** `<input>` + `<datalist>` for free text with dropdown suggestions (e.g. genre). No hard select when custom values should be possible.
- **Conditional fields:** checkbox toggle for optional groups (e.g. "Part of a series" -> series name + index). Values are reset when deactivated.
- **No dedicated page** for simple creation workflows. A modal is enough up to ~8 fields.

### State management

- Current: React state + props. No global state management.
- If global state becomes necessary: introduce Zustand, NOT Redux.
- Stores communicate through events or callbacks, not through direct imports.

## Internal storage format

- TipTap JSON is the storage format. NOT HTML, NOT Markdown.
- Markdown is only a display/input mode in the editor.
- Conversion (JSON -> Markdown, JSON -> HTML) is a plugin responsibility (export plugin).
- TipTap JSON in the DB: Chapter.content field.

## Persistence

- Backend: SQLAlchemy + SQLite (phase 11 switches to PostgreSQL).
- Frontend: no local storage for book data. Everything via the API.
- Assets: local on the filesystem, managed through /api/assets/.
- Backup: .bgb files (ZIP), restore brings the entire state back.
- Project import: .bgp files (write-book-template ZIP).

## Data flow

```
UI (React) -> API client -> FastAPI router -> service/plugin -> SQLAlchemy -> SQLite
```

Unidirectional. No direct DB access from routers. No frontend code in the backend.

## Error handling

```
Frontend       ApiError (status + detail) -> toast for the user
API client     HTTP error -> converted to ApiError
Router         Thin, catches nothing. Global exception handler maps.
Service        Throws BibliogonError subclasses (NotFoundError, ExportError, ...)
Plugin         Throws PluginError(plugin_name, message)
External       ExternalServiceError(service, message) for Pandoc/TTS/LanguageTool
```

Services NEVER throw HTTPException, routers catch NOTHING. The global exception handler in main.py maps BibliogonError subclasses to HTTP status codes. See code-hygiene.md "Error handling architecture" for details.

## Plugin package versions

Plugin versions are independent of the app version. A plugin is bumped only when the plugin itself changed, not on every app release. Concretely:

- No forced bump of every `plugins/bibliogon-plugin-*/pyproject.toml` on an app release
- Plugin versions stay at `1.0.0` until there is a real reason to raise them (new hook version, breaking change in the plugin API, ...)
- The app version bump only touches `backend/pyproject.toml`, `frontend/package.json` and optionally `backend/app/__init__.py`
- Plugin changes are recorded in the app CHANGELOG, but the plugin version string stays unchanged

Reason: plugins have their own lifecycles, and trial keys / license keys are bound to the plugin name, not to the version. A bump without a change would only create noise.

## Plugin settings visibility

Every plugin setting in `config/plugins/*.yaml` MUST either:

1. Be editable in the plugin UI (Settings > Plugins > {plugin name}), OR
2. Be marked with a `# INTERNAL` comment to signal that it can only be edited via YAML.

Hidden settings that influence user behavior without a UI are forbidden. A setting that has a default value and changes how the app behaves MUST be visible and editable by the user.

Exceptions are allowed only for:
- Debug and development settings (marked `# INTERNAL`)
- Performance-tuning parameters that only power users should touch (marked `# INTERNAL` + comment)
- Initialization values or pipeline mappings that are not a user configuration target (e.g. Pandoc format mapping in `export.yaml`)

Dead settings (fields in the YAML that the code never reads) are forbidden. When adding a new setting, ALWAYS verify that the code reads it; when removing a feature, ALWAYS remove the corresponding YAML field with it.

Per-user vs per-book: settings that should vary between books do NOT belong in `config/plugins/*.yaml` but as a column on the Book model (examples: `Book.tts_engine`, `Book.audiobook_overwrite_existing`). Plugin-global YAML settings are only for values that must be the same for ALL books.

## Offline/local-first

- SQLite as the default (no external DB required).
- Assets local on the filesystem.
- Frontend deliverable as static files.
- License validation offline (signed keys, no license server).
- Exception: plugins with external APIs (TTS, LanguageTool) need network access.
