# Bibliogon - concept document

**Repository:** [github.com/astrapi69/bibliogon](https://github.com/astrapi69/bibliogon)
**Related project:** [github.com/astrapi69/write-book-template](https://github.com/astrapi69/write-book-template)
**PluginForge:** [github.com/astrapi69/pluginforge](https://github.com/astrapi69/pluginforge) (PyPI: pluginforge ^0.5.0)

This document describes the architecture and the concept. The current app version lives in `CLAUDE.md`, concrete changes per release in `docs/CHANGELOG.md`.

---

## 1. Goal

Bibliogon consists of two parts:

1. **PluginForge** - An application-agnostic plugin framework for Python/FastAPI applications. Built on top of [pluggy](https://pluggy.readthedocs.io/) (the hook system behind pytest), extended with YAML configuration, plugin lifecycle, FastAPI integration and frontend plugin loading. Any developer can use it as the foundation for their own plugin-capable applications.

2. **Bibliogon app** - An open-source web platform for writing and exporting books. The first application built on PluginForge. The entire export (EPUB, PDF, write-book-template structure) is itself a plugin.

The principle: the app core (UI, database, chapter editor) is lean. Everything else - export, children's book mode, audiobook, KDP integration - is delivered via plugins. This produces a freemium model: core free, premium plugins paid.

The long-term goal is a commercial SaaS product. Both PluginForge and the Bibliogon core stay open source (MIT license).

---

## 2. Architecture

### 2.1 Layered architecture

```
+----------------------------------------------------------+
|  Bibliogon app (frontend: React + TipTap)                |
+----------------------------------------------------------+
|  Bibliogon app (backend: FastAPI, Book/Chapter CRUD)     |
+----------------------------------------------------------+
|  PluginForge (framework)                                  |
|  +-- pluggy (hook specs + hook impls)                    |
|  +-- YAML configuration (app, plugins, i18n)             |
|  +-- plugin lifecycle (init, activate, deactivate)       |
|  +-- FastAPI router integration                          |
|  +-- Alembic migration support for plugin tables         |
+----------------------------------------------------------+
|  Plugins                                                  |
|  +-- plugin-export       (EPUB, PDF, write-book-template)|
|  +-- plugin-kinderbuch   (image layout, special export)  |
|  +-- plugin-audiobook    (TTS, MP3/M4B)                  |
|  +-- plugin-kdp          (KDP metadata, preview)         |
|  +-- ...                                                  |
+----------------------------------------------------------+
```

### 2.2 Two repositories

| Repository | Description | License |
|------------|-------------|---------|
| `pluginforge` | Application-agnostic plugin framework (based on pluggy) | MIT |
| `bibliogon` | Book authoring platform, uses PluginForge | MIT (core), proprietary (premium plugins) |

PluginForge is a standalone PyPI package:

```toml
# bibliogon/backend/pyproject.toml
[tool.poetry.dependencies]
pluginforge = {version = "^0.5.0", extras = ["fastapi"]}
```

Another developer can use PluginForge independently:

```toml
# podcast-tool/pyproject.toml
[tool.poetry.dependencies]
pluginforge = "^0.5.0"
```

### 2.3 Tech stack

| Component | Technology |
|-----------|------------|
| PluginForge | Python 3.11+, pluggy, YAML, entry points, Alembic |
| Backend | FastAPI, SQLAlchemy, SQLite/PostgreSQL, Pydantic v2 |
| Frontend | React 18, TypeScript, TipTap (15 extensions), Vite, Radix UI, @dnd-kit, Lucide icons |
| Export plugin | manuscripta (PyPI), Pandoc, write-book-template structure |
| Tooling | Poetry, npm, Docker, Make, Playwright (E2E) |

### 2.4 UI component strategy

Principle: use existing open-source libraries instead of reinventing the wheel.

| Library | Purpose | License |
|---------|---------|---------|
| **Radix UI** | Unstyled accessible primitives (Dialog, Tabs, Dropdown, Select, Tooltip) | MIT |
| **@dnd-kit** | Drag-and-drop (chapter sorting, list reordering) | MIT |
| **TipTap** | WYSIWYG/Markdown editor (StarterKit + 15 extensions) | MIT |
| **@pentestpad/tiptap-extension-figure** | Figure + figcaption (captions) | MIT |
| **@tiptap/extension-table** | Tables (+ row, cell, header) | MIT |
| **@tiptap/extension-text-align** | Text alignment (left, center, right, justify) | MIT |
| **@tiptap/extension-typography** | Smart quotes, automatic dashes | MIT |
| **@tiptap/extension-character-count** | Word and character count | MIT |
| **@tiptap/extension-highlight** | Highlight text | MIT |
| **@tiptap/extension-task-list** | Checklists with checkboxes | MIT |
| **@tiptap/extension-underline** | Underline | MIT |
| **@tiptap/extension-sub/superscript** | Subscript/superscript (H2O, E=mc2) | MIT |
| **Lucide React** | Icons | ISC |
| **react-toastify** | Toast notifications | MIT |

Why Radix UI:
- Unstyled: fits our CSS variable theming (3 themes x light/dark)
- Accessible: ARIA attributes, focus management, keyboard navigation out of the box
- Individually installable: only the primitives we need
- No Tailwind required: we keep styling with custom properties

Rejected alternatives:
- shadcn/ui (requires Tailwind), MUI (too opinionated), Ant Design (too heavy), Mantine/Chakra (their own theme system)

This strategy is also a reference for other projects that build on PluginForge.

---

## 3. PluginForge - the framework

### 3.1 Core concept

PluginForge builds on pluggy and adds:

| Feature | pluggy | PluginForge |
|---------|--------|-------------|
| Hook specs and hook impls | Yes | Yes (via pluggy) |
| Entry point discovery | Yes | Yes (via pluggy) |
| YAML configuration | No | Yes (app, plugins, i18n) |
| Plugin lifecycle | No | Yes (init, activate, deactivate) |
| Enable/disable per config | No | Yes |
| FastAPI router integration | No | Yes (plugin routes mounted automatically) |
| DB migration support | No | Yes (Alembic per plugin) |
| Plugin dependencies | No | Yes (declarative in YAML) |
| Frontend plugin loading | No | Yes (manifest for UI components) |
| API versioning | No | Yes (hook specs versioned) |

### 3.2 Configuration system

Everything application-specific lives in YAML files. No hardcoded strings.

**App configuration (`config/app.yaml`):**

```yaml
app:
  name: "Bibliogon"
  version: "0.2.0"
  description: "Open-source book authoring platform"
  default_language: "de"
  supported_languages: ["de", "en", "es", "fr", "el"]

plugins:
  entry_point_group: "bibliogon.plugins"
  config_dir: "config/plugins"
  enabled:
    - "export"
    - "kdp"
  disabled:
    - "audiobook"

ui:
  title: "Bibliogon"
  subtitle: "Write and export books"
  logo: "assets/logo.svg"
  theme: "warm-literary"
```

**Plugin configuration (`config/plugins/export.yaml`):**

```yaml
plugin:
  name: "export"
  display_name:
    de: "Buch-Export"
    en: "Book Export"
    es: "Exportar libro"
    fr: "Export de livre"
  description:
    de: "EPUB, PDF und Projektstruktur-Export via Pandoc"
    en: "EPUB, PDF and project structure export via Pandoc"
  version: "1.0.0"
  license: "MIT"
  depends_on: []            # no dependencies
  api_version: "1"          # compatible with hook spec v1

settings:
  pandoc_path: "pandoc"
  default_format: "epub"
  pdf_engine: "xelatex"
  toc_depth: 2

formats:
  - id: "epub"
    label: { de: "EPUB", en: "EPUB" }
    extension: "epub"
    media_type: "application/epub+zip"
  - id: "pdf"
    label: { de: "PDF", en: "PDF" }
    extension: "pdf"
    media_type: "application/pdf"
  - id: "project"
    label: { de: "Projektstruktur (ZIP)", en: "Project Structure (ZIP)" }
    extension: "zip"
    media_type: "application/zip"
```

**Internationalization (`config/i18n/de.yaml`):**

```yaml
ui:
  dashboard:
    title: "Meine Buecher"
    new_book: "Neues Buch"
    no_books: "Noch keine Buecher"
    confirm_delete: "Buch wirklich loeschen?"
  editor:
    new_chapter: "Neues Kapitel"
    confirm_delete_chapter: "Kapitel wirklich loeschen?"
    placeholder: "Beginne zu schreiben..."
    saving: "Speichert..."
    saved: "Gespeichert"
  export:
    title: "Export"
  common:
    cancel: "Abbrechen"
    create: "Erstellen"
    delete: "Loeschen"
    save: "Speichern"
```

For a different application (e.g. a podcast tool) you only change the YAML files:

```yaml
# config/app.yaml for a podcast tool
app:
  name: "PodForge"
  version: "1.0.0"

plugins:
  entry_point_group: "podforge.plugins"
  enabled: ["recording", "editing", "publishing"]

ui:
  title: "PodForge"
  subtitle: "Record, edit, publish"
```

### 3.3 Why pluggy as the base

pluggy is the de-facto standard for Python plugin systems. pytest, tox, datasette and kedro use it. It provides:

- Hook specification and hook implementation as decorators
- Entry point discovery (`load_setuptools_entrypoints`)
- firstresult hooks (the first return value wins)
- Call-order management (trylast, tryfirst)
- Type-safe hook calls

PluginForge does not reinvent the wheel, it adds the layers pluggy is missing: configuration, lifecycle, web integration.

### 3.4 Plugin interface (v0.5.0)

```python
# pluginforge/base.py (PyPI package, not local)

from abc import ABC
from typing import Any

class BasePlugin(ABC):
    name: str
    version: str = "0.1.0"
    api_version: str = "1"
    description: str = ""
    author: str = ""
    depends_on: list[str] = []        # plugin dependencies as a class attribute
    config_schema: dict[str, type] | None = None  # optional config validation

    def init(self, app_config, plugin_config) -> None: ...
    def activate(self) -> None: ...
    def deactivate(self) -> None: ...
    def get_routes(self) -> list: ...           # FastAPI router
    def get_frontend_manifest(self) -> dict | None: ...  # UI manifest
    def health(self) -> dict[str, Any]: ...     # health check
    def get_migrations_dir(self) -> str | None: ...      # Alembic
```

```python
# Bibliogon main.py - integration with PluginForge v0.5.0
from pluginforge import PluginManager

manager = PluginManager(
    config_path="config/app.yaml",
    pre_activate=license_check,  # callback before plugin activation
    api_version="1",
)
manager.register_hookspecs(BibliogonHookSpec)
manager.discover_plugins()       # load entry points, filter, sort, activate
manager.mount_routes(app)        # mount FastAPI routers (prefix="/api")

# runtime API
manager.get_active_plugins()     # list of active plugins
manager.get_plugin("export")     # plugin instance by name
manager.deactivate_plugin("x")   # deactivate + hook unregister
manager.reload_plugin("x")       # hot reload
manager.reload_config()           # reload config from disk
manager.health_check()            # health of all plugins
manager.get_load_errors()         # errors during loading
manager.call_hook("hook_name")    # invoke a hook
manager.get_text("key", "de")     # i18n string
```

### 3.5 PluginForge repository

PluginForge is a standalone PyPI package: https://github.com/astrapi69/pluginforge

```
pluginforge/       # own repo, not part of Bibliogon
├── pluginforge/
│   ├── __init__.py          # public API: BasePlugin, PluginManager
│   ├── base.py              # BasePlugin ABC (lifecycle, routes, health, manifest)
│   ├── manager.py           # PluginManager (wraps pluggy, pre_activate, hot reload)
│   ├── config.py            # YAML config loader
│   ├── discovery.py         # entry points + topological sort
│   ├── lifecycle.py         # init/activate/deactivate control
│   ├── fastapi_ext.py       # mount FastAPI routers (configurable prefix)
│   ├── alembic_ext.py       # collect Alembic migrations
│   ├── i18n.py              # multi-language strings from YAML
│   └── security.py          # plugin name validation, path traversal prevention
├── tests/
├── pyproject.toml
├── README.md
└── LICENSE
```

Dependencies: `pluggy`, `pyyaml`. Nothing else. FastAPI and Alembic are optional extras:

```toml
[tool.poetry.dependencies]
pluggy = "^1.5.0"
pyyaml = "^6.0"

[tool.poetry.extras]
fastapi = ["fastapi"]
migrations = ["alembic"]
```

---

## 4. Bibliogon app

### 4.1 Data model

**Current (v0.7.0):**

```
Book
  id: str (UUID)
  title: str
  subtitle: str?
  author: str
  language: str (default: "de")
  series: str?
  series_index: int?
  description: str?
  # Publishing
  edition: str?
  publisher: str?
  publisher_city: str?
  publish_date: str?
  isbn_ebook: str?
  isbn_paperback: str?
  isbn_hardcover: str?
  asin_ebook: str?
  asin_paperback: str?
  asin_hardcover: str?
  # Marketing
  keywords: str? (JSON array)
  html_description: str?
  backpage_description: str?
  backpage_author_bio: str?
  # Design
  cover_image: str?
  custom_css: str?
  # Timestamps
  created_at: datetime
  updated_at: datetime
  deleted_at: datetime? (soft delete)
  chapters: [Chapter]
  assets: [Asset]

ChapterType (enum, 14 values)
  CHAPTER, PREFACE, FOREWORD, ACKNOWLEDGMENTS,
  ABOUT_AUTHOR, APPENDIX, BIBLIOGRAPHY, GLOSSARY,
  EPILOGUE, IMPRINT, NEXT_IN_SERIES, PART_INTRO,
  INTERLUDE, TABLE_OF_CONTENTS

Chapter
  id: str (UUID)
  book_id: str (FK -> Book)
  title: str
  content: str (TipTap JSON, see 4.3)
  position: int
  chapter_type: ChapterType (default: CHAPTER)
  created_at: datetime
  updated_at: datetime

Asset
  id: str
  book_id: str (FK -> Book)
  filename: str
  asset_type: str (cover, figure, diagram, table)
  path: str
  uploaded_at: datetime
```

**Earlier versions:**

```
UserBackup (v0.4.0 - now replaced by the .bgb backup)
  id: str
  created_at: datetime
  format: str (zip)
  path: str
```

### 4.2 Integration with PluginForge v0.5.0

```python
# bibliogon/backend/app/main.py

from pluginforge import PluginManager

manager = PluginManager(
    config_path="config/app.yaml",
    pre_activate=license_check,  # license check before activation
    api_version="1",
)
manager.register_hookspecs(BibliogonHookSpec)
manager.discover_plugins()
manager.mount_routes(app)  # mount FastAPI routers

# Health check and load errors
@app.get("/api/plugins/health")
def health(): return manager.health_check()

@app.get("/api/plugins/errors")
def errors(): return manager.get_load_errors()
```

### 4.3 Internal storage format

TipTap can store content as HTML or as JSON. We use **TipTap JSON** as the internal format:

- Structured and machine-readable
- Lossless roundtrips (JSON -> editor -> JSON)
- Easier to transform than HTML (e.g. for export)
- Editor-independent (migratable to another editor)

On export the export plugin converts TipTap JSON to Markdown (for write-book-template) or HTML (for EPUB). The conversion is therefore a plugin responsibility, not a core responsibility.

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "Chapter 1" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Once upon a time..." }]
    }
  ]
}
```

### 4.4 Export as a plugin

The entire export is a plugin (`bibliogon-plugin-export`):

```
bibliogon-plugin-export/
├── pyproject.toml
├── bibliogon_export/
│   ├── __init__.py
│   ├── plugin.py            # ExportPlugin(BasePlugin)
│   ├── hookimpls.py         # hook implementations
│   ├── scaffolder.py        # write-book-template directory structure
│   ├── pandoc_runner.py     # Pandoc calls
│   ├── tiptap_to_md.py      # TipTap JSON -> Markdown conversion
│   └── routes.py            # /api/books/{id}/export/{fmt}
├── config/
│   └── export.yaml
└── tests/
```

```toml
# bibliogon-plugin-export/pyproject.toml
[project.entry-points."bibliogon.plugins"]
export = "bibliogon_export.plugin:ExportPlugin"
```

### 4.5 write-book-template directory structure

On export the plugin produces:

```
{book-title}/
├── manuscript/
│   ├── chapters/
│   │   ├── 01-chapter-title.md
│   │   ├── 02-chapter-title.md
│   ├── front-matter/
│   │   ├── toc.md
│   │   ├── preface.md
│   │   ├── foreword.md
│   │   └── acknowledgments.md
│   ├── back-matter/
│   │   ├── about-the-author.md
│   │   ├── appendix.md
│   │   ├── bibliography.md
│   │   ├── glossary.md
│   │   └── index.md
│   ├── figures/
│   └── tables/
├── assets/
│   ├── covers/
│   └── figures/
│       ├── diagrams/
│       └── infographics/
├── config/
│   ├── metadata.yaml
│   ├── styles.css
│   └── template.tex          (optional)
├── output/
│   ├── book.epub
│   └── book.pdf
├── scripts/
├── README.md
└── pyproject.toml             (optional)
```

Mapping DB -> filesystem:

| Bibliogon (DB) | write-book-template (filesystem) |
|----------------|----------------------------------|
| `Book.title` | project folder name, `config/metadata.yaml` -> `title` |
| `Book.subtitle` | `config/metadata.yaml` -> `subtitle` |
| `Book.author` | `config/metadata.yaml` -> `author`, `back-matter/about-the-author.md` |
| `Book.language` | `config/metadata.yaml` -> `lang` |
| `Book.series` | `config/metadata.yaml` -> `series` |
| `Book.series_index` | `config/metadata.yaml` -> `series_index` |
| `Book.description` | `config/metadata.yaml` -> `description` |
| `Chapter.title` | filename `{NN}-{slug}.md`, H1 in the content |
| `Chapter.content` | Markdown body (converted from TipTap JSON) |
| `Chapter.position` | numeric prefix (`01-`, `02-`, ...) |

### 4.6 Offline/local-first

Bibliogon has to work completely offline:

- SQLite as the default DB (no external DB required)
- All assets local on the filesystem
- Frontend deliverable as static files (no CDN forced)
- Premium plugin licenses validatable offline (signed license keys, no license server required)
- Only exception: plugins that call external APIs (TTS, AI help) naturally need network access

### 4.7 Backup

Full-data backup as a ZIP:

```
bibliogon-backup-2026-03-26/
├── books/
│   ├── {book-id-1}/
│   │   ├── book.json          # book metadata
│   │   ├── chapters/
│   │   │   ├── {chapter-id}.json  # chapter with TipTap JSON
│   │   │   └── ...
│   │   └── assets/            # associated images
│   └── {book-id-2}/
│       └── ...
├── settings.json              # app settings
└── manifest.json              # backup metadata, version, date
```

Importing a backup restores the entire state. Independent of the export plugin (which produces the write-book-template structure).

---

## 5. Business model

| Layer | License | Content |
|-------|---------|---------|
| PluginForge | MIT (free) | Framework, usable by anyone |
| Bibliogon core | MIT (free) | UI, editor, Book/Chapter CRUD, backup |
| plugin-export | MIT (free) | EPUB, PDF, project structure |
| Community plugins | MIT (free) | Developed by the community |
| Premium plugins | Proprietary (paid) | Audiobook, children's books, KDP, collaboration |

### 5.1 Plugin catalog

**Free (MIT):**

| Plugin | Type | Description |
|--------|------|-------------|
| `plugin-export` | Export | EPUB, PDF, write-book-template ZIP |
| `plugin-characters` | Structure | Character database, relationship graph |
| `plugin-wordcount` | Editor | Word count per chapter and total |

**Premium:**

| Plugin | Type | Description | Depends on |
|--------|------|-------------|------------|
| `plugin-kinderbuch` | Export + editor | One-image-per-page layout, special templates | plugin-export |
| `plugin-kdp` | Export | KDP metadata, cover validation, preview | plugin-export |
| `plugin-audiobook` | Export | Text-to-speech, MP3/M4B, chapter markers | plugin-export |
| `plugin-grammar` | Editor | LanguageTool integration | - |
| `plugin-ai-assist` | Editor | AI writing help | - |
| `plugin-collaboration` | Structure | Multi-user real-time editing | - |
| `plugin-versioning` | Editor | Chapter version history with diff | - |
| `plugin-docx` | Export | Word export for editors | plugin-export |

### 5.2 Plugin dependencies

Declared in the plugin YAML:

```yaml
plugin:
  name: "kinderbuch"
  depends_on: ["export"]
```

On load PluginForge verifies that all dependencies are active (topological sort). Missing dependencies cause the plugin to be skipped with a warning (visible via `get_load_errors()`). Dependencies are now declared as a class attribute:

```python
class KinderbuchPlugin(BasePlugin):
    name = "kinderbuch"
    depends_on = ["export"]
```

### 5.3 Plugin licensing (offline)

Licensing is Bibliogon-specific (not part of PluginForge) and lives in `backend/app/licensing.py`. The check runs via a `pre_activate` callback on the PluginManager:

```python
manager = PluginManager(
    config_path="config/app.yaml",
    pre_activate=license_check,  # return False -> plugin is not activated
)
```

Premium plugins use HMAC-SHA256 signed license keys:

```
BIBLIOGON-KINDERBUCH-v1-<base64 payload>.<base64 signature>
```

The key contains (base64-encoded + signed):
- Plugin name and version
- Expiry date (or "lifetime")
- Machine ID (optional, for single-seat licenses)

Validation happens locally. No license server required, no internet required. Licenses are stored in `config/licenses.json` and managed through the Settings UI.

#### License tiers

Every plugin has a `license_tier` class attribute:

| Tier | Description | License check |
|------|-------------|----------------|
| `core` | Free, always works | None |
| `premium` | Needs a valid license key | HMAC-SHA256 |

| Plugin | Tier |
|--------|------|
| export | core |
| help | core |
| getstarted | core |
| ms-tools | core |
| grammar | premium |
| kinderbuch | premium |
| kdp | premium |
| audiobook | premium |
| translation | premium |

#### Trial keys

Trial keys unlock all premium plugins for a limited time:

- Plugin name in the payload is `"*"` (wildcard, matches every plugin)
- Default duration: 30 days
- Generation: `make generate-trial-key`
- Storage: `licenses.json` under the key `"*"`
- Format: `BIBLIOGON-*-v1-<base64 payload>.<base64 signature>`

---

## 5.4 Plugin installation (ZIP)

Third-party plugins can be installed as a ZIP file via the Settings UI. Installation happens dynamically at runtime (strategy B: dynamic loading).

**ZIP structure:**

```
my-plugin.zip
└── my-plugin/
    ├── plugin.yaml          # plugin configuration (required)
    ├── my_plugin/           # Python package (required)
    │   ├── __init__.py
    │   ├── plugin.py        # plugin class (BasePlugin subclass)
    │   └── routes.py        # optional FastAPI router
    └── requirements.txt     # optional dependencies
```

**plugin.yaml minimum content:**

```yaml
plugin:
  name: "my-plugin"
  display_name:
    de: "Mein Plugin"
    en: "My Plugin"
  description:
    de: "Beschreibung"
    en: "Description"
  version: "1.0.0"
  license: "MIT"
  depends_on: []
  api_version: "1"
  entry_point: "my_plugin.plugin"  # optional, auto-detected

settings:
  # plugin-specific settings
```

**Installation flow:**

1. User uploads the ZIP through Settings > Plugins > "Install ZIP"
2. Backend validates the ZIP structure (plugin.yaml, Python package, plugin.py)
3. Extraction to `plugins/installed/{plugin-name}/`
4. Plugin config is copied to `config/plugins/{name}.yaml`
5. Plugin is added to `sys.path` and registered dynamically
6. Plugin shows up in the settings and can be configured

**Security:**

- Plugin names are validated (lowercase letters, digits, hyphens only)
- ZIP paths are checked for path traversal
- Plugins run in the same process (no sandboxing) - only install trusted plugins

**API endpoints:**

- `POST /api/plugins/install` - upload and install a plugin ZIP
- `DELETE /api/plugins/install/{name}` - uninstall a plugin
- `GET /api/plugins/installed` - list installed plugins

### 5.5 Plugin UI strategy (manifest-driven)

Plugins can declare UI extensions through the `get_frontend_manifest()` method. The frontend queries `GET /api/plugins/manifests` and renders predefined UI slots.

**Predefined UI slots:**

| Slot | Description | Location in the app |
|------|-------------|---------------------|
| `sidebar_actions` | Buttons in the chapter sidebar | BookEditor sidebar |
| `toolbar_buttons` | Buttons in the editor toolbar | Editor toolbar |
| `editor_panels` | Panels next to the editor | BookEditor |
| `settings_section` | Additional settings | Settings > Plugins |
| `export_options` | Options in the export dialog | ExportDialog |

**Manifest example (export plugin):**

```python
def get_frontend_manifest(self) -> dict | None:
    return {
        "sidebar_actions": [
            {
                "id": "export_epub",
                "label": {"de": "EPUB exportieren", "en": "Export EPUB"},
                "icon": "download",
                "action": "/api/books/{book_id}/export/epub",
            }
        ],
        "export_options": [
            {
                "id": "toc_depth",
                "type": "select",
                "label": {"de": "Inhaltsverzeichnis-Tiefe", "en": "TOC Depth"},
                "options": [1, 2, 3, 4],
                "default": 2,
            }
        ],
    }
```

**Strategy for complex plugin UIs:**

For plugins that go beyond simple manifest declarations (e.g. interactive preview, complex forms), Web Components as custom elements can be delivered. The plugin ZIP then contains a compiled JS bundle that is loaded through a defined slot.

## 6. API versioning

Hook specs are versioned. Plugins declare which API version they support:

```python
# bibliogon/hookspecs.py - version 1
import pluggy
hookspec = pluggy.HookspecMarker("bibliogon.plugins")

class BibliogonHookSpec:
    @hookspec
    def export_formats(self) -> list[dict]:
        """Return list of supported export formats."""

    @hookspec(firstresult=True)
    def export_execute(self, book, fmt: str, options: dict) -> Path:
        """Execute an export. First plugin to return wins."""
```

When hooks change, a new spec version is created (v2). Old plugins (api_version: "1") keep working as long as the v1 hooks are not removed. Deprecation warnings on old hooks.

---

## 7. Roadmap

Feature details and open items see docs/ROADMAP.md (with IDs for prompt references).

| Phase | Version | Status |
|-------|---------|--------|
| 1: MVP | v0.1.0 | done |
| 2: PluginForge framework | v0.2.0 | done |
| 3: Export as a plugin | v0.3.0 | done |
| 4: Import, backup, chapter types | v0.4.0 | done |
| 5: First premium plugins (kinderbuch, kdp) | v0.5.0 | done |
| 6: Editor extensions, i18n, themes | v0.6.0 | done |
| 7: Extended metadata, publishing | v0.7.0 | done |
| 8: Manuscript quality, editor, export | v0.9.0 | done |
| 9: Translation, audiobook, infrastructure | v0.10.0 | done (current) |
| 10: Multi-user and SaaS | v1.0.0 | next phase |

---

## 8. Scope

### What Bibliogon is

- A web UI for writing books
- Built on PluginForge (reusable plugin framework)
- Offline-capable and local-first
- A generator for write-book-template project structures (via a plugin)
- An EPUB/PDF export tool via Pandoc (via a plugin)
- Open source with SaaS potential

### What PluginForge is

- An extension layer on top of pluggy, not a replacement
- Application-agnostic, reusable
- YAML-configurable (title, labels, settings, i18n)
- With FastAPI integration and DB migration support

### What neither is

- Not an AI text generator (but extensible via a plugin)
- Not a collaborative real-time tool (but extensible via a plugin)
- Not a layout program (no InDesign replacement)

---

## 9. Competitive analysis

| Tool | Open source | Web | Offline | Plugin system | Project structure |
|------|-------------|-----|---------|---------------|-------------------|
| Scrivener | No | No | Yes | No | Proprietary |
| Reedsy Studio | No | Yes | No | No | No |
| Manuskript | Yes | No | Yes | No | Proprietary |
| Obsidian | No | No | Yes | Yes (community) | No |
| VS Code | Yes | Yes | Yes | Yes (extensions) | No |
| **Bibliogon** | **Yes** | **Yes** | **Yes** | **Yes (PluginForge)** | **write-book-template** |

No other authoring tool combines open source, a web UI, offline capability, a real plugin framework on top of pluggy, and a standardized Pandoc-compatible project structure.

---

## 10. Open questions

1. ~~**PluginForge name:** is `pluginforge` available as a PyPI package name?~~ Done - published on PyPI as `pluginforge`.

2. **Frontend plugin loading:** dynamic loading of React components at runtime (module federation, importmaps) or static bundling at build time?

3. **PluginForge scope frontend:** should PluginForge also have an npm counterpart for frontend plugin loading, or does that stay Bibliogon-specific?

4. **Plugin DB migrations:** Alembic with multiple `versions` folders (one per plugin) or a central folder with a plugin prefix?

5. **TipTap JSON size:** for long chapters TipTap JSON can be noticeably larger than HTML. Check relevance for SQLite performance before phase 7 (PostgreSQL).
