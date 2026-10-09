# Bibliogon - concept document

**Repository:** [github.com/astrapi69/bibliogon](https://github.com/astrapi69/bibliogon)
**Related project:** [github.com/astrapi69/write-book-template](https://github.com/astrapi69/write-book-template)
**PluginForge:** [github.com/astrapi69/pluginforge](https://github.com/astrapi69/pluginforge) (PyPI: pluginforge ^0.10.0)

This document describes the architecture and the concept. For version history see `docs/CHANGELOG.md`, for current and planned work see `docs/ROADMAP.md`.

---

## 1. Goal

Bibliogon consists of two parts:

1. **PluginForge** - An application-agnostic plugin framework for Python/FastAPI applications. Built on top of [pluggy](https://pluggy.readthedocs.io/) (the hook system behind pytest), extended with YAML configuration, plugin lifecycle, FastAPI integration and frontend plugin loading. Any developer can use it as the foundation for their own plugin-capable applications.

2. **Bibliogon app** - An open-source web platform for writing and exporting books. The first application built on PluginForge. The entire export (EPUB, PDF, write-book-template structure) is itself a plugin.

The principle: the app core (UI, database, chapter editor) is lean. Everything else - export, children's book mode, audiobook, KDP integration - is delivered via plugins. All plugins are free and open source (MIT). Donations are the current funding model.

Both PluginForge and the Bibliogon core are open source (MIT license).

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
| `bibliogon` | Book authoring platform, uses PluginForge | MIT (all plugins free during development) |

PluginForge is a standalone PyPI package:

```toml
# bibliogon/backend/pyproject.toml
[tool.poetry.dependencies]
pluginforge = {version = "^0.10.0", extras = ["fastapi"]}
```

Another developer can use PluginForge independently:

```toml
# podcast-tool/pyproject.toml
[tool.poetry.dependencies]
pluginforge = "^0.10.0"
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
| Frontend plugin loading | No | Yes (`get_frontend_manifest`), offered by PluginForge, **not used by Bibliogon**; see 5.5 |
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

**Current shape** (the authoritative definition is
`backend/app/models/__init__.py`, summarised in CLAUDE.md's data-model
section; this block is an illustration and names no version on purpose -
it carried "v0.10.0" for fifty releases, #982):

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
| All other plugins | MIT (free) | Audiobook, children's books, KDP, translation, grammar |

### 5.1 Plugin catalog

Every plugin is free and MIT-licensed. The catalog used to be split into
"Free" and "Premium" tiers; that split described a business model the project
did not take. `license_tier` is `"core"` on every plugin and the licensing
infrastructure is dormant (`LICENSING_ENABLED = False`), so one table is the
honest shape.

| Plugin | Type | Description | Depends on |
|--------|------|-------------|------------|
| `plugin-aplus` | Marketing | Amazon A+ Content package, AI-generated from the book's metadata and validated against a per-language ruleset | - |
| `plugin-audiobook` | Export | Text-to-speech via manuscripta (Edge / Google / ElevenLabs / pyttsx3), per-book config | - |
| `plugin-comics` | Editor + export | Multi-panel comic pages, speech bubbles, comic-book PDF | export |
| `plugin-export` | Export | EPUB, PDF, DOCX, HTML, Markdown, LaTeX, write-book-template ZIP, async jobs with SSE | - |
| `plugin-getstarted` | Onboarding | Onboarding flow and example book | - |
| `plugin-git-sync` | Structure | Git-backed import and sync for write-book-template repositories | - |
| `plugin-grammar` | Editor | LanguageTool integration (self-hosted and premium auth) | - |
| `plugin-help` | Core UI | In-app help, shortcuts, FAQ | - |
| `plugin-kdp` | Export | KDP metadata, cover validation, completeness check | export |
| `plugin-kinderbuch` | Editor + export | One-image-per-page picture-book layouts | export |
| `plugin-learnset` | Export | Export a book as a schema-validated adaptive-learner learn set | export |
| `plugin-medium-import` | Structure | Medium HTML-export importer: articles, publications, provenance | - |
| `plugin-ms-tools` | Editor | Style checks, sanitization, text metrics, per-book thresholds | - |
| `plugin-promotion` | Marketing | Portfolio board of retail formats per book: status, store URLs, ASIN | - |
| `plugin-story-bible` | Structure | Per-book fiction-entity database, Storyboard integration, Arc View, continuity checker | - |
| `plugin-translation` | Editor | DeepL / LMStudio translation with a custom settings panel | - |

`backend/tests/test_plugin_handlists.py` checks this table against
`plugins/` in both directions, so a new plugin cannot ship without a row and
a removed one cannot leave a row behind.

**Considered and not built as plugins.** Earlier drafts of this catalog listed
five names that never became packages. Four of them describe work that
happened elsewhere, which is why they are recorded here rather than dropped:

- A `characters` plugin for a character database with a relationship graph -
  shipped as `plugin-story-bible`, which covers characters, settings, plot
  points, items and lore rather than characters alone.
- A `wordcount` plugin for per-chapter and total counts - shipped inside
  `plugin-ms-tools` (metrics) and the editor's own character-count extension.
- A `docx` plugin for Word export - shipped as one of `plugin-export`'s
  formats; a separate package would have split one pipeline across two.
- A `versioning` plugin for chapter history with a diff - shipped in the
  core, not as a plugin: `chapter_versions` plus the manual snapshots are
  part of the editor rather than an add-on.
- An `ai-assist` plugin for AI writing help - the AI surfaces live in the
  core instead (provider abstraction, browser-direct calls with the user's
  own key), because every editor surface wants them, not one plugin.

Real-time multi-user collaboration remains an exploration with no
implementation; see the roadmap rather than this catalog for its state.

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

The codebase contains a dormant HMAC-SHA256 licensing system in `backend/app/licensing.py` (disabled via `LICENSING_ENABLED = False`). All plugins are free and activate without license checks. See `docs/explorations/monetization.md` for reactivation planning.

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

### 5.5 Plugin UI strategy (core frontend, not plugin-shipped)

**Plugins do not contribute UI.** A plugin ships backend routes, hooks and
config; everything the user sees is a core-frontend component rendered
conditionally, gated on `book_type` or on the plugin's activation.

Concretely: React Router routes are static in `frontend/src/App.tsx`, the
editor's TipTap extension array is hardcoded in `Editor.tsx`, and
plugin-specific surfaces (`ComicBookEditor.tsx`, the Story-Bible sidebar, the
KDP wizard) live in `frontend/src/components/`. Activation is detected through
`GET /api/settings/plugins/discovered`; the Settings plugin panel reads its
display name, description and settings block from
`backend/config/plugins/<name>.yaml`.

**A manifest-driven mechanism was specified here and never built.** Through
v0.60.0 this section described `get_frontend_manifest()` +
`GET /api/plugins/manifests` with five predefined slots. The backend half
worked; no frontend code ever queried it. Twelve plugins declared entries, in
up to eight languages, that no user could see, and a third-party plugin
following this documentation would have found its manifest silently ignored.
Removed in #936; the endpoint, the twelve implementations and the client method
are gone.

**Adding UI for a plugin** therefore means a core-frontend change gated on that
plugin's activation.

**Reviving plugin-shipped UI** is a design decision, not a repair. Two
questions have to be answered first: how a declaration names the behaviour it
triggers (an id the core already knows is not extensibility), and whether
plugins ship a compiled JS bundle, with Web Components as custom elements
loaded from the plugin ZIP being the shape previously sketched. Nothing in the
current plugin set needs it: all of them are first-party and already have
their UI.

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

Feature details and open items see `docs/ROADMAP.md` (with IDs for prompt references). Per-version history see `docs/CHANGELOG.md`.

---

## 8. Scope

### What Bibliogon is

- A web UI for writing books
- Built on PluginForge (reusable plugin framework)
- Offline-capable and local-first
- A generator for write-book-template project structures (via a plugin)
- An EPUB/PDF export tool via Pandoc (via a plugin)
- Open source (MIT)

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
