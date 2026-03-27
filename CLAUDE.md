# Bibliogon

Open-source book authoring platform. Aufgebaut auf PluginForge (PyPI), einem wiederverwendbaren Plugin-Framework basierend auf pluggy. Der gesamte Export ist selbst ein Plugin. Offline-faehig, i18n-ready, local-first, mit Dark Mode.

**Repository:** https://github.com/astrapi69/bibliogon
**PluginForge:** https://github.com/astrapi69/pluginforge (PyPI: pluginforge ^0.5.0)
**Konzept:** docs/CONCEPT.md
**Version:** 0.6.0

## Architektur (Zwei-Schichten)

1. **PluginForge** (externes PyPI-Paket, basiert auf pluggy)
   - PluginManager: wraps pluggy + YAML-Config + Lifecycle + Dependency Resolution
   - FastAPI-Router-Integration (Plugins liefern eigene Router)
   - pre_activate Callback (z.B. fuer Lizenzpruefung)
   - Health Checks, Hot Reload, Plugin Introspection
   - i18n ueber YAML (config/i18n/{lang}.yaml)
   - Anwendungsunabhaengig, jeder kann es nutzen

2. **Bibliogon App** (dieses Repo)
   - Schlanker Kern: UI, Editor, Book/Chapter CRUD, Backup/Restore
   - Offline-Lizenzierung (HMAC-SHA256, LicenseStore) - bibliogon-spezifisch
   - Alles Weitere via Plugins: Export, Kinderbuch, KDP, Grammar, Help, Get Started

## Tech Stack

- **PluginForge:** Python 3.11+, pluggy, PyYAML (PyPI: pluginforge ^0.5.0)
- **Backend:** FastAPI, SQLAlchemy, SQLite, Pydantic v2
- **Frontend:** React 18, TypeScript, TipTap (JSON-Format), Vite, Lucide Icons
- **Export-Plugin:** manuscripta (PyPI ^0.6.0), Pandoc, write-book-template Struktur
- **Tooling:** Poetry, npm, Docker, Make

## Befehle

```bash
# Entwicklung
make install              # Alle Abhaengigkeiten (Poetry, npm, Plugins)
make dev                  # Backend (8000) + Frontend (5173) parallel, Strg+C stoppt beide
make dev-bg               # Hintergrund-Modus
make dev-down             # Hintergrund stoppen

# Tests
make test                 # ALLE Tests (alle Plugins + Backend)
make test-backend         # Nur Backend-Tests
make test-plugins         # Alle 4 Plugin-Tests
make test-plugin-export   # Nur Export-Plugin
make test-plugin-grammar  # Nur Grammar-Plugin
make test-plugin-kdp      # Nur KDP-Plugin
make test-plugin-kinderbuch # Nur Kinderbuch-Plugin

# Produktion
make prod                 # Docker Compose build + start
make prod-down            # Docker stoppen
make prod-logs            # Docker Logs verfolgen

# Sonstiges
make clean                # Build-Artefakte und Caches entfernen
make help                 # Alle Targets anzeigen
```

## Verzeichnisstruktur

```
bibliogon/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI Entry, PluginManager Init, pre_activate License Check
│   │   ├── database.py          # SQLAlchemy + SQLite
│   │   ├── hookspecs.py         # pluggy Hook-Specs (export_formats, export_execute, chapter_pre_save)
│   │   ├── licensing.py         # LicenseValidator, LicensePayload, LicenseStore (bibliogon-spezifisch)
│   │   ├── models/              # Book, Chapter (mit ChapterType), Asset
│   │   ├── schemas/             # Pydantic Request/Response (ChapterType Enum, AssetOut)
│   │   ├── routers/
│   │   │   ├── books.py         # Book CRUD
│   │   │   ├── chapters.py      # Chapter CRUD + Reorder
│   │   │   ├── assets.py        # Asset Upload/Delete
│   │   │   ├── backup.py        # Full-Data Backup, Restore, Project Import
│   │   │   ├── licenses.py      # License Management (activate, list, deactivate)
│   │   │   └── settings.py      # Settings API (app.yaml + Plugin-Config lesen/schreiben)
│   │   └── services/
│   ├── config/
│   │   ├── app.yaml             # App-Konfiguration
│   │   ├── plugins/             # Plugin-YAML-Dateien (export, kdp, kinderbuch, grammar, help, getstarted)
│   │   └── i18n/                # de.yaml, en.yaml, es.yaml, fr.yaml, el.yaml
│   ├── tests/
│   │   ├── test_api.py          # CRUD Smoke Tests
│   │   └── test_phase4.py       # ChapterType, Assets, Backup, Import Tests
│   └── pyproject.toml
├── plugins/
│   ├── bibliogon-plugin-export/         # EPUB, PDF, ZIP Export (MIT)
│   │   ├── bibliogon_export/
│   │   │   ├── plugin.py                # ExportPlugin(BasePlugin)
│   │   │   ├── tiptap_to_md.py          # TipTap-JSON -> Markdown
│   │   │   ├── scaffolder.py            # write-book-template Struktur
│   │   │   ├── pandoc_runner.py         # Wrapper um manuscripta compile_book()
│   │   │   └── routes.py               # /api/books/{id}/export/{fmt} (epub,pdf,docx,html,markdown,project)
│   │   └── tests/                       # 23 Tests
│   ├── bibliogon-plugin-kinderbuch/     # Kinderbuch-Layout (Proprietary, depends_on: export)
│   │   ├── bibliogon_kinderbuch/
│   │   │   ├── plugin.py               # KinderbuchPlugin
│   │   │   ├── page_layout.py          # Bild-pro-Seite Layout Engine (4 Templates)
│   │   │   └── routes.py               # /api/kinderbuch/templates, /preview
│   │   └── tests/                       # 8 Tests
│   ├── bibliogon-plugin-kdp/           # Amazon KDP (Proprietary, depends_on: export)
│   │   ├── bibliogon_kdp/
│   │   │   ├── plugin.py               # KdpPlugin
│   │   │   ├── cover_validator.py      # Cover-Validierung + Metadaten-Generator
│   │   │   └── routes.py               # /api/kdp/metadata, /validate-cover
│   │   └── tests/                       # 10 Tests
│   ├── bibliogon-plugin-grammar/        # LanguageTool (Proprietary)
│   │   ├── bibliogon_grammar/
│   │   │   ├── plugin.py               # GrammarPlugin (mit health check)
│   │   │   ├── languagetool.py         # Async LanguageTool API Client
│   │   │   └── routes.py               # /api/grammar/check, /languages
│   │   └── tests/                       # 7 Tests
│   ├── bibliogon-plugin-help/           # In-App Hilfe (MIT)
│   │   ├── bibliogon_help/
│   │   │   ├── plugin.py               # HelpPlugin
│   │   │   ├── content.py              # Shortcuts, FAQ, About aus YAML
│   │   │   └── routes.py               # /api/help/shortcuts, /faq, /about
│   │   └── tests/
│   └── bibliogon-plugin-getstarted/     # Onboarding (MIT)
│       ├── bibliogon_getstarted/
│       │   ├── plugin.py               # GetStartedPlugin
│       │   ├── guide.py                # Schritt-fuer-Schritt Anleitung + Beispielbuch
│       │   └── routes.py               # /api/get-started/guide, /sample-book
│       └── tests/
├── frontend/
│   ├── src/
│   │   ├── api/client.ts        # Typed API Client (Books, Chapters, Assets, Backup, Licenses, Settings)
│   │   ├── hooks/useTheme.ts    # Dark/Light Theme Hook mit localStorage
│   │   ├── components/
│   │   │   ├── Editor.tsx       # TipTap WYSIWYG + Markdown-Modus, Autosave, Wortzaehler
│   │   │   ├── Toolbar.tsx      # Formatting Toolbar + Markdown Toggle
│   │   │   ├── ChapterSidebar.tsx # Kapitel-Sidebar mit Drag-and-Drop, Sektionen
│   │   │   ├── ThemeToggle.tsx  # Dark/Light Mode Button
│   │   │   ├── ExportDialog.tsx  # Export-Modal (Format, Buchtyp, TOC-Tiefe)
│   │   │   ├── BookCard.tsx     # Buch-Karte fuer Dashboard
│   │   │   └── CreateBookModal.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # Buch-Liste, Backup/Import/Projekt-Import
│   │   │   ├── BookEditor.tsx   # Editor-Layout mit Sidebar
│   │   │   ├── Settings.tsx     # Einstellungen (App, Plugins, Lizenzen)
│   │   │   ├── Help.tsx         # Hilfe (Shortcuts, FAQ, About)
│   │   │   └── GetStarted.tsx   # Erste Schritte mit Fortschrittsanzeige
│   │   └── styles/global.css    # CSS Variables, Light + Dark Theme
│   ├── package.json
│   └── vite.config.ts
├── docs/CONCEPT.md
├── Makefile
├── docker-compose.yml, docker-compose.prod.yml
└── README.md
```

## Konventionen

- Python mit Typehints, TypeScript ohne `any`
- Keine Em-Dashes (--), stattdessen Bindestriche (-) oder Kommata
- Commit Messages: Englisch, konventionell (feat/fix/refactor/docs)
- Konfigurierbare Werte in YAML, nicht hartcodiert
- i18n: Alle UI-Strings in config/i18n/{lang}.yaml
- Internes Speicherformat: TipTap JSON (nicht HTML)
- SQLAlchemy 2.0 Mapped Columns, Pydantic v2 mit ConfigDict(from_attributes=True)
- CSS Theming via Custom Properties, Dark Mode via [data-theme="dark"]
- Plugins sind eigenstaendige Pakete unter plugins/
- Jedes Plugin hat eigene Tests unter tests/
- Plugin-Abhaengigkeiten als Klassen-Attribut: `depends_on = ["export"]`
- Lizenzierung ist bibliogon-spezifisch (app/licensing.py), nicht Teil von PluginForge
- Export nutzt manuscripta (PyPI) - Plugin-Config in export.yaml ist 1:1 manuscripta export-settings.yaml Format
- Settings-UI: Skalare Werte (string, number) editierbar, Listen/Dicts read-only anzeigen
- Export-Workflow: Sidebar "Exportieren" Button oeffnet Dialog mit Format/Buchtyp/TOC-Tiefe Auswahl

## PluginForge v0.5.0 API (Kurzreferenz)

```python
# Manager erstellen mit pre_activate Callback fuer Lizenzpruefung
manager = PluginManager(
    config_path="config/app.yaml",
    pre_activate=license_check_callback,
    api_version="1",
)
manager.register_hookspecs(MyHookSpec)
manager.discover_plugins()
manager.mount_routes(fastapi_app)  # prefix default "/api"

# Laufzeit
manager.get_active_plugins()       # Liste aktiver Plugins
manager.get_plugin("export")       # Plugin-Instanz nach Name
manager.deactivate_plugin("name")  # Deaktivieren + Hook-Unregister
manager.reload_plugin("name")      # Hot Reload
manager.reload_config()            # Config von Disk neu laden
manager.health_check()             # Health aller Plugins
manager.get_load_errors()          # Fehler beim Laden
manager.call_hook("hook_name")     # Hook aufrufen
manager.get_text("key", "de")      # i18n String
```

## API-Endpunkte

### Kern

- GET/POST /api/books
- GET/PATCH/DELETE /api/books/{id}
- GET/POST /api/books/{id}/chapters
- GET/PATCH/DELETE /api/books/{id}/chapters/{cid}
- PUT /api/books/{id}/chapters/reorder
- GET/POST /api/books/{id}/assets
- DELETE /api/books/{id}/assets/{aid}
- GET /api/backup/export
- POST /api/backup/import
- POST /api/backup/import-project
- GET/POST/DELETE /api/licenses
- GET/PATCH /api/settings/app
- GET /api/settings/plugins
- GET/PATCH /api/settings/plugins/{name}
- POST /api/settings/plugins/{name}/enable
- POST /api/settings/plugins/{name}/disable
- GET /api/plugins/manifests
- GET /api/plugins/health
- GET /api/plugins/errors
- GET /api/i18n/{lang}
- GET /api/health

### Plugin-Routen (via PluginForge)

- GET /api/books/{id}/export/{epub|pdf|project}
- GET /api/kinderbuch/templates
- POST /api/kinderbuch/preview
- POST /api/kdp/metadata
- POST /api/kdp/validate-cover
- GET /api/kdp/categories
- POST /api/grammar/check
- GET /api/grammar/languages
- GET /api/help/shortcuts
- GET /api/help/faq
- GET /api/help/about
- GET /api/get-started/guide
- GET /api/get-started/sample-book

## Datenmodell

Book: id, title, subtitle, author, language, series, series_index, description, created_at, updated_at
Chapter: id, book_id (FK), title, content (TipTap JSON), position, chapter_type (enum), created_at, updated_at
Asset: id, book_id (FK), filename, asset_type (cover/figure/diagram/table), path, uploaded_at

ChapterType: chapter, preface, foreword, acknowledgments, about_author, appendix, bibliography, glossary

## Plugins

| Plugin            | Lizenz      | Abhaengigkeit | Beschreibung                        |
| ----------------- | ----------- | ------------- | ----------------------------------- |
| plugin-export     | MIT         | -             | EPUB, PDF, write-book-template ZIP  |
| plugin-kinderbuch | Proprietary | plugin-export | Bild-pro-Seite Layout, 4 Templates  |
| plugin-kdp        | Proprietary | plugin-export | KDP-Metadaten, Cover-Validierung    |
| plugin-grammar    | Proprietary | -             | LanguageTool Grammatikpruefung      |
| plugin-help       | MIT         | -             | In-App Hilfe, Shortcuts, FAQ        |
| plugin-getstarted | MIT         | -             | Onboarding, Beispielbuch            |

## Erledigte Phasen

### Phase 1: MVP (v0.1.0) - erledigt

- Book/Chapter CRUD, TipTap Editor, Pandoc Export, Docker

### Phase 2: PluginForge (v0.2.0) - erledigt

- PluginManager auf pluggy, YAML-Config, Lifecycle, FastAPI-Integration
- Entry Point Discovery, Hook-Specs

### Phase 3: Export als Plugin (v0.3.0) - erledigt

- bibliogon-plugin-export (TipTap-JSON -> Markdown, Scaffolder, Pandoc)
- Alter Export-Code entfernt, Editor auf TipTap-JSON umgestellt

### Phase 4: Import, Backup, Kapiteltypen (v0.4.0) - erledigt

- ChapterType Enum, Asset Upload, Full-Data Backup/Restore
- write-book-template ZIP Import

### Phase 5: Premium-Plugins und Lizenzierung (v0.5.0) - erledigt

- Offline-Lizenzierung (HMAC-SHA256, LicenseStore)
- plugin-kinderbuch, plugin-kdp

### Phase 6: Editor-Erweiterungen (v0.6.0) - erledigt

- WYSIWYG/Markdown Umschaltung
- Drag-and-Drop Kapitel-Sortierung
- Autosave-Indikator, Wortzaehler
- plugin-grammar (LanguageTool)
- i18n: ES, FR, EL hinzugefuegt (5 Sprachen total)
- Dark Mode
- Settings-Seite (/settings) mit App-, Plugin- und Lizenz-Konfiguration
- Settings API zum Lesen/Schreiben von YAML-Configs ueber die UI
- PluginForge als PyPI-Paket ausgelagert (pluginforge ^0.5.0)
- Lizenzierung in Backend verschoben (app/licensing.py)
- pre_activate Callback fuer Lizenzpruefung
- plugin-help und plugin-getstarted als Standard-Plugins
- Export-Plugin auf manuscripta umgestellt (kein eigener Pandoc-Aufruf mehr)
- Export-Dialog mit Format/Buchtyp/TOC-Tiefe Auswahl vor dem Export
- Settings: Listen/Dicts read-only, nur skalare Werte editierbar

## Naechste Schritte

Phase 7 - Multi-User und SaaS (v1.0.0):

- Benutzerregistrierung und Authentifizierung
- PostgreSQL statt SQLite
- Pen-Name-Verwaltung
- Plugin-Marketplace
- Abrechnungsintegration (Stripe)

Details: docs/CONCEPT.md

## Tests

58 Tests insgesamt:

- plugin-export: 23 (tiptap_to_md, scaffolder)
- plugin-kinderbuch: 8 (page_layout)
- plugin-kdp: 10 (cover_validator, metadata)
- plugin-grammar: 7 (languagetool)
- backend: 10 (api, phase4)

PluginForge-Tests laufen separat im eigenen Repo (https://github.com/astrapi69/pluginforge).

## Verwandte Projekte

- [pluginforge](https://github.com/astrapi69/pluginforge) - Plugin-Framework (PyPI: pluginforge)
- [manuscripta](https://github.com/astrapi69/manuscripta) - Buch-Export-Pipeline (PyPI: manuscripta) - wird vom Export-Plugin genutzt
- [write-book-template](https://github.com/astrapi69/write-book-template) - Ziel-Verzeichnisstruktur fuer den Export
