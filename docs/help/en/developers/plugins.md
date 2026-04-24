# Plugin Developer Guide

This guide explains how to build plugins for Bibliogon. Plugins extend the platform with new features without modifying the core codebase.

## Architecture overview

Bibliogon uses [PluginForge](https://github.com/astrapi69/pluginforge) (PyPI) as its plugin framework, based on pluggy. Plugins are standalone Python packages discovered via entry points.

```
Frontend (React) -> Backend (FastAPI) -> PluginForge -> Your Plugin
```

Each plugin can:
- Add API endpoints (FastAPI routes)
- Implement hooks (content transformation, export formats)
- Declare UI extensions (sidebar actions, toolbar buttons, settings panels, pages)
- Ship its own configuration (YAML)

## Directory structure

```
plugins/bibliogon-plugin-{name}/
  bibliogon_{name}/
    __init__.py
    plugin.py          # Plugin class (required)
    routes.py          # FastAPI router (optional)
    {module}.py        # Business logic modules
  tests/
    test_{name}.py
  pyproject.toml       # Package metadata + entry point (required)
```

**Naming conventions:**
- Plugin folder: `bibliogon-plugin-{name}` (kebab-case)
- Python package: `bibliogon_{name}` (snake_case)
- Plugin name in code: `{name}` (lowercase, e.g. "help", "export", "grammar")

## Minimal plugin

### pyproject.toml

```toml
[tool.poetry]
name = "bibliogon-plugin-myplugin"
version = "1.0.0"
description = "My custom Bibliogon plugin"
authors = ["Your Name"]
license = "MIT"
packages = [{include = "bibliogon_myplugin"}]

[tool.poetry.dependencies]
python = "^3.11"
pluginforge = "^0.5.0"
fastapi = "^0.135.0"

[tool.poetry.plugins."bibliogon.plugins"]
myplugin = "bibliogon_myplugin.plugin:MyPlugin"
```

The entry point `[tool.poetry.plugins."bibliogon.plugins"]` is how PluginForge discovers your plugin.

### Register the plugin in the backend

For **bundled plugins** (any plugin shipped inside the bibliogon repository under `plugins/`), you must also add a path-dependency entry to `backend/pyproject.toml` so the backend's Poetry environment installs the plugin and its entry points become discoverable:

```toml
[tool.poetry.dependencies]
# ...existing entries...
bibliogon-plugin-myplugin = {path = "../plugins/bibliogon-plugin-myplugin", develop = true}
```

Then run `poetry lock` and `poetry install` in the `backend/` directory. **Skipping this step makes the plugin invisible in CI** (it works locally for anyone whose venv already has the dist-info from a previous install, but fresh checkouts and the CI runner load only what `pyproject.toml` declares). ZIP-distributed third-party plugins are exempt because they install at runtime via `sys.path`, not at setup time.

### plugin.py

```python
from typing import Any
from pluginforge import BasePlugin


class MyPlugin(BasePlugin):
    name = "myplugin"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"           # In Bibliogon "core" is the only value in use; all plugins are free.
    depends_on: list[str] = []      # e.g. ["export"] if you need the export plugin

    def activate(self) -> None:
        """Called when the plugin is loaded. Set up config, connections, etc."""
        from .routes import set_config
        set_config(self.config)

    def get_routes(self) -> list[Any]:
        """Return FastAPI routers to mount."""
        from .routes import router
        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        """Declare UI extensions. Return None if no UI."""
        return None
```

### routes.py

```python
from fastapi import APIRouter

router = APIRouter(prefix="/myplugin", tags=["myplugin"])

_config: dict = {}

def set_config(config: dict) -> None:
    global _config
    _config = config


@router.get("/hello")
def hello():
    return {"message": "Hello from my plugin!"}
```

**Rules:**
- routes.py contains ONLY endpoint definitions that delegate to service functions
- Business logic goes in separate modules (e.g. `service.py`, `analyzer.py`)
- No direct database access in routes; use service functions
- Use Pydantic v2 for request/response schemas

## Hooks

Plugins can implement hooks defined in `backend/app/hookspecs.py`. Hooks allow plugins to participate in core workflows without modifying core code.

### Available hooks

| Hook | Purpose | Return |
|------|---------|--------|
| `export_formats()` | Declare supported export formats | `list[dict]` |
| `export_execute(book, fmt, options)` | Run an export (first result wins) | `Path or None` |
| `chapter_pre_save(content, chapter_id)` | Transform content before saving | `str or None` |
| `content_pre_import(content, language)` | Transform markdown during import | `str or None` |

### Implementing a hook

In your `plugin.py`, add a method matching the hook name:

```python
class MyPlugin(BasePlugin):
    name = "myplugin"
    # ...

    def content_pre_import(self, content: str, language: str) -> str | None:
        """Clean up imported markdown before conversion."""
        # Return transformed content, or None to skip
        cleaned = content.replace("\r\n", "\n")
        return cleaned
```

Hooks with `firstresult=True` (like `export_execute`) stop at the first plugin that returns a non-None value. Regular hooks collect results from all plugins.

## Configuration

Plugin configuration lives in `backend/config/plugins/{name}.yaml`.

### YAML structure

```yaml
plugin:
  name: "myplugin"
  display_name:
    de: "Mein Plugin"
    en: "My Plugin"
  description:
    de: "Beschreibung des Plugins"
    en: "Plugin description"
  version: "1.0.0"
  license: "MIT"
  depends_on: []
  api_version: "1"

settings:
  my_option: true
  threshold: 0.8
  language_list:
    - de
    - en
```

### Accessing config

```python
def activate(self) -> None:
    # self.config contains the parsed YAML
    threshold = self.config.get("settings", {}).get("threshold", 0.5)
```

### Settings visibility rules

Every setting in the YAML must either:
1. Be editable in the plugin UI (Settings > Plugins > {name}), OR
2. Be marked with `# INTERNAL` comment

Hidden settings that influence user behavior without a UI are not allowed.

## Frontend manifest

Plugins declare UI extensions via `get_frontend_manifest()`. The frontend queries `/api/plugins/manifests` to discover all extensions.

### Available UI slots

| Slot | Location | Use case |
|------|----------|----------|
| `pages` | App navigation | Full-page plugin UI |
| `sidebar_actions` | BookEditor sidebar | Action buttons |
| `toolbar_buttons` | Editor toolbar | Formatting tools |
| `editor_panels` | Beside the editor | Side panels |
| `settings_section` | Settings > Plugins | Plugin configuration |
| `export_options` | Export dialog | Format-specific options |

### Example: adding a page

```python
def get_frontend_manifest(self) -> dict[str, Any] | None:
    return {
        "pages": [
            {
                "id": "myplugin",
                "path": "/myplugin",
                "label": {"de": "Mein Plugin", "en": "My Plugin"},
                "icon": "puzzle",  # lucide-react icon name
            },
        ],
    }
```

### Example: adding sidebar actions

```python
def get_frontend_manifest(self) -> dict[str, Any] | None:
    return {
        "sidebar_actions": [
            {
                "id": "myplugin_analyze",
                "label": {"de": "Analysieren", "en": "Analyze"},
                "icon": "bar-chart",
                "action": "/api/myplugin/analyze/{book_id}",
            },
        ],
    }
```

For complex plugin UIs, you can ship Web Components as custom elements (compiled JS bundle in the plugin ZIP).

## ZIP distribution

Third-party plugins are distributed as ZIP files and installed via Settings > Plugins.

### ZIP structure

```
myplugin.zip
  plugin.yaml          # Required: plugin metadata
  bibliogon_myplugin/
    __init__.py
    plugin.py
    routes.py
    service.py
  config/
    myplugin.yaml      # Plugin configuration
```

### plugin.yaml (required for ZIP plugins)

```yaml
name: myplugin
display_name:
  de: "Mein Plugin"
  en: "My Plugin"
version: "1.0.0"
package: bibliogon_myplugin
entry_class: MyPlugin
```

### Installation flow

1. User uploads ZIP at Settings > Plugins
2. Server validates: safe name, no path traversal, contains plugin.yaml + plugin.py
3. Extracted to `plugins/installed/{name}/`
4. Config written to `config/plugins/{name}.yaml`
5. Plugin loaded dynamically via sys.path + PluginManager

### Name validation

Plugin names must match: `[a-z][a-z0-9_-]{1,48}[a-z0-9]` (3-50 chars, lowercase letters, digits, hyphens, underscores).

## Testing

Plugin tests live in `plugins/bibliogon-plugin-{name}/tests/`.

```bash
# Run tests for a specific plugin
make test-plugin-{name}

# Run all plugin tests
make test-plugins
```

### Test pattern

```python
import pytest
from bibliogon_myplugin.service import analyze_text


def test_analyze_detects_issues():
    result = analyze_text("This is a test.", language="en")
    assert isinstance(result, list)


def test_analyze_empty_text():
    result = analyze_text("", language="en")
    assert result == []
```

For integration tests with the API, use FastAPI's TestClient:

```python
from fastapi.testclient import TestClient
from app.main import app

def test_hello_endpoint():
    with TestClient(app) as client:
        resp = client.get("/api/myplugin/hello")
        assert resp.status_code == 200
        assert "message" in resp.json()
```

## Dependencies

If your plugin needs a dependency not in the core, declare it in your `pyproject.toml`. For ZIP-distributed plugins, dependencies must be bundled or already available in the Bibliogon environment.

Do NOT add new dependencies to the core without asking. The existing stack:
- Backend: FastAPI, SQLAlchemy, Pydantic v2, pluginforge, PyYAML, httpx
- Frontend: React 19, TypeScript 6, Vite 7, TipTap, Radix UI, Lucide

## Existing plugins for reference

| Plugin | Complexity | Good example for |
|--------|-----------|-----------------|
| help | Simple | Routes + config + i18n |
| ms-tools | Medium | Hooks + per-book settings + UI panel |
| export | Complex | Multiple formats + async jobs + scaffolding |
| audiobook | Complex | External APIs + SSE progress + persistence |
| git-sync | Medium | Import plugin + plugin-to-plugin dependency |

Study the help plugin first as a starting template, then ms-tools for hook implementation patterns.

---

## Import plugin patterns (from PGS-01)

When a plugin adds support for importing a new format or a new *source* of books, the core import orchestrator (`backend/app/import_plugins/`) is the integration point. The first external import plugin (`plugin-git-sync`, PGS-01) shipped with four architectural patterns worth naming — each solves a problem future import plugins will hit.

### Pattern 1: Source adapter over format re-implementation

**Problem.** Your plugin wants to import books from a new *source* (a git URL, a cloud-drive link, a gist, ...), but the underlying *format* already has a handler in core or another plugin. Re-implementing the parser to handle URL-fetching creates duplicate code that drifts.

**Solution.** Your plugin is a **source adapter**: it fetches or prepares the data into a filesystem path, then hands off to the already-working format handler. Don't re-parse the format.

**PGS-01 example.** `GitImportHandler.clone(url, target_dir)` clones into the orchestrator's staging directory, returning the project root path. The endpoint then calls `find_handler(staged_path)`, which picks up `WbtImportHandler` (a core handler already shipped in CIO-02). The plugin never parses `config/metadata.yaml` or walks `manuscript/` — `WbtImportHandler` does that.

**Benefits.**
- Zero duplication. A bug fix in the format handler helps every source automatically.
- Consistent `DetectedProject` payloads across sources (same preview, same duplicate detection, same override allowlist).
- Your plugin is small — ~100 LOC for the handler, not 500+.

**When NOT to use.** If the format is genuinely new (no existing handler produces a `DetectedProject` from it), you build a real `ImportPlugin` and parse it yourself. Source-adapter only works if there is a format handler downstream to hand off to.

### Pattern 2: Two registries in core (`ImportPlugin` vs `RemoteSourceHandler`)

**Problem.** A file-path input has a filesystem path at detect-time; a URL does not — it needs to be cloned/fetched first. Trying to stuff both shapes into one registry forces `isinstance` heuristics inside `find_handler()`, which is a code smell.

**Solution.** Separate registries for separate input shapes. Both share the `temp_ref` + staging-directory mechanism for execute.

- `ImportPlugin` (in `backend/app/import_plugins/protocol.py`): file-path inputs. `can_handle(path) -> bool`, `detect(path)`, `execute(path, ...)`.
- `RemoteSourceHandler` (in `backend/app/import_plugins/registry.py`, added in PGS-01): URL-shaped inputs. `can_handle(url) -> bool`, `clone(url, target_dir) -> Path`. After clone, the orchestrator dispatches through `find_handler()` on the cloned path, so format detection reuses the `ImportPlugin` side.

**When adding a third input shape.** If your plugin brings a new input shape that doesn't fit either (e.g. "book from a SQL query result"), weigh: (a) normalising it to one of the existing shapes in your plugin, (b) adding a third registry with a new endpoint (`POST /api/import/detect/{kind}`). Prefer (a) — it keeps the registry count small.

**Anti-pattern.** `if input.startswith("http"): ... elif Path(input).is_dir(): ...` inside a single `find_handler` pollutes the abstraction with shape-detection. Keep dispatch semantic, not syntactic.

### Pattern 3: Plugin-to-plugin dependency via path dep

**Problem.** Your plugin needs utility code from another plugin (e.g. `tiptap_to_markdown` from `plugin-export`). You don't want to copy the code, and you can't (yet) pip-install the other plugin because both live in the same monorepo.

**Solution.** Declare the dependency in `pyproject.toml` via a relative path:

```toml
[tool.poetry.dependencies]
bibliogon-plugin-export = {path = "../bibliogon-plugin-export", develop = true}
```

Then `poetry install` inside the plugin's directory wires the other plugin into the venv. Imports work as if it were a PyPI package.

**PGS-01 example.** `plugin-git-sync` declares `bibliogon-plugin-export` as a path dep. Phase 1 does not yet exercise the dependency at runtime — it is scaffolding for PGS-02 (export-to-repo) which will call `from bibliogon_export.tiptap_to_md import tiptap_to_markdown` to serialise books back into the git repository. The declaration is made early so the architecture is visible even before the code arrives.

**When publishing to PyPI.** A path dep stops resolving on `pip install bibliogon-plugin-git-sync` outside the monorepo. The publication step must replace it with a version pin:

```toml
bibliogon-plugin-export = ">=1.0.0,<2.0.0"
```

Do this as part of the PyPI release, not during development.

**When the dependency is optional.** If your plugin can function without the other plugin, don't declare a path dep — use a deferred import inside the code path that needs it, catch `ImportError`, and degrade gracefully. Path deps are for required dependencies.

### Pattern 4: PluginForge activation → core registry bridge

**Problem.** PluginForge discovers plugins via entry points; Bibliogon's core registries (`ImportPlugin`, `RemoteSourceHandler`, hookspecs, ...) each have their own `register(...)` function. Something has to bridge "PluginForge loaded this plugin" to "Bibliogon knows about its handlers."

**Solution.** The plugin's `activate()` hook does a deferred import of the core registration function and calls it:

```python
# plugins/bibliogon-plugin-git-sync/bibliogon_git_sync/plugin.py
from pluginforge import BasePlugin

class GitSyncPlugin(BasePlugin):
    name = "git-sync"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"

    def activate(self) -> None:
        from bibliogon_git_sync.handlers.git_handler import GitImportHandler
        from .registration import register_git_handler

        register_git_handler(GitImportHandler())
```

And `registration.py`:

```python
def register_git_handler(handler: object) -> None:
    from app.import_plugins import register_remote_handler
    register_remote_handler(handler)  # type: ignore[arg-type]
```

**Why the deferred imports.** Importing `app.*` at module-top couples the plugin module to the full Bibliogon backend being loaded. That breaks plugin-level unit tests that just want to exercise the handler's logic. Deferring to inside `activate()` (which only fires at app lifespan) keeps the plugin module importable standalone.

**Timing.** PluginForge runs `activate()` during `manager.discover_plugins()` in the app lifespan, before the first HTTP request. By the time any route fires, all registrations have already happened.

**Anti-pattern.** Using module-top-level side-effect imports (`register_remote_handler(...)` at the bottom of `plugin.py`) works in production but breaks standalone test runs and makes import ordering fragile. Always go through `activate()`.

---

## Write your first plugin (PGS-01 as template)

A step-by-step walkthrough using PGS-01's shape. End state: a working plugin skeleton you can extend.

### Step 1: Decide what your plugin does

Three common shapes:

| Shape | Protocol | Registers with | Example |
|-------|----------|----------------|---------|
| New format | `ImportPlugin` | `app.import_plugins.register` | `WbtImportHandler` (core, CIO-02) |
| New source | `RemoteSourceHandler` | `app.import_plugins.register_remote_handler` | `GitImportHandler` (PGS-01) |
| New core behaviour | Pluggy `@hookimpl` | `BibliogonHookSpec` (see `backend/app/hookspecs.py`) | `plugin-grammar` (content_pre_import) |

Pick one. If your work genuinely spans two (e.g. a format plugin that also adds a hookspec), do both — PluginForge allows it.

### Step 2: Create the plugin package

Layout matches the other 10 plugins:

```
plugins/bibliogon-plugin-<name>/
├── pyproject.toml
├── README.md
├── bibliogon_<name>/
│   ├── __init__.py
│   ├── plugin.py           # BasePlugin subclass, activate() hook
│   └── handlers/
│       ├── __init__.py
│       └── <kind>_handler.py
└── tests/
    ├── __init__.py
    └── test_<kind>_handler.py
```

Minimum `pyproject.toml`:

```toml
[tool.poetry]
name = "bibliogon-plugin-<name>"
version = "1.0.0"
description = "One-line description."
authors = ["<you>"]
license = "MIT"
readme = "README.md"
packages = [{include = "bibliogon_<name>"}]

[tool.poetry.dependencies]
python = "^3.11"
pluginforge = "^0.5.0"
fastapi = "^0.135.0"
# Add runtime deps here (e.g. gitpython for plugin-git-sync)

[tool.poetry.group.dev.dependencies]
pytest = "^9.0"
pytest-cov = "^7.1.0"

[tool.poetry.plugins."bibliogon.plugins"]
<name> = "bibliogon_<name>.plugin:<Name>Plugin"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

Also add the plugin to `backend/pyproject.toml` as a path dep (see "Register the plugin in the backend" above). Skip this and CI treats the plugin as invisible.

### Step 3: Implement the protocol

Copy the shape from the plugin closest to yours (table in Step 1). For a `RemoteSourceHandler`, the minimum signature is:

```python
class <Name>Handler:
    source_kind = "<kind>"

    def can_handle(self, url: str) -> bool: ...
    def clone(self, url: str, target_dir: Path) -> Path: ...
```

Return the path the orchestrator should dispatch through (usually a subdirectory inside `target_dir`). Raise exceptions for unrecoverable errors; the endpoint maps them to HTTP 502.

### Step 4: Wire activation

```python
# bibliogon_<name>/plugin.py
from pluginforge import BasePlugin

class <Name>Plugin(BasePlugin):
    name = "<name>"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"

    def activate(self) -> None:
        from .handlers.<kind>_handler import <Name>Handler
        from .registration import register_<kind>_handler

        register_<kind>_handler(<Name>Handler())
```

```python
# bibliogon_<name>/registration.py
def register_<kind>_handler(handler: object) -> None:
    from app.import_plugins import register_<kind>_handler as core_register
    core_register(handler)
```

Deferred imports are load-bearing. Keep them inside the function body.

### Step 5: Add tests

Three levels, each in its own file:

- **Plugin-level** (`plugins/bibliogon-plugin-<name>/tests/test_<kind>_handler.py`): unit tests of the handler class. Mock external services (GitPython, HTTP clients, etc.). No app load.
- **Endpoint-level** (`backend/tests/test_import_<kind>_endpoint.py`): `TestClient(app)`, hits `POST /api/import/detect/<kind>`, mocks your handler's external dependency so the plugin-endpoint-handler chain is exercised without network. Use `scope="module"` on the `client` fixture to keep lifespan-state accumulation down (see the RecursionError note in `.claude/rules/lessons-learned.md`).
- **Plugin smoke** (same file, 1-2 tests): assert `list_remote_handlers()` (or the equivalent) contains your handler after lifespan. Regression guard against the "plugin not in `app.yaml` enabled list" class of bug.

### Step 6: Enable in app.yaml

```yaml
plugins:
  enabled:
    - export
    - help
    - ...
    - <name>
```

Edit `backend/config/app.yaml.example` — that file is the source of truth for fresh installs. The local `backend/config/app.yaml` is gitignored; on first startup PS-01 copies `.example` over so your addition propagates to all users.

### Step 7: Ship it

- `docs/ROADMAP.md`: flip the entry for your phase to `[x]` with a one-paragraph completion note.
- `docs/help/_meta.yaml`: add a nav entry if your plugin has user-facing behaviour.
- `docs/help/{de,en}/<topic>/<slug>.md`: write the user-facing help page. DE + EN minimum.
- `backend/config/plugins/help.yaml`: add at least one FAQ entry pointing users at the new feature.
- `Makefile`: add `test-plugin-<name>` target and include it in the `test-plugins` list.

### Step 8: Common gotchas

- **Handler not registered at runtime.** Plugin is not in `app.yaml` enabled list. PluginForge discovered the entry point but skipped activation.
- **Plugin works locally but fails in CI.** Path dep missing from `backend/pyproject.toml`. The backend venv is the authoritative environment; CI installs exactly what's declared there.
- **Import cycle on plugin load.** Something in `plugin.py` module-top imports `app.*`. Move it inside `activate()` or another function body.
- **Tests pass individually but the full suite fails with RecursionError.** Per-test `TestClient(app)` fixtures accumulate plugin-route state on the shared FastAPI singleton. Use `scope="module"` (see `.claude/rules/lessons-learned.md` for the diagnosis).
- **Plugin-to-plugin dep not resolving.** Relative `path = "../..."` in your `pyproject.toml` doesn't match the actual directory layout. Fix or run `poetry lock`.
- **Handler's `can_handle` never fires.** Check registration ordering: first-registered wins in `find_handler()`. If an earlier handler claims every input, yours is unreachable.

---

## Reference: `plugin-git-sync` source walkthrough

For a concrete example of everything above, read the PGS-01 commits in order — each one is a single atomic step:

| Commit | Concern |
|--------|---------|
| `c93d496` | Plugin scaffold + pyproject + backend path dep |
| `4fb9e99` | Frontend input + API client + i18n |
| `c14c8c7` | Core registry + endpoint (no plugin behaviour yet) |
| `a3616f3` | Handler implementation + plugin-level tests |
| `df6cb39` | `app.yaml` wiring + E2E integration test |
| `ced994c` | ROADMAP flip + help docs |

Study each diff next to this guide.
