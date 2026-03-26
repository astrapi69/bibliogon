# Bibliogon - Konzeptdokument

**Repository:** [github.com/astrapi69/bibliogon](https://github.com/astrapi69/bibliogon)
**Verwandtes Projekt:** [github.com/astrapi69/write-book-template](https://github.com/astrapi69/write-book-template)
**Version:** 0.2.0 (geplant)
**Stand:** 2026-03-26

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
pluginforge = "^0.1.0"
```

Ein anderer Entwickler kann PluginForge unabhaengig nutzen:

```toml
# podcast-tool/pyproject.toml
[tool.poetry.dependencies]
pluginforge = "^0.1.0"
```

### 2.3 Tech-Stack

| Komponente | Technologie |
|------------|-------------|
| PluginForge | Python 3.11+, pluggy, YAML, Entry Points, Alembic |
| Backend | FastAPI, SQLAlchemy, SQLite/PostgreSQL |
| Frontend | React 18, TypeScript, TipTap, Vite |
| Export-Plugin | Pandoc, write-book-template Struktur |
| Tooling | Poetry, npm, Docker, Make |

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

### 3.4 Plugin-Interface

```python
# pluginforge/base.py

from abc import ABC
from typing import Any

class BasePlugin(ABC):
    """Base class for all PluginForge plugins."""

    name: str
    version: str = "0.1.0"
    api_version: str = "1"
    config: dict[str, Any] = {}

    def init(self, app_config: dict, plugin_config: dict) -> None:
        """Called when the plugin is loaded. Receives merged config."""
        self.config = plugin_config

    def activate(self) -> None:
        """Called when the plugin is enabled."""
        pass

    def deactivate(self) -> None:
        """Called when the plugin is disabled. Cleanup resources."""
        pass

    def get_routes(self) -> list:
        """Return FastAPI routers to mount. Optional."""
        return []

    def get_migrations_dir(self) -> str | None:
        """Return path to Alembic migration scripts. Optional."""
        return None

    def get_frontend_manifest(self) -> dict | None:
        """Return manifest for frontend UI components. Optional."""
        return None
```

```python
# pluginforge/manager.py

import pluggy
import yaml
from pathlib import Path
from .base import BasePlugin

class PluginManager:
    """Manages plugin lifecycle, config, and hook dispatch."""

    def __init__(self, app_config_path: str = "config/app.yaml"):
        self.app_config = self._load_yaml(app_config_path)
        self.pm = pluggy.PluginManager(self.app_config["plugins"]["entry_point_group"])
        self.plugins: dict[str, BasePlugin] = {}
        self._i18n: dict[str, dict] = {}

    def load_hookspecs(self, spec_module) -> None:
        """Register hook specifications from the application."""
        self.pm.add_hookspecs(spec_module)

    def discover_and_load(self) -> None:
        """Discover, configure, and activate all enabled plugins."""
        group = self.app_config["plugins"]["entry_point_group"]
        enabled = set(self.app_config["plugins"].get("enabled", []))
        disabled = set(self.app_config["plugins"].get("disabled", []))
        config_dir = Path(self.app_config["plugins"].get("config_dir", "config/plugins"))

        # Load via pluggy entry points
        self.pm.load_setuptools_entrypoints(group)

        # Additionally handle our lifecycle
        for ep_name, plugin_obj in self._iter_loaded():
            if ep_name in disabled:
                self.pm.unregister(plugin_obj)
                continue
            if enabled and ep_name not in enabled:
                self.pm.unregister(plugin_obj)
                continue

            # Load plugin YAML config
            plugin_config = {}
            plugin_yaml = config_dir / f"{ep_name}.yaml"
            if plugin_yaml.exists():
                plugin_config = self._load_yaml(str(plugin_yaml))

            # Check dependencies
            depends = plugin_config.get("plugin", {}).get("depends_on", [])
            for dep in depends:
                if dep not in enabled and dep not in self.plugins:
                    raise RuntimeError(
                        f"Plugin '{ep_name}' requires '{dep}' which is not enabled"
                    )

            # Lifecycle
            if hasattr(plugin_obj, "init"):
                plugin_obj.init(self.app_config, plugin_config)
            if hasattr(plugin_obj, "activate"):
                plugin_obj.activate()

            self.plugins[ep_name] = plugin_obj

    def get_all_routes(self) -> list:
        """Collect FastAPI routers from all active plugins."""
        routes = []
        for plugin in self.plugins.values():
            if hasattr(plugin, "get_routes"):
                routes.extend(plugin.get_routes())
        return routes

    def get_all_frontend_manifests(self) -> dict:
        """Collect frontend UI manifests from all active plugins."""
        manifests = {}
        for name, plugin in self.plugins.items():
            if hasattr(plugin, "get_frontend_manifest"):
                manifest = plugin.get_frontend_manifest()
                if manifest:
                    manifests[name] = manifest
        return manifests

    def load_i18n(self, lang: str) -> dict:
        """Load i18n strings for a language, merged from app and plugins."""
        if lang in self._i18n:
            return self._i18n[lang]
        i18n_path = Path(f"config/i18n/{lang}.yaml")
        strings = self._load_yaml(str(i18n_path)) if i18n_path.exists() else {}
        self._i18n[lang] = strings
        return strings

    def unload(self, name: str) -> None:
        """Deactivate and remove a plugin."""
        if name in self.plugins:
            plugin = self.plugins[name]
            if hasattr(plugin, "deactivate"):
                plugin.deactivate()
            self.pm.unregister(plugin)
            del self.plugins[name]

    @staticmethod
    def _load_yaml(path: str) -> dict:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def _iter_loaded(self):
        """Iterate over plugins loaded by pluggy."""
        for plugin in self.pm.get_plugins():
            name = self.pm.parse_hookimpl_opts(plugin, "__name__") or type(plugin).__name__
            yield name, plugin
```

### 3.5 PluginForge Paketstruktur

```
pluginforge/
├── pluginforge/
│   ├── __init__.py          # Public API: BasePlugin, PluginManager
│   ├── base.py              # BasePlugin ABC
│   ├── manager.py           # PluginManager (wraps pluggy)
│   ├── config.py            # YAML-Config Loader und Validierung
│   ├── fastapi.py           # FastAPI-Integration (Router mounting)
│   └── migration.py         # Alembic-Helfer fuer Plugin-Tabellen
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

**Aktuell (v0.1.0):**

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
  created_at: datetime
  updated_at: datetime
  chapters: [Chapter]

Chapter
  id: str (UUID)
  book_id: str (FK -> Book)
  title: str
  content: str (TipTap JSON, siehe 4.3)
  position: int
  created_at: datetime
  updated_at: datetime
```

**Geplante Erweiterungen:**

```
ChapterType (enum)
  CHAPTER, PREFACE, FOREWORD, ACKNOWLEDGMENTS,
  ABOUT_AUTHOR, APPENDIX, BIBLIOGRAPHY, GLOSSARY

Asset
  id: str
  book_id: str (FK -> Book)
  filename: str
  asset_type: str (cover, figure, diagram, table)
  path: str
  uploaded_at: datetime

UserBackup
  id: str
  created_at: datetime
  format: str (zip)
  path: str
```

### 4.2 Integration mit PluginForge

```python
# bibliogon/backend/app/main.py

from pluginforge import PluginManager
import bibliogon_hookspecs as hookspecs

manager = PluginManager("config/app.yaml")
manager.load_hookspecs(hookspecs)
manager.discover_and_load()

# Plugin-Routen in FastAPI einbinden
for router in manager.get_all_routes():
    app.include_router(router, prefix="/api")

# Frontend-Manifests bereitstellen
@app.get("/api/plugins/manifests")
def get_manifests():
    return manager.get_all_frontend_manifests()

# i18n-Strings bereitstellen
@app.get("/api/i18n/{lang}")
def get_i18n(lang: str):
    return manager.load_i18n(lang)
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

PluginForge prueft beim Laden ob alle Abhaengigkeiten aktiv sind. Fehlende Abhaengigkeiten erzeugen einen klaren Fehler.

### 5.3 Plugin-Lizenzierung (Offline)

Premium-Plugins nutzen signierte Lizenzschluessel:

```
BIBLIOGON-KINDERBUCH-v1-XXXX-XXXX-XXXX-XXXX
```

Der Schluessel enthaelt (Base64-kodiert + signiert):
- Plugin-Name und Version
- Ablaufdatum (oder "lifetime")
- Maschinen-ID (optional, fuer Einzelplatz-Lizenzen)

Validierung passiert lokal mit einem oeffentlichen Schluessel. Kein Lizenzserver noetig, kein Internet erforderlich.

---

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

### Phase 1: MVP (v0.1.0) - erledigt

- Backend: Book/Chapter CRUD, einfacher Pandoc-Export
- Frontend: Dashboard, Kapitel-Editor mit TipTap, Export-Buttons
- Deployment: Docker Compose, Makefile

### Phase 2: PluginForge Framework (v0.2.0)

- Eigenes Repository `pluginforge` anlegen
- PluginManager auf Basis von pluggy
- YAML-Konfigurationssystem (App, Plugins, i18n)
- Plugin-Lifecycle (init, activate, deactivate)
- Plugin-Abhaengigkeitspruefung
- FastAPI-Router-Integration
- Tests und Dokumentation
- Auf PyPI veroeffentlichen
- Bibliogon-Backend auf PluginForge umstellen

### Phase 3: Export als Plugin (v0.3.0)

- `bibliogon-plugin-export` als erstes Plugin
- TipTap-JSON als internes Speicherformat (statt HTML)
- TipTap-JSON -> Markdown Konvertierung
- write-book-template Verzeichnisstruktur-Scaffolding
- ZIP/EPUB/PDF-Export
- Alten fest verdrahteten Export-Code entfernen
- Plugin-Verwaltung in der UI (aktivieren/deaktivieren)
- i18n fuer UI-Strings (DE, EN als Start)

### Phase 4: Import, Backup, erweiterte Kapiteltypen (v0.4.0)

- write-book-template Projekt importieren (ZIP-Upload)
- Full-Data-Backup und Restore
- ChapterType-Enum fuer Front-Matter und Back-Matter
- Asset-Upload (Cover, Bilder)
- Alembic-Integration fuer Plugin-Tabellen

### Phase 5: Erste Premium-Plugins (v0.5.0)

- `plugin-kinderbuch`: Bild-pro-Seite Layout, spezielle Templates
- `plugin-kdp`: Metadaten-Export, Cover-Validierung, Vorschau
- Offline-Lizenzpruefung (signierte Schluessel)

### Phase 6: Editor-Erweiterungen (v0.6.0)

- Markdown-Modus im Editor (TipTap Umschaltung WYSIWYG/Markdown)
- Kapitel Drag-and-Drop Sortierung
- Autosave-Indikator, Wortzaehler
- `plugin-grammar`: LanguageTool-Integration
- i18n: ES, FR, EL hinzufuegen

### Phase 7: Multi-User und SaaS (v1.0.0)

- Benutzerregistrierung und Authentifizierung
- PostgreSQL statt SQLite
- Pen-Name-Verwaltung
- Plugin-Marketplace
- Abrechnungsintegration (Stripe)

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

1. **PluginForge Name:** Ist `pluginforge` als PyPI-Paketname frei? Falls belegt, Alternativen pruefen.

2. **Frontend-Plugin-Loading:** Dynamisches Laden von React-Komponenten zur Laufzeit (Module Federation, importmaps) oder statisches Bundling beim Build? Dynamisch ist flexibler, statisch ist zuverlaessiger.

3. **PluginForge Scope Frontend:** Soll PluginForge auch ein npm-Pendant haben fuer Frontend-Plugin-Loading, oder bleibt das Bibliogon-spezifisch?

4. **Plugin-DB-Migrationen:** Alembic mit mehreren `versions`-Ordnern (einer pro Plugin) oder ein zentraler Ordner mit Plugin-Prefix in den Migrationsdateien?

5. **TipTap-JSON Groesse:** Bei langen Kapiteln kann TipTap-JSON deutlich groesser sein als HTML. Ist das ein Problem fuer SQLite-Performance, oder vernachlaessigbar?
