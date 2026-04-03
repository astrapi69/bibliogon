# Bibliogon - Konzeptdokument

**Repository:** [github.com/astrapi69/bibliogon](https://github.com/astrapi69/bibliogon)
**Verwandtes Projekt:** [github.com/astrapi69/write-book-template](https://github.com/astrapi69/write-book-template)
**PluginForge:** [github.com/astrapi69/pluginforge](https://github.com/astrapi69/pluginforge) (PyPI: pluginforge ^0.5.0)
**Version:** 0.7.0
**Stand:** 2026-04-01

---

## 1. Ziel

Bibliogon besteht aus zwei Teilen:

1. **PluginForge** - Ein anwendungsunabhaengiges Plugin-Framework fuer Python/FastAPI-Anwendungen. Aufgebaut auf [pluggy](https://pluggy.readthedocs.io/) (dem Hook-System hinter pytest), erweitert um YAML-Konfiguration, Plugin-Lifecycle, FastAPI-Integration und Frontend-Plugin-Loading. Kann von jedem Entwickler als Grundlage fuer eigene Plugin-faehige Anwendungen genutzt werden.

2. **Bibliogon App** - Eine Open-Source Web-Plattform zum Schreiben und Exportieren von Buechern. Die erste Anwendung, die auf PluginForge aufbaut. Der gesamte Export (EPUB, PDF, write-book-template Struktur) ist selbst ein Plugin.

Das Prinzip: Der App-Kern (UI, Datenbank, Kapitel-Editor) ist schlank. Alles Weitere, Export, Kinderbuch-Modus, Audiobook, KDP-Integration, wird ueber Plugins realisiert. Dadurch entsteht ein Freemium-Modell: Core kostenlos, Premium-Plugins kostenpflichtig.

Langfristiges Ziel ist ein kommerzielles SaaS-Produkt. Sowohl PluginForge als auch der Bibliogon-Kern bleiben Open Source (MIT-Lizenz).

---

## 2. Architektur

### 2.1 Schichtenmodell

```
+----------------------------------------------------------+
|  Bibliogon App (Frontend: React + TipTap)                |
+----------------------------------------------------------+
|  Bibliogon App (Backend: FastAPI, Book/Chapter CRUD)     |
+----------------------------------------------------------+
|  PluginForge (Framework)                                  |
|  +-- pluggy (Hook-Specs + Hook-Impls)                    |
|  +-- YAML-Konfiguration (App, Plugins, i18n)             |
|  +-- Plugin-Lifecycle (init, activate, deactivate)       |
|  +-- FastAPI-Router-Integration                          |
|  +-- Alembic-Migration-Support fuer Plugin-Tabellen      |
+----------------------------------------------------------+
|  Plugins                                                  |
|  +-- plugin-export       (EPUB, PDF, write-book-template)|
|  +-- plugin-kinderbuch   (Bild-Layout, spezielle Export) |
|  +-- plugin-audiobook    (TTS, MP3/M4B)                  |
|  +-- plugin-kdp          (KDP-Metadaten, Vorschau)       |
|  +-- ...                                                  |
+----------------------------------------------------------+
```

### 2.2 Zwei Repositories

| Repository | Beschreibung | Lizenz |
|------------|-------------|--------|
| `pluginforge` | Anwendungsunabhaengiges Plugin-Framework (basiert auf pluggy) | MIT |
| `bibliogon` | Buch-Autoren-Plattform, nutzt PluginForge | MIT (Core), proprietaer (Premium-Plugins) |

PluginForge ist ein eigenstaendiges PyPI-Paket:

```toml
# bibliogon/backend/pyproject.toml
[tool.poetry.dependencies]
pluginforge = {version = "^0.5.0", extras = ["fastapi"]}
```

Ein anderer Entwickler kann PluginForge unabhaengig nutzen:

```toml
# podcast-tool/pyproject.toml
[tool.poetry.dependencies]
pluginforge = "^0.5.0"
```

### 2.3 Tech-Stack

| Komponente | Technologie |
|------------|-------------|
| PluginForge | Python 3.11+, pluggy, YAML, Entry Points, Alembic |
| Backend | FastAPI, SQLAlchemy, SQLite/PostgreSQL, Pydantic v2 |
| Frontend | React 18, TypeScript, TipTap (15 Extensions), Vite, Radix UI, @dnd-kit, Lucide Icons |
| Export-Plugin | manuscripta (PyPI), Pandoc, write-book-template Struktur |
| Tooling | Poetry, npm, Docker, Make, Playwright (E2E) |

### 2.4 UI-Komponentenstrategie

Prinzip: Bestehende Open-Source-Bibliotheken nutzen statt das Rad neu zu erfinden.

| Bibliothek | Zweck | Lizenz |
|------------|-------|--------|
| **Radix UI** | Unstyled accessible Primitives (Dialog, Tabs, Dropdown, Select, Tooltip) | MIT |
| **@dnd-kit** | Drag-and-Drop (Kapitel-Sortierung, Listen-Reorder) | MIT |
| **TipTap** | WYSIWYG/Markdown-Editor (StarterKit + 15 Extensions) | MIT |
| **@pentestpad/tiptap-extension-figure** | Figure + Figcaption (Bildunterschriften) | MIT |
| **@tiptap/extension-table** | Tabellen (+ row, cell, header) | MIT |
| **@tiptap/extension-text-align** | Textausrichtung (links, zentriert, rechts, Blocksatz) | MIT |
| **@tiptap/extension-typography** | Smart Quotes, Gedankenstriche automatisch | MIT |
| **@tiptap/extension-character-count** | Wort- und Zeichenzaehlung | MIT |
| **@tiptap/extension-highlight** | Text hervorheben | MIT |
| **@tiptap/extension-task-list** | Checklisten mit Checkboxen | MIT |
| **@tiptap/extension-underline** | Unterstreichung | MIT |
| **@tiptap/extension-sub/superscript** | Tief-/Hochgestellt (H2O, E=mc2) | MIT |
| **Lucide React** | Icons | ISC |
| **react-toastify** | Toast-Notifications | MIT |

Warum Radix UI:
- Unstyled: Passt zu unserem CSS-Variables-Theming (3 Themes x Light/Dark)
- Accessible: ARIA-Attribute, Fokus-Management, Keyboard-Navigation out-of-the-box
- Einzeln installierbar: Nur die Primitives die wir brauchen
- Kein Tailwind noetig: Wir stylen weiter mit Custom Properties

Abgelehnte Alternativen:
- shadcn/ui (braucht Tailwind), MUI (zu opinionated), Ant Design (zu schwer), Mantine/Chakra (eigenes Theme-System)

Diese Strategie gilt auch als Referenz fuer andere Projekte die auf PluginForge aufbauen.

---

## 3. PluginForge - Das Framework

### 3.1 Kernkonzept

PluginForge baut auf pluggy auf und ergaenzt:

| Feature | pluggy | PluginForge |
|---------|--------|-------------|
| Hook-Specs und Hook-Impls | Ja | Ja (via pluggy) |
| Entry Point Discovery | Ja | Ja (via pluggy) |
| YAML-Konfiguration | Nein | Ja (App, Plugins, i18n) |
| Plugin-Lifecycle | Nein | Ja (init, activate, deactivate) |
| Enable/Disable per Config | Nein | Ja |
| FastAPI-Router-Integration | Nein | Ja (Plugin-Routen automatisch einbinden) |
| DB-Migration Support | Nein | Ja (Alembic pro Plugin) |
| Plugin-Abhaengigkeiten | Nein | Ja (deklarativ in YAML) |
| Frontend-Plugin-Loading | Nein | Ja (Manifest fuer UI-Komponenten) |
| API-Versionierung | Nein | Ja (Hook-Specs versioniert) |

### 3.2 Konfigurationssystem

Alles anwendungsspezifische liegt in YAML-Dateien. Keine hartcodierten Strings.

**App-Konfiguration (`config/app.yaml`):**

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
  subtitle: "Buecher schreiben und exportieren"
  logo: "assets/logo.svg"
  theme: "warm-literary"
```

**Plugin-Konfiguration (`config/plugins/export.yaml`):**

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
  depends_on: []            # Keine Abhaengigkeiten
  api_version: "1"          # Kompatibel mit Hook-Spec v1

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

**Internationalisierung (`config/i18n/de.yaml`):**

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

Fuer eine andere Anwendung (z.B. Podcast-Tool) aendert man nur die YAML-Dateien:

```yaml
# config/app.yaml fuer ein Podcast-Tool
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

### 3.3 Warum pluggy als Basis

pluggy ist der De-facto-Standard fuer Python Plugin-Systeme. Pytest, tox, datasette und kedro nutzen es. Es bietet:

- Hook-Specification und Hook-Implementation als Dekoratoren
- Entry Point Discovery (`load_setuptools_entrypoints`)
- firstresult-Hooks (erster Rueckgabewert gewinnt)
- Call-Order-Management (trylast, tryfirst)
- Typsichere Hook-Aufrufe

PluginForge erfindet das Rad nicht neu, sondern baut die Schichten darauf, die pluggy fehlen: Konfiguration, Lifecycle, Web-Integration.

### 3.4 Plugin-Interface (v0.5.0)

```python
# pluginforge/base.py (PyPI-Paket, nicht lokal)

from abc import ABC
from typing import Any

class BasePlugin(ABC):
    name: str
    version: str = "0.1.0"
    api_version: str = "1"
    description: str = ""
    author: str = ""
    depends_on: list[str] = []        # Plugin-Abhaengigkeiten als Klassen-Attribut
    config_schema: dict[str, type] | None = None  # Optionale Config-Validierung

    def init(self, app_config, plugin_config) -> None: ...
    def activate(self) -> None: ...
    def deactivate(self) -> None: ...
    def get_routes(self) -> list: ...           # FastAPI Router
    def get_frontend_manifest(self) -> dict | None: ...  # UI-Manifest
    def health(self) -> dict[str, Any]: ...     # Health Check
    def get_migrations_dir(self) -> str | None: ...      # Alembic
```

```python
# Bibliogon main.py - Integration mit PluginForge v0.5.0
from pluginforge import PluginManager

manager = PluginManager(
    config_path="config/app.yaml",
    pre_activate=license_check,  # Callback vor Plugin-Aktivierung
    api_version="1",
)
manager.register_hookspecs(BibliogonHookSpec)
manager.discover_plugins()       # Entry Points laden, filtern, sortieren, aktivieren
manager.mount_routes(app)        # FastAPI-Router mounten (prefix="/api")

# Laufzeit-API
manager.get_active_plugins()     # Liste aktiver Plugins
manager.get_plugin("export")     # Plugin-Instanz nach Name
manager.deactivate_plugin("x")   # Deaktivieren + Hook-Unregister
manager.reload_plugin("x")       # Hot Reload
manager.reload_config()           # Config von Disk neu laden
manager.health_check()            # Health aller Plugins
manager.get_load_errors()         # Fehler beim Laden
manager.call_hook("hook_name")    # Hook aufrufen
manager.get_text("key", "de")     # i18n String
```

### 3.5 PluginForge Repository

PluginForge ist ein eigenstaendiges PyPI-Paket: https://github.com/astrapi69/pluginforge

```
pluginforge/       # Eigenes Repo, nicht Teil von Bibliogon
├── pluginforge/
│   ├── __init__.py          # Public API: BasePlugin, PluginManager
│   ├── base.py              # BasePlugin ABC (lifecycle, routes, health, manifest)
│   ├── manager.py           # PluginManager (wraps pluggy, pre_activate, hot reload)
│   ├── config.py            # YAML-Config Loader
│   ├── discovery.py         # Entry Points + topologische Sortierung
│   ├── lifecycle.py         # init/activate/deactivate Steuerung
│   ├── fastapi_ext.py       # FastAPI-Router mounten (konfigurierbarer prefix)
│   ├── alembic_ext.py       # Alembic-Migrations sammeln
│   ├── i18n.py              # Mehrsprachige Strings aus YAML
│   └── security.py          # Plugin-Name-Validierung, Path Traversal Prevention
├── tests/
├── pyproject.toml
├── README.md
└── LICENSE
```

Abhaengigkeiten: `pluggy`, `pyyaml`. Sonst nichts. FastAPI und Alembic sind optionale Extras:

```toml
[tool.poetry.dependencies]
pluggy = "^1.5.0"
pyyaml = "^6.0"

[tool.poetry.extras]
fastapi = ["fastapi"]
migrations = ["alembic"]
```

---

## 4. Bibliogon App

### 4.1 Datenmodell

**Aktuell (v0.7.0):**

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
  deleted_at: datetime? (Soft-Delete)
  chapters: [Chapter]
  assets: [Asset]

ChapterType (enum, 14 Werte)
  CHAPTER, PREFACE, FOREWORD, ACKNOWLEDGMENTS,
  ABOUT_AUTHOR, APPENDIX, BIBLIOGRAPHY, GLOSSARY,
  EPILOGUE, IMPRINT, NEXT_IN_SERIES, PART_INTRO,
  INTERLUDE, TABLE_OF_CONTENTS

Chapter
  id: str (UUID)
  book_id: str (FK -> Book)
  title: str
  content: str (TipTap JSON, siehe 4.3)
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

**Fruehere Versionen:**

```
UserBackup (v0.4.0 - jetzt durch .bgb Backup ersetzt)
  id: str
  created_at: datetime
  format: str (zip)
  path: str
```

### 4.2 Integration mit PluginForge v0.5.0

```python
# bibliogon/backend/app/main.py

from pluginforge import PluginManager

manager = PluginManager(
    config_path="config/app.yaml",
    pre_activate=license_check,  # Lizenzpruefung vor Aktivierung
    api_version="1",
)
manager.register_hookspecs(BibliogonHookSpec)
manager.discover_plugins()
manager.mount_routes(app)  # FastAPI-Router mounten

# Health Check und Load Errors
@app.get("/api/plugins/health")
def health(): return manager.health_check()

@app.get("/api/plugins/errors")
def errors(): return manager.get_load_errors()
```

### 4.3 Internes Speicherformat

TipTap kann Inhalte als HTML oder als JSON speichern. Wir nutzen **TipTap JSON** als internes Format:

- Strukturiert und maschinenlesbar
- Verlustfreie Roundtrips (JSON -> Editor -> JSON)
- Leichter zu transformieren als HTML (z.B. fuer Export)
- Unabhaengig vom Editor (migrierbar zu einem anderen Editor)

Beim Export konvertiert das Export-Plugin TipTap-JSON zu Markdown (fuer write-book-template) oder HTML (fuer EPUB). Die Konvertierung ist damit Plugin-Verantwortung, nicht Kern-Verantwortung.

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "Kapitel 1" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Es war einmal..." }]
    }
  ]
}
```

### 4.4 Export als Plugin

Der gesamte Export ist ein Plugin (`bibliogon-plugin-export`):

```
bibliogon-plugin-export/
├── pyproject.toml
├── bibliogon_export/
│   ├── __init__.py
│   ├── plugin.py            # ExportPlugin(BasePlugin)
│   ├── hookimpls.py         # Hook-Implementations
│   ├── scaffolder.py        # write-book-template Verzeichnisstruktur
│   ├── pandoc_runner.py     # Pandoc-Aufrufe
│   ├── tiptap_to_md.py     # TipTap-JSON -> Markdown Konvertierung
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

### 4.5 write-book-template Verzeichnisstruktur

Das Export-Plugin erzeugt beim Export:

```
{buch-titel}/
├── manuscript/
│   ├── chapters/
│   │   ├── 01-kapitel-titel.md
│   │   ├── 02-kapitel-titel.md
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

Mapping DB -> Dateisystem:

| Bibliogon (DB) | write-book-template (Dateisystem) |
|----------------|-----------------------------------|
| `Book.title` | Projektordner-Name, `config/metadata.yaml` -> `title` |
| `Book.subtitle` | `config/metadata.yaml` -> `subtitle` |
| `Book.author` | `config/metadata.yaml` -> `author`, `back-matter/about-the-author.md` |
| `Book.language` | `config/metadata.yaml` -> `lang` |
| `Book.series` | `config/metadata.yaml` -> `series` |
| `Book.series_index` | `config/metadata.yaml` -> `series_index` |
| `Book.description` | `config/metadata.yaml` -> `description` |
| `Chapter.title` | Dateiname `{NN}-{slug}.md`, H1 im Inhalt |
| `Chapter.content` | Markdown-Body (konvertiert aus TipTap-JSON) |
| `Chapter.position` | Numerisches Praefix (`01-`, `02-`, ...) |

### 4.6 Offline/Local-first

Bibliogon muss komplett offline funktionieren:

- SQLite als Default-DB (keine externe DB noetig)
- Alle Assets lokal im Dateisystem
- Frontend als statische Dateien auslieferbar (kein CDN-Zwang)
- Premium-Plugin-Lizenzen offline validierbar (signierte Lizenzschluessel, kein Lizenzserver noetig)
- Einzige Ausnahme: Plugins die externe APIs nutzen (TTS, KI-Hilfe) brauchen natuerlich Netz

### 4.7 Datensicherung

Full-Data-Backup als ZIP:

```
bibliogon-backup-2026-03-26/
├── books/
│   ├── {book-id-1}/
│   │   ├── book.json          # Book-Metadaten
│   │   ├── chapters/
│   │   │   ├── {chapter-id}.json  # Kapitel mit TipTap-JSON
│   │   │   └── ...
│   │   └── assets/            # Zugehoerige Bilder
│   └── {book-id-2}/
│       └── ...
├── settings.json              # App-Einstellungen
└── manifest.json              # Backup-Metadaten, Version, Datum
```

Import eines Backups stellt den kompletten Zustand wieder her. Unabhaengig vom Export-Plugin (das write-book-template Struktur erzeugt).

---

## 5. Geschaeftsmodell

| Schicht | Lizenz | Inhalt |
|---------|--------|--------|
| PluginForge | MIT (kostenlos) | Framework, fuer jeden nutzbar |
| Bibliogon Core | MIT (kostenlos) | UI, Editor, Book/Chapter CRUD, Backup |
| plugin-export | MIT (kostenlos) | EPUB, PDF, Projektstruktur |
| Community Plugins | MIT (kostenlos) | Von der Community entwickelt |
| Premium Plugins | Proprietaer (kostenpflichtig) | Audiobook, Kinderbuch, KDP, Kollaboration |

### 5.1 Plugin-Katalog

**Kostenlos (MIT):**

| Plugin | Typ | Beschreibung |
|--------|-----|-------------|
| `plugin-export` | Export | EPUB, PDF, write-book-template ZIP |
| `plugin-characters` | Struktur | Figurendatenbank, Beziehungsgraph |
| `plugin-wordcount` | Editor | Wortzaehler pro Kapitel und Gesamt |

**Premium:**

| Plugin | Typ | Beschreibung | Abhaengigkeit |
|--------|-----|-------------|---------------|
| `plugin-kinderbuch` | Export + Editor | Bild-pro-Seite Layout, spezielle Templates | plugin-export |
| `plugin-kdp` | Export | KDP-Metadaten, Cover-Validierung, Vorschau | plugin-export |
| `plugin-audiobook` | Export | Text-to-Speech, MP3/M4B, Kapitelmarker | plugin-export |
| `plugin-grammar` | Editor | LanguageTool-Integration | - |
| `plugin-ai-assist` | Editor | KI-Schreibhilfe | - |
| `plugin-collaboration` | Struktur | Multi-User Echtzeit-Bearbeitung | - |
| `plugin-versioning` | Editor | Kapitel-Versionsgeschichte mit Diff | - |
| `plugin-docx` | Export | Word-Export fuer Lektorate | plugin-export |

### 5.2 Plugin-Abhaengigkeiten

Deklariert in der Plugin-YAML:

```yaml
plugin:
  name: "kinderbuch"
  depends_on: ["export"]
```

PluginForge prueft beim Laden ob alle Abhaengigkeiten aktiv sind (topologische Sortierung). Fehlende Abhaengigkeiten fuehren zum Ueberspringen mit Warnung (sichtbar via `get_load_errors()`). Abhaengigkeiten werden jetzt als Klassen-Attribut deklariert:

```python
class KinderbuchPlugin(BasePlugin):
    name = "kinderbuch"
    depends_on = ["export"]
```

### 5.3 Plugin-Lizenzierung (Offline)

Lizenzierung ist bibliogon-spezifisch (nicht Teil von PluginForge) und lebt in `backend/app/licensing.py`. Die Pruefung erfolgt via `pre_activate` Callback auf dem PluginManager:

```python
manager = PluginManager(
    config_path="config/app.yaml",
    pre_activate=license_check,  # Return False -> Plugin wird nicht aktiviert
)
```

Premium-Plugins nutzen HMAC-SHA256 signierte Lizenzschluessel:

```
BIBLIOGON-KINDERBUCH-v1-<base64 payload>.<base64 signature>
```

Der Schluessel enthaelt (Base64-kodiert + signiert):
- Plugin-Name und Version
- Ablaufdatum (oder "lifetime")
- Maschinen-ID (optional, fuer Einzelplatz-Lizenzen)

Validierung passiert lokal. Kein Lizenzserver noetig, kein Internet erforderlich. Lizenzen werden in `config/licenses.json` gespeichert und ueber die Settings-UI verwaltet.

---

## 5.4 Plugin-Installation (ZIP)

Drittanbieter-Plugins koennen als ZIP-Datei ueber die Settings-UI installiert werden. Die Installation erfolgt dynamisch zur Laufzeit (Strategie B: Dynamic Loading).

**ZIP-Struktur:**

```
mein-plugin.zip
└── mein-plugin/
    ├── plugin.yaml          # Plugin-Konfiguration (erforderlich)
    ├── mein_plugin/          # Python-Paket (erforderlich)
    │   ├── __init__.py
    │   ├── plugin.py         # Plugin-Klasse (BasePlugin-Unterklasse)
    │   └── routes.py         # Optionale FastAPI-Router
    └── requirements.txt      # Optionale Abhaengigkeiten
```

**plugin.yaml Mindestinhalt:**

```yaml
plugin:
  name: "mein-plugin"
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
  entry_point: "mein_plugin.plugin"  # Optional, wird auto-detektiert

settings:
  # Plugin-spezifische Einstellungen
```

**Installationsablauf:**

1. Benutzer laedt ZIP ueber Settings > Plugins > "ZIP installieren"
2. Backend validiert ZIP-Struktur (plugin.yaml, Python-Paket, plugin.py)
3. Extraktion nach `plugins/installed/{plugin-name}/`
4. Plugin-Config wird nach `config/plugins/{name}.yaml` kopiert
5. Plugin wird zum `sys.path` hinzugefuegt und dynamisch registriert
6. Plugin erscheint in den Einstellungen und kann konfiguriert werden

**Sicherheit:**

- Plugin-Namen werden validiert (nur Kleinbuchstaben, Ziffern, Bindestriche)
- ZIP-Pfade werden auf Path Traversal geprueft
- Plugins laufen im selben Prozess (kein Sandboxing) - nur vertrauenswuerdige Plugins installieren

**API-Endpunkte:**

- `POST /api/plugins/install` - Plugin-ZIP hochladen und installieren
- `DELETE /api/plugins/install/{name}` - Plugin deinstallieren
- `GET /api/plugins/installed` - Installierte Plugins auflisten

### 5.5 Plugin UI-Strategie (Manifest-driven)

Plugins koennen UI-Erweiterungen deklarieren ueber die `get_frontend_manifest()` Methode. Das Frontend fragt `GET /api/plugins/manifests` ab und rendert vordefinierte UI-Slots.

**Vordefinierte UI-Slots:**

| Slot | Beschreibung | Ort in der App |
|------|-------------|----------------|
| `sidebar_actions` | Buttons in der Kapitel-Sidebar | BookEditor Sidebar |
| `toolbar_buttons` | Buttons in der Editor-Toolbar | Editor Toolbar |
| `editor_panels` | Panels neben dem Editor | BookEditor |
| `settings_section` | Zusaetzliche Einstellungen | Settings > Plugins |
| `export_options` | Optionen im Export-Dialog | ExportDialog |

**Manifest-Beispiel (Export-Plugin):**

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

**Strategie fuer komplexe Plugin-UIs:**

Fuer Plugins die ueber einfache Manifest-Deklarationen hinausgehen (z.B. interaktive Vorschau, komplexe Formulare), koennen Web Components als Custom Elements geliefert werden. Das Plugin-ZIP enthaelt dann ein kompiliertes JS-Bundle das ueber einen definierten Slot geladen wird.

## 6. API-Versionierung

Hook-Specs bekommen eine Version. Plugins deklarieren welche API-Version sie unterstuetzen:

```python
# bibliogon/hookspecs.py - Version 1
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

Wenn sich Hooks aendern, wird eine neue Spec-Version erstellt (v2). Alte Plugins (api_version: "1") funktionieren weiter solange die v1-Hooks nicht entfernt werden. Deprecation-Warnungen bei alten Hooks.

---

## 7. Roadmap

Feature-Details und offene Punkte siehe docs/ROADMAP.md (mit IDs fuer Prompt-Referenz).

| Phase | Version | Status |
|-------|---------|--------|
| 1: MVP | v0.1.0 | erledigt |
| 2: PluginForge Framework | v0.2.0 | erledigt |
| 3: Export als Plugin | v0.3.0 | erledigt |
| 4: Import, Backup, Kapiteltypen | v0.4.0 | erledigt |
| 5: Erste Premium-Plugins (kinderbuch, kdp) | v0.5.0 | erledigt |
| 6: Editor-Erweiterungen, i18n, Themes | v0.6.0 | erledigt |
| 7: Erweiterte Metadaten, Publishing | v0.7.0 | erledigt |
| 8: Manuskript-Qualitaet, Editor, Export | v0.9.0 | erledigt (aktuell) |
| 9: Uebersetzungs-Plugin (Premium) | v0.10.0 | naechste Phase |
| 10: Audiobook-Plugin (Premium) | v0.11.0 | geplant |
| 11: Multi-User und SaaS | v1.0.0 | geplant |

---

## 8. Abgrenzung

### Was Bibliogon ist

- Eine Web-UI zum Schreiben von Buechern
- Aufgebaut auf PluginForge (wiederverwendbares Plugin-Framework)
- Offline-faehig und Local-first
- Ein Generator fuer write-book-template Projektstrukturen (via Plugin)
- Ein EPUB/PDF-Export-Tool via Pandoc (via Plugin)
- Open Source mit SaaS-Potenzial

### Was PluginForge ist

- Eine Erweiterungsschicht auf pluggy, kein Ersatz
- Anwendungsunabhaengig, wiederverwendbar
- YAML-konfigurierbar (Titel, Labels, Einstellungen, i18n)
- Mit FastAPI-Integration und DB-Migration-Support

### Was beides nicht ist

- Kein KI-Textgenerator (aber erweiterbar per Plugin)
- Kein kollaboratives Echtzeit-Tool (aber erweiterbar per Plugin)
- Kein Layoutprogramm (kein InDesign-Ersatz)

---

## 9. Konkurrenzanalyse

| Tool | Open Source | Web | Offline | Plugin-System | Projektstruktur |
|------|-----------|-----|---------|---------------|-----------------|
| Scrivener | Nein | Nein | Ja | Nein | Proprietaer |
| Reedsy Studio | Nein | Ja | Nein | Nein | Nein |
| Manuskript | Ja | Nein | Ja | Nein | Proprietaer |
| Obsidian | Nein | Nein | Ja | Ja (Community) | Nein |
| VS Code | Ja | Ja | Ja | Ja (Extensions) | Nein |
| **Bibliogon** | **Ja** | **Ja** | **Ja** | **Ja (PluginForge)** | **write-book-template** |

Kein anderes Autoren-Tool kombiniert Open Source, Web-UI, Offline-Faehigkeit, ein echtes Plugin-Framework auf pluggy-Basis, und eine standardisierte Pandoc-kompatible Projektstruktur.

---

## 10. Offene Fragen

1. ~~**PluginForge Name:** Ist `pluginforge` als PyPI-Paketname frei?~~ Erledigt - auf PyPI als `pluginforge` veroeffentlicht.

2. **Frontend-Plugin-Loading:** Dynamisches Laden von React-Komponenten zur Laufzeit (Module Federation, importmaps) oder statisches Bundling beim Build?

3. **PluginForge Scope Frontend:** Soll PluginForge auch ein npm-Pendant haben fuer Frontend-Plugin-Loading, oder bleibt das Bibliogon-spezifisch?

4. **Plugin-DB-Migrationen:** Alembic mit mehreren `versions`-Ordnern (einer pro Plugin) oder ein zentraler Ordner mit Plugin-Prefix?

5. **TipTap-JSON Groesse:** Bei langen Kapiteln kann TipTap-JSON deutlich groesser sein als HTML. Relevanz fuer SQLite-Performance bei Phase 7 (PostgreSQL) pruefen.
