# Bibliogon - Konzeptdokument

**Repository:** [github.com/astrapi69/bibliogon](https://github.com/astrapi69/bibliogon)
**Verwandtes Projekt:** [github.com/astrapi69/write-book-template](https://github.com/astrapi69/write-book-template)
**Version:** 0.2.0 (geplant)
**Stand:** 2026-03-26

---

## 1. Ziel

Bibliogon besteht aus zwei Teilen:

1. **PluginForge** - Ein anwendungsunabhaengiges Plugin-Framework fuer Python/FastAPI-Anwendungen. Hook-basiert, konfigurierbar, wiederverwendbar. Kann von jedem Entwickler als Grundlage fuer eigene Plugin-faehige Anwendungen genutzt werden.

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
|  +-- Hook-Registry                                       |
|  +-- Plugin-Loader (Entry Points)                        |
|  +-- Konfigurationssystem (YAML)                         |
|  +-- Plugin-Lifecycle (init, activate, deactivate)       |
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
| `pluginforge` | Anwendungsunabhaengiges Plugin-Framework | MIT |
| `bibliogon` | Buch-Autoren-Plattform, nutzt PluginForge | MIT (Core), proprietaer (Premium-Plugins) |

PluginForge ist ein eigenstaendiges PyPI-Paket. Bibliogon haengt davon ab:

```toml
# bibliogon/backend/pyproject.toml
[tool.poetry.dependencies]
pluginforge = "^0.1.0"
```

Ein anderer Entwickler kann PluginForge unabhaengig nutzen:

```toml
# irgendeine-andere-app/pyproject.toml
[tool.poetry.dependencies]
pluginforge = "^0.1.0"
```

### 2.3 Tech-Stack

| Komponente | Technologie |
|------------|-------------|
| PluginForge | Python 3.11+, YAML-Konfiguration, Entry Points |
| Backend | FastAPI, SQLAlchemy, SQLite/PostgreSQL |
| Frontend | React 18, TypeScript, TipTap, Vite |
| Export-Plugin | Pandoc, write-book-template Struktur |
| Tooling | Poetry, npm, Docker, Make |

---

## 3. PluginForge - Das Framework

### 3.1 Kernkonzept

PluginForge stellt bereit:
- **Hook-Registry:** Anwendungen definieren Hook-Punkte, Plugins registrieren sich darauf.
- **Plugin-Loader:** Automatische Discovery ueber Python Entry Points.
- **Konfiguration:** Alle Texte, Labels, Einstellungen in YAML-Dateien. Keine hartcodierten Strings.
- **Lifecycle:** init -> activate -> deactivate. Plugins koennen beim Start Ressourcen laden und beim Stopp aufraeumen.
- **Typisierte Hooks:** Jeder Hook definiert seine erwarteten Parameter und Rueckgabewerte.

### 3.2 Konfigurationssystem

Alles was anwendungsspezifisch ist, liegt in YAML-Dateien. Dadurch kann jede Anwendung die auf PluginForge aufbaut, das Framework komplett anpassen ohne Code zu aendern.

**Anwendungskonfiguration (`config/app.yaml`):**

```yaml
app:
  name: "Bibliogon"
  version: "0.2.0"
  description: "Open-source book authoring platform"
  default_language: "de"

plugins:
  discovery: "entry_points"       # oder "directory", "config"
  entry_point_group: "bibliogon.plugins"
  config_dir: "config/plugins"    # Plugin-spezifische Konfiguration
  enabled:
    - "export"
    - "kdp"
  disabled:
    - "audiobook"

ui:
  title: "Bibliogon"
  subtitle: "Buecher schreiben und exportieren"
  logo: "assets/logo.svg"
  theme: "warm-literary"          # CSS-Theme Auswahl

hooks:
  custom:                         # App-spezifische Hooks registrieren
    - "book.create"
    - "book.delete"
    - "chapter.pre_save"
    - "chapter.post_save"
    - "export.formats"
    - "export.execute"
    - "ui.editor_toolbar"
    - "ui.sidebar_actions"
    - "ui.settings"
```

**Plugin-Konfiguration (`config/plugins/export.yaml`):**

```yaml
plugin:
  name: "export"
  display_name: "Buch-Export"
  description: "EPUB, PDF und Projektstruktur-Export via Pandoc"
  version: "1.0.0"
  author: "Bibliogon Core Team"
  license: "MIT"

settings:
  pandoc_path: "pandoc"
  default_format: "epub"
  pdf_engine: "xelatex"
  toc_depth: 2
  generate_project_structure: true

formats:
  - id: "epub"
    label: "EPUB"
    extension: "epub"
    media_type: "application/epub+zip"
  - id: "pdf"
    label: "PDF"
    extension: "pdf"
    media_type: "application/pdf"
  - id: "project"
    label: "Projektstruktur (ZIP)"
    extension: "zip"
    media_type: "application/zip"
```

Wenn jemand PluginForge fuer eine andere Anwendung nutzt (z.B. ein Podcast-Tool), aendert er nur die YAML-Dateien:

```yaml
# config/app.yaml fuer ein Podcast-Tool
app:
  name: "PodForge"
  version: "1.0.0"
  description: "Podcast production platform"

plugins:
  entry_point_group: "podforge.plugins"
  enabled:
    - "recording"
    - "editing"
    - "publishing"

ui:
  title: "PodForge"
  subtitle: "Record, edit, publish"
```

### 3.3 Plugin-Interface

```python
# pluginforge/base.py

from abc import ABC
from typing import Any

class BasePlugin(ABC):
    """Base class for all plugins."""

    name: str                    # Eindeutiger Bezeichner
    version: str = "0.1.0"
    description: str = ""
    author: str = ""
    license: str = "MIT"
    config: dict[str, Any] = {}  # Geladen aus YAML

    def init(self, app_config: dict, plugin_config: dict) -> None:
        """Called when the plugin is loaded. Receives app and plugin config."""
        self.config = plugin_config

    def activate(self) -> None:
        """Called when the plugin is activated."""
        pass

    def deactivate(self) -> None:
        """Called when the plugin is deactivated."""
        pass

    def get_hooks(self) -> dict[str, callable]:
        """Return a mapping of hook names to handler functions."""
        return {}
```

```python
# pluginforge/hooks.py

from typing import Any, Callable

class HookRegistry:
    """Central registry for all hooks."""

    def __init__(self):
        self._hooks: dict[str, list[Callable]] = {}

    def register(self, hook_name: str, handler: Callable) -> None:
        self._hooks.setdefault(hook_name, []).append(handler)

    def unregister(self, hook_name: str, handler: Callable) -> None:
        if hook_name in self._hooks:
            self._hooks[hook_name].remove(handler)

    def call(self, hook_name: str, **kwargs) -> list[Any]:
        """Call all handlers for a hook, return list of results."""
        results = []
        for handler in self._hooks.get(hook_name, []):
            result = handler(**kwargs)
            if result is not None:
                results.append(result)
        return results

    def call_first(self, hook_name: str, **kwargs) -> Any | None:
        """Call handlers until one returns a non-None result."""
        for handler in self._hooks.get(hook_name, []):
            result = handler(**kwargs)
            if result is not None:
                return result
        return None

    def call_pipeline(self, hook_name: str, value: Any, **kwargs) -> Any:
        """Pass value through handlers in sequence (each transforms it)."""
        for handler in self._hooks.get(hook_name, []):
            value = handler(value=value, **kwargs)
        return value
```

```python
# pluginforge/loader.py

import importlib.metadata
import yaml
from pathlib import Path
from .base import BasePlugin
from .hooks import HookRegistry

class PluginLoader:
    """Discovers and loads plugins."""

    def __init__(self, app_config_path: str = "config/app.yaml"):
        self.app_config = self._load_yaml(app_config_path)
        self.registry = HookRegistry()
        self.plugins: dict[str, BasePlugin] = {}

    def discover(self) -> list[str]:
        """Find all available plugins via entry points."""
        group = self.app_config["plugins"]["entry_point_group"]
        found = []
        for ep in importlib.metadata.entry_points(group=group):
            found.append(ep.name)
        return found

    def load_all(self) -> None:
        """Load and activate all enabled plugins."""
        group = self.app_config["plugins"]["entry_point_group"]
        enabled = set(self.app_config["plugins"].get("enabled", []))
        disabled = set(self.app_config["plugins"].get("disabled", []))
        config_dir = Path(self.app_config["plugins"].get("config_dir", "config/plugins"))

        for ep in importlib.metadata.entry_points(group=group):
            if disabled and ep.name in disabled:
                continue
            if enabled and ep.name not in enabled:
                continue

            plugin_class = ep.load()
            plugin = plugin_class()

            # Load plugin-specific config
            plugin_config = {}
            plugin_yaml = config_dir / f"{ep.name}.yaml"
            if plugin_yaml.exists():
                plugin_config = self._load_yaml(str(plugin_yaml))

            plugin.init(self.app_config, plugin_config)
            plugin.activate()

            # Register hooks
            for hook_name, handler in plugin.get_hooks().items():
                self.registry.register(hook_name, handler)

            self.plugins[ep.name] = plugin

    def unload(self, name: str) -> None:
        """Deactivate and remove a plugin."""
        if name in self.plugins:
            plugin = self.plugins[name]
            for hook_name, handler in plugin.get_hooks().items():
                self.registry.unregister(hook_name, handler)
            plugin.deactivate()
            del self.plugins[name]

    @staticmethod
    def _load_yaml(path: str) -> dict:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
```

### 3.4 PluginForge Paketstruktur

```
pluginforge/
├── pluginforge/
│   ├── __init__.py          # Public API: BasePlugin, HookRegistry, PluginLoader
│   ├── base.py              # BasePlugin ABC
│   ├── hooks.py             # HookRegistry
│   ├── loader.py            # PluginLoader mit Entry Point Discovery
│   └── config.py            # YAML-Config Loader und Validierung
├── tests/
├── pyproject.toml
├── README.md
└── LICENSE
```

---

## 4. Bibliogon App

### 4.1 Datenmodell

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
  content: str (HTML von TipTap)
  position: int
  created_at: datetime
  updated_at: datetime
```

Geplante Erweiterungen:

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
```

### 4.2 Integration mit PluginForge

```python
# bibliogon/backend/app/main.py

from pluginforge import PluginLoader

loader = PluginLoader("config/app.yaml")
loader.load_all()

# Beim Export: Plugins fragen welche Formate verfuegbar sind
formats = loader.registry.call("export.formats")

# Beim Export ausfuehren
result = loader.registry.call_first("export.execute", book=book, fmt="epub")

# Vor dem Kapitel-Speichern: Pipeline durch alle Plugins
content = loader.registry.call_pipeline("chapter.pre_save", value=content, chapter=chapter)
```

### 4.3 Export als Plugin

Der gesamte Export ist ein Plugin (`bibliogon-plugin-export`), kein Teil des Kerns:

```
bibliogon-plugin-export/
├── pyproject.toml
├── bibliogon_export/
│   ├── __init__.py
│   ├── plugin.py            # ExportPlugin(BasePlugin)
│   ├── scaffolder.py        # write-book-template Verzeichnisstruktur
│   ├── pandoc_runner.py     # Pandoc-Aufrufe
│   ├── html_to_markdown.py  # HTML -> Markdown Konvertierung
│   └── routes.py            # /api/books/{id}/export/{fmt}
├── config/
│   └── export.yaml          # Format-Definitionen, Pandoc-Settings
└── tests/
```

```toml
# bibliogon-plugin-export/pyproject.toml
[project.entry-points."bibliogon.plugins"]
export = "bibliogon_export.plugin:ExportPlugin"
```

```python
# bibliogon_export/plugin.py

from pluginforge import BasePlugin

class ExportPlugin(BasePlugin):
    name = "export"
    version = "1.0.0"
    description = "EPUB, PDF and project structure export via Pandoc"

    def get_hooks(self):
        return {
            "export.formats": self.register_formats,
            "export.execute": self.execute_export,
            "ui.sidebar_actions": self.sidebar_actions,
        }

    def register_formats(self):
        # Formate aus der Plugin-Konfiguration lesen, nicht hartcodiert
        return self.config.get("formats", [])

    def execute_export(self, book, fmt, options=None):
        from .scaffolder import scaffold_project
        from .pandoc_runner import run_pandoc

        project_dir = scaffold_project(book, self.config)
        if fmt == "project":
            return zip_directory(project_dir)
        return run_pandoc(project_dir, fmt, self.config)

    def sidebar_actions(self):
        return [
            {"label": fmt["label"], "icon": "download", "action": f"export_{fmt['id']}"}
            for fmt in self.config.get("formats", [])
        ]
```

### 4.4 write-book-template Verzeichnisstruktur

Das Export-Plugin erzeugt beim Export die vollstaendige Struktur:

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
| `Chapter.content` | Markdown-Body (konvertiert aus HTML) |
| `Chapter.position` | Numerisches Praefix (`01-`, `02-`, ...) |

---

## 5. Geschaeftsmodell

| Schicht | Lizenz | Inhalt |
|---------|--------|--------|
| PluginForge | MIT (kostenlos) | Framework, fuer jeden nutzbar |
| Bibliogon Core | MIT (kostenlos) | UI, Editor, Book/Chapter CRUD |
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

| Plugin | Typ | Beschreibung |
|--------|-----|-------------|
| `plugin-kinderbuch` | Export + Editor | Bild-pro-Seite Layout, spezielle Templates |
| `plugin-kdp` | Export | KDP-Metadaten, Cover-Validierung, Vorschau |
| `plugin-audiobook` | Export | Text-to-Speech, MP3/M4B, Kapitelmarker |
| `plugin-grammar` | Editor | LanguageTool-Integration |
| `plugin-ai-assist` | Editor | KI-Schreibhilfe |
| `plugin-collaboration` | Struktur | Multi-User Echtzeit-Bearbeitung |
| `plugin-versioning` | Editor | Kapitel-Versionsgeschichte mit Diff |
| `plugin-docx` | Export | Word-Export fuer Lektorate |

---

## 6. Roadmap

### Phase 1: MVP (v0.1.0) - erledigt

- Backend: Book/Chapter CRUD, einfacher Pandoc-Export
- Frontend: Dashboard, Kapitel-Editor mit TipTap, Export-Buttons
- Deployment: Docker Compose, Makefile

### Phase 2: PluginForge Framework (v0.2.0)

- Eigenes Repository `pluginforge` anlegen
- BasePlugin, HookRegistry, PluginLoader implementieren
- YAML-Konfigurationssystem (`config/app.yaml`, `config/plugins/*.yaml`)
- Plugin-Lifecycle (init, activate, deactivate)
- Entry Point Discovery
- Tests und Dokumentation
- Auf PyPI veroeffentlichen
- Bibliogon-Backend auf PluginForge umstellen

### Phase 3: Export als Plugin (v0.3.0)

- `bibliogon-plugin-export` als erstes Plugin
- write-book-template Verzeichnisstruktur-Scaffolding
- HTML-zu-Markdown Konvertierung (TipTap -> Markdown)
- ZIP-Export der kompletten Projektstruktur
- EPUB/PDF-Export ueber scaffolded Verzeichnis
- `config/metadata.yaml` Generierung
- Alten fest verdrahteten Export-Code entfernen
- Plugin-Verwaltung in der UI (aktivieren/deaktivieren)

### Phase 4: Import und erweiterte Kapiteltypen (v0.4.0)

- write-book-template Projekt importieren (ZIP-Upload)
- ChapterType-Enum fuer Front-Matter und Back-Matter
- UI: Separate Sektionen in der Sidebar
- Asset-Upload (Cover, Bilder)

### Phase 5: Erste Premium-Plugins (v0.5.0)

- `plugin-kinderbuch`: Bild-pro-Seite Layout, spezielle Templates
- `plugin-kdp`: Metadaten-Export, Cover-Validierung, Vorschau
- Plugin-Lizenzpruefung (lokaler Lizenzschluessel)

### Phase 6: Editor-Erweiterungen (v0.6.0)

- Markdown-Modus im Editor (TipTap Umschaltung WYSIWYG/Markdown)
- Kapitel Drag-and-Drop Sortierung
- Autosave-Indikator
- `plugin-grammar`: LanguageTool-Integration

### Phase 7: Multi-User und SaaS (v1.0.0)

- Benutzerregistrierung und Authentifizierung
- PostgreSQL statt SQLite
- Pen-Name-Verwaltung
- Plugin-Marketplace
- Abrechnungsintegration (Stripe)

---

## 7. Abgrenzung

### Was Bibliogon ist

- Eine Web-UI zum Schreiben von Buechern
- Aufgebaut auf einem wiederverwendbaren Plugin-Framework (PluginForge)
- Ein Generator fuer write-book-template Projektstrukturen (via Plugin)
- Ein EPUB/PDF-Export-Tool via Pandoc (via Plugin)
- Ein Open-Source-Projekt mit SaaS-Potenzial

### Was PluginForge ist

- Ein anwendungsunabhaengiges Plugin-Framework fuer Python
- Wiederverwendbar fuer beliebige Anwendungen (nicht nur Bibliogon)
- YAML-konfigurierbar (Titel, Labels, Einstellungen, alles anpassbar)
- Hook-basiert mit typisierter Registry

### Was beides nicht ist

- Kein KI-Textgenerator (aber erweiterbar per Plugin)
- Kein kollaboratives Echtzeit-Tool (aber erweiterbar per Plugin)
- Kein Layoutprogramm (kein InDesign-Ersatz)

---

## 8. Konkurrenzanalyse

| Tool | Open Source | Web-basiert | Plugin-System | Projektstruktur | Zielgruppe |
|------|-----------|-------------|---------------|-----------------|------------|
| Scrivener | Nein | Nein | Nein | Proprietaer | Power-Autoren |
| Reedsy Studio | Nein | Ja | Nein | Nein | Einsteiger |
| Manuskript | Ja | Nein | Nein | Proprietaer | Plotter |
| Obsidian | Nein | Nein | Ja (Community) | Nein | Allgemein |
| VS Code | Ja | Ja | Ja (Extensions) | Nein | Entwickler |
| **Bibliogon** | **Ja** | **Ja** | **Ja (PluginForge)** | **write-book-template** | **Autoren + Entwickler** |

Der Differenzierungsfaktor: Kein anderes Autoren-Tool kombiniert Open Source, Web-UI, ein echtes Plugin-Framework, und eine standardisierte Pandoc-kompatible Projektstruktur.

---

## 9. Offene Fragen

1. **HTML zu Markdown:** TipTap speichert Inhalte als HTML. Beim Export muss konvertiert werden. Optionen: `html2text` (Python), Pandoc selbst (`pandoc -f html -t markdown`), oder beides als Fallback-Kette.

2. **Bilder-Handling:** Lokal im Dateisystem, in der DB als Blob, oder S3 (SaaS)?

3. **PluginForge Name:** Ist `pluginforge` als PyPI-Paketname frei? Alternativen falls belegt.

4. **Frontend-Plugin-Loading:** Dynamisches Laden von React-Komponenten zur Laufzeit (Module Federation) oder statisches Bundling beim Build?

5. **Plugin-Lizenzierung:** Offline-Lizenzschluessel oder Online-Validierung (SaaS-only)?

6. **PluginForge Scope:** Soll PluginForge auch Frontend-Plugin-Loading abdecken (JS/TS), oder nur Backend (Python)? Frontend-Pendant als separates npm-Paket?
