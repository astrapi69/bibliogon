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

---

## Bi-directional sync patterns (from PGS-02..05)

PGS-01 brought books *into* Bibliogon from a remote source. Phases 2-5 round-trip the other direction — re-scaffold a book and push it back to the same remote. That round-trip surfaces four patterns any plugin that modifies external state will hit.

### Pattern 5: Per-book lock for cross-subsystem operations

**Problem.** A user clicks "Commit everywhere" and your code fans the call out to two subsystems (core git + plugin-git-sync). Without coordination, two simultaneous fan-outs (a stale dialog open in another tab, a re-click during a slow first attempt) race against each other on the working tree and `last_committed_at` cursor.

**Solution.** A keyed lock on `book_id` with a short timeout. PGS-05 ships `app.services.git_sync_lock.book_commit_lock(book_id, timeout=30)`:

```python
from app.services.git_sync_lock import book_commit_lock

with book_commit_lock(book_id, timeout=30):
    # core git first (smaller blast radius), plugin-git-sync second
    ...
```

Timeout maps to HTTP 503 in the router, never 500. The user sees "another commit is running" and retries.

**When to use.** Any time a single user action fans out into ≥2 mutating subsystems on the same resource. The lock is per-resource, not per-process.

**Anti-pattern.** Implicitly relying on "no one will click twice" is the bug; it works in your QA but breaks when SSE reconnects retry the same call, when a slow first attempt times out the toast and the user re-clicks, etc. Always lock.

### Pattern 6: Soft per-subsystem failure aggregation

**Problem.** When the fan-out runs core git + plugin-git-sync, partial failure is the norm: one side succeeds, the other fails on auth, network, or "nothing to commit." A hard `raise HTTPException(500)` loses the success and leaves the user staring at a generic error.

**Solution.** Per-subsystem result with a stable status enum. The router collects:

```python
class SubsystemResult:
    status: Literal["ok", "skipped", "nothing_to_commit", "failed"]
    detail: str | None = None
    commit_sha: str | None = None
    pushed: bool = False
```

Both subsystem results land in the response body even when one failed. The toast tier (success / warning / error) is decided client-side from the combined statuses, so the user sees "core succeeded, plugin failed (auth)" instead of "Internal Server Error."

The 503 path stays — but it triggers ONLY when the per-book lock can't be acquired. Subsystem-level errors stay inside the 200 payload.

**When to use.** Any endpoint that orchestrates ≥2 subsystems where partial success is meaningful. If both subsystems must succeed atomically (e.g. financial transactions), this pattern doesn't fit — use a transaction boundary instead.

### Pattern 7: One-shot pushurl pattern for credential injection

**Problem.** Embedding a PAT into `origin`'s URL via `git remote set-url` works for HTTPS push, but the PAT then lives in `.git/config` on disk. A backup-style read of the repo would leak the token.

**Solution.** Set the embedded URL just before push, restore the original URL in a `finally` block. PGS-02's `_push` does:

```python
original_url = next(repo.remotes.origin.urls)
auth_url = git_credentials.inject_pat_into_url(original_url, book_id)
try:
    if auth_url != original_url:
        repo.remotes.origin.set_url(auth_url)
    info = repo.remotes.origin.push(refspec=f"{branch}:{branch}")
finally:
    if auth_url != original_url:
        repo.remotes.origin.set_url(original_url)
```

After return the on-disk URL is back to the original. A regression test (`test_commit_push_uses_per_book_pat_without_persisting_to_git_config`) reads `.git/config` after a push and asserts the token never appears.

**When to use.** Any time you embed a secret into a config field as a temporary auth carrier.

**Per-book credential helper.** PGS-02-FU-01 added `app.services.git_credentials` so multiple subsystems share a single per-book PAT slot. If you need credentials for any new subsystem on the same book, reuse this helper rather than building a parallel store. Encrypted-at-rest via Fernet with a key derived from `BIBLIOGON_CREDENTIALS_SECRET`.

### Pattern 8: Failure-tolerant lazy imports for side-effects

**Problem.** Your plugin produces a primary artifact (e.g. a commit) and a "nice to have" companion (e.g. a Markdown side-file rendered next to the canonical JSON for readable git diffs). The companion writer depends on another plugin's converter via path dep. When the companion writer breaks, the primary artifact must still ship.

**Solution.** Lazy-import the helper inside a `try/except`, log on failure, and continue. PGS-05's Markdown side-file emitter:

```python
def _write_md_side_file(json_path: Path) -> None:
    try:
        from bibliogon_export.tiptap_to_md import tiptap_to_markdown  # lazy
    except Exception:
        logger.exception("Markdown side-file: import failed; skipping.")
        return
    try:
        # ... convert + write
    except Exception:
        logger.exception("Markdown side-file: conversion failed; skipping.")
```

The commit still lands; the side-file may not. The next commit retries.

**When to use.** Any time you produce a non-canonical companion artifact. If the companion is the only artifact (e.g. the export plugin's EPUB output), this pattern doesn't apply — failures must surface as hard errors.

**Anti-pattern.** Eagerly importing the helper at plugin module top: a future refactor to the helper plugin will break load-time discovery of *your* plugin even though your primary work is unrelated.

---

## Three-way diff patterns (from PGS-03 + PGS-03-FU-01)

When your plugin re-imports content from an external source that the user has also been editing locally, you need to surface the diff so the user can resolve. PGS-03 shipped a three-way diff (base / local / remote) over chapters; the patterns generalize.

### Pattern 9: Read git refs without working-tree checkout

**Problem.** Computing a base-vs-remote diff requires reading file content at TWO commits. A naive `git checkout <ref>` swaps the working tree, which racing against your scaffolder breaks the user's commit-to-repo flow.

**Solution.** `git ls-tree -r --name-only <commit> <prefix>` + `git show <commit>:<path>` are read-only and never touch the working tree. PGS-03's `_read_wbt_at_ref(clone_path, ref)`:

```python
commit = repo.commit(ref)
tree = repo.git.ls_tree("-r", "--name-only", commit.hexsha, prefix).splitlines()
for path in tree:
    if path.endswith(".md"):
        content = repo.git.show(f"{commit.hexsha}:{path}")
        # ...
```

Resolves the ref to a commit first so subsequent `show` calls are deterministic even if the branch moves underneath.

**When to use.** Any time you need to read content at multiple refs in the same logical operation. Treat the working tree as exclusive to commit-to-repo / merge / checkout — never to read-only inspection.

### Pattern 10: Pure classification + side-effecting application

**Problem.** A diff has two responsibilities: figure out *what changed* (per-chapter classification) and *apply the user's resolution* (mutate the DB). Mixing them produces a single 200-line function that's untestable without a real git repo + DB.

**Solution.** Two separate functions:

- `_classify(base, local, remote) -> list[ChapterDiff]`: pure. Takes three dicts of identity → content. Returns a list of classifications. No git, no DB. Unit-testable from in-memory dicts.
- `apply_resolutions(db, *, book_id, resolutions)`: side-effecting. Mutates the DB based on the user's per-chapter choice and bumps the cursor.

`diff_book(db, book_id)` is the thin glue that reads inputs (via Pattern 9) and feeds them into `_classify`.

**When to use.** Any non-trivial decision that ends in a DB mutation. The classification half deserves its own ~10 unit tests covering edge cases (`unchanged`, both-sides-removed, identical-edit-on-both-sides, blank-line-only differences, ...). Achieving the same coverage through end-to-end fixtures is 5x slower and 10x more brittle.

**Normalization-tolerant comparison.** PGS-03's `_normalize` strips trailing whitespace per line, collapses blank-line runs, and trims leading/trailing whitespace before equality. Markdown round-trips through TipTap → markdown → file → TipTap commonly add or drop a final newline; without normalization every "unchanged" chapter would classify as "local_changed".

### Pattern 11: Post-process collapse for rename detection

**Problem.** A file moving from `slug-a` to `slug-b` with identical body classifies as `*_removed` for the old slug AND `*_added` for the new slug — two confusing rows the user has to mentally pair off.

**Solution.** Keep the base classifier simple (it doesn't know about renames). Layer rename detection as a separate pass `_collapse_renames(diffs)` that pairs `(removed, added)` rows with matching normalized bodies into a single `renamed_*` row. PGS-03-FU-01:

```python
def _collapse_renames(diffs: list[ChapterDiff]) -> list[ChapterDiff]:
    # group by classification
    # for (remote_removed, remote_added) pairs: match bodies, replace with renamed_remote
    # for (local_removed, local_added) pairs: match bodies, replace with renamed_local
    # leave non-paired rows alone
```

**Strict body match only.** Near-misses (e.g. small edits in the body during a rename) stay as independent removed + added rows so the user sees the real diff. Fuzzy thresholds invite false positives that mis-pair distinct chapters.

**Cross-side pairing forbidden.** Never pair `remote_removed` with `local_added` even with identical bodies — that's a coincidence, not a rename, and treating it as one would silently merge unrelated work.

**When to use.** Any "rename" detection layered over a per-item classifier. Keep the classifier dumb and the post-process targeted.

---

## Multi-branch / translation-group patterns (from PGS-04 + PGS-04-FU-01)

When your plugin imports multiple variants of the same resource from a single source (e.g. translations of a book on different git branches), failure isolation matters more than success.

### Pattern 12: Stable reason slugs + payload-driven skip surface

**Problem.** Iterating over N branches and importing each is the easy part. The hard part is what happens to the 2 of 5 branches that fail: the WBT layout is missing, the chapter structure is incompatible, the metadata is invalid. If you `try/except` and just log, the user sees 3 imported books and silently loses 2.

**Solution.** Capture every per-item failure into a structured `SkippedItem` payload that lives on the result object next to the successes. PGS-04-FU-01's `MultiBranchResult.skipped: list[SkippedBranch]`:

```python
@dataclass
class SkippedBranch:
    branch: str
    reason: Literal["no_wbt_layout", "import_failed"]
    detail: str  # truncated diagnostic line
```

Two failure modes get distinct slugs:

- `no_wbt_layout` — a structural precondition failed (missing config dir). The branch is in scope but isn't a book.
- `import_failed` — the inner importer raised. Includes the exception class + message, truncated to 500 chars.

The router echoes `skipped[]` on the response (defaults to `[]` for clean imports) and the frontend renders an "Attention required" section per entry.

**Stable English slugs in the API; localized labels in the frontend.** The slug is the API contract — never change it without a migration. The frontend maps slug → user-visible string per language. When you add a new failure mode (a fourth slug down the line), the API gains a new value but old frontends fall through to rendering the raw slug, not crashing.

**Truncate detail server-side.** A 5MB exception payload is a denial-of-service vector and useless to the user. 500 chars is enough for the exception class + the first sentence of `str(exc)`.

**When to use.** Any iterate-and-import pattern where partial success is the realistic outcome. The pattern transfers to non-import iterations too — bulk export, bulk validation, batch translation.

**Anti-pattern.** Hiding partial failures behind a single `result.success: bool` flag. The user has no way to recover what was lost.

---

## Reference: PGS-02..05 commit walkthrough

Each phase landed in 1-3 atomic commits. Read in order alongside this guide:

| Phase | Concern | Commits |
|-------|---------|---------|
| PGS-02 | Commit-to-repo + push (overwrite MVP) | `aa25d74` (backend) + `782490e` (frontend) |
| PGS-02-FU-01 | Per-book PAT shared across subsystems | `32137bb` |
| PGS-03 | Three-way diff + per-chapter resolution | `c87b7dd` (backend) + `1338d87` (frontend) |
| PGS-03-FU-01 | mark_conflict + rename detection | `819e571` + `5bfd76a` + `e58d9e1` |
| PGS-04 | Translation-group multi-branch import | `4aa7153` + `9c8eee5` |
| PGS-04-FU-01 | Skipped-branch surface + reusable panel | `06c7c1b` + `75046b9` |
| PGS-05 | Unified-commit fan-out + per-book lock | `6af6f5c` + `b0133ec` |
