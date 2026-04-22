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

Study the help plugin first as a starting template, then ms-tools for hook implementation patterns.
