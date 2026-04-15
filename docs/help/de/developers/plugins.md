# Plugin-Entwicklerhandbuch

Dieses Handbuch erklärt, wie Plugins für Bibliogon entwickelt werden. Plugins erweitern die Plattform mit neuen Funktionen, ohne den Kern zu verändern.

## Architekturüberblick

Bibliogon verwendet [PluginForge](https://github.com/astrapi69/pluginforge) (PyPI) als Plugin-Framework, basierend auf pluggy. Plugins sind eigenständige Python-Pakete, die über Entry Points entdeckt werden.

```
Frontend (React) -> Backend (FastAPI) -> PluginForge -> Dein Plugin
```

Jedes Plugin kann:
- API-Endpunkte hinzufügen (FastAPI-Router)
- Hooks implementieren (Inhaltstransformation, Exportformate)
- UI-Erweiterungen deklarieren (Seitenleistenaktionen, Toolbar-Buttons, Einstellungen, Seiten)
- Eigene Konfiguration mitbringen (YAML)

## Verzeichnisstruktur

```
plugins/bibliogon-plugin-{name}/
  bibliogon_{name}/
    __init__.py
    plugin.py          # Plugin-Klasse (erforderlich)
    routes.py          # FastAPI-Router (optional)
    {modul}.py         # Geschäftslogik-Module
  tests/
    test_{name}.py
  pyproject.toml       # Paketmetadaten + Entry Point (erforderlich)
```

**Namenskonventionen:**
- Plugin-Ordner: `bibliogon-plugin-{name}` (Kebab-Case)
- Python-Paket: `bibliogon_{name}` (Snake-Case)
- Plugin-Name im Code: `{name}` (Kleinbuchstaben, z.B. "help", "export", "grammar")

## Minimales Plugin

### pyproject.toml

```toml
[tool.poetry]
name = "bibliogon-plugin-meinplugin"
version = "1.0.0"
description = "Mein eigenes Bibliogon-Plugin"
authors = ["Dein Name"]
license = "MIT"
packages = [{include = "bibliogon_meinplugin"}]

[tool.poetry.dependencies]
python = "^3.11"
pluginforge = "^0.5.0"
fastapi = "^0.115.0"

[tool.poetry.plugins."bibliogon.plugins"]
meinplugin = "bibliogon_meinplugin.plugin:MeinPlugin"
```

Der Entry Point `[tool.poetry.plugins."bibliogon.plugins"]` ist der Mechanismus, über den PluginForge das Plugin entdeckt.

### plugin.py

```python
from typing import Any
from pluginforge import BasePlugin


class MeinPlugin(BasePlugin):
    name = "meinplugin"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"           # In Bibliogon ist "core" der einzige verwendete Wert; alle Plugins sind frei nutzbar.
    depends_on: list[str] = []      # z.B. ["export"] wenn Export-Plugin benötigt

    def activate(self) -> None:
        """Wird beim Laden des Plugins aufgerufen."""
        from .routes import set_config
        set_config(self.config)

    def get_routes(self) -> list[Any]:
        """FastAPI-Router zurückgeben."""
        from .routes import router
        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        """UI-Erweiterungen deklarieren. None wenn kein UI."""
        return None
```

### routes.py

```python
from fastapi import APIRouter

router = APIRouter(prefix="/meinplugin", tags=["meinplugin"])

_config: dict = {}

def set_config(config: dict) -> None:
    global _config
    _config = config


@router.get("/hello")
def hello():
    return {"message": "Hallo von meinem Plugin!"}
```

**Regeln:**
- routes.py enthält NUR Endpunkt-Definitionen, die an Service-Funktionen delegieren
- Geschäftslogik gehört in separate Module (z.B. `service.py`, `analyzer.py`)
- Kein direkter Datenbankzugriff in Routes; Service-Funktionen verwenden
- Pydantic v2 für alle Request/Response-Schemas

## Hooks

Plugins können Hooks implementieren, die in `backend/app/hookspecs.py` definiert sind. Hooks ermöglichen die Teilnahme an Kernabläufen ohne Änderung des Kerncodes.

### Verfügbare Hooks

| Hook | Zweck | Rückgabe |
|------|-------|---------|
| `export_formats()` | Unterstützte Exportformate deklarieren | `list[dict]` |
| `export_execute(book, fmt, options)` | Export ausführen (erstes Ergebnis gewinnt) | `Path oder None` |
| `chapter_pre_save(content, chapter_id)` | Inhalt vor dem Speichern transformieren | `str oder None` |
| `content_pre_import(content, language)` | Markdown beim Import transformieren | `str oder None` |

### Hook implementieren

In der `plugin.py` eine Methode mit dem Hook-Namen hinzufügen:

```python
class MeinPlugin(BasePlugin):
    name = "meinplugin"

    def content_pre_import(self, content: str, language: str) -> str | None:
        """Importiertes Markdown vor der Konvertierung bereinigen."""
        cleaned = content.replace("\r\n", "\n")
        return cleaned
```

## Konfiguration

Plugin-Konfiguration liegt unter `backend/config/plugins/{name}.yaml`.

### YAML-Struktur

```yaml
plugin:
  name: "meinplugin"
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
  meine_option: true
  schwellwert: 0.8
```

### Auf Konfiguration zugreifen

```python
def activate(self) -> None:
    schwellwert = self.config.get("settings", {}).get("schwellwert", 0.5)
```

### Sichtbarkeitsregeln für Einstellungen

Jede Einstellung in der YAML muss entweder:
1. Im Plugin-UI editierbar sein (Einstellungen > Plugins > {Name}), ODER
2. Mit `# INTERNAL` Kommentar markiert sein

Versteckte Einstellungen, die Nutzerverhalten beeinflussen, sind nicht erlaubt.

## Frontend-Manifest

Plugins deklarieren UI-Erweiterungen über `get_frontend_manifest()`. Das Frontend fragt `/api/plugins/manifests` ab, um alle Erweiterungen zu entdecken.

### Verfügbare UI-Slots

| Slot | Position | Anwendungsfall |
|------|----------|---------------|
| `pages` | App-Navigation | Vollständige Plugin-Seite |
| `sidebar_actions` | BookEditor-Seitenleiste | Aktionsbuttons |
| `toolbar_buttons` | Editor-Toolbar | Formatierungstools |
| `editor_panels` | Neben dem Editor | Seitenpanels |
| `settings_section` | Einstellungen > Plugins | Plugin-Konfiguration |
| `export_options` | Export-Dialog | Formatspezifische Optionen |

### Beispiel: Seite hinzufügen

```python
def get_frontend_manifest(self) -> dict[str, Any] | None:
    return {
        "pages": [
            {
                "id": "meinplugin",
                "path": "/meinplugin",
                "label": {"de": "Mein Plugin", "en": "My Plugin"},
                "icon": "puzzle",  # lucide-react Icon-Name
            },
        ],
    }
```

## ZIP-Distribution

Plugins von Drittanbietern werden als ZIP-Dateien verteilt und über Einstellungen > Plugins installiert.

### ZIP-Struktur

```
meinplugin.zip
  plugin.yaml          # Erforderlich: Plugin-Metadaten
  bibliogon_meinplugin/
    __init__.py
    plugin.py
    routes.py
  config/
    meinplugin.yaml    # Plugin-Konfiguration
```

### plugin.yaml (erforderlich für ZIP-Plugins)

```yaml
name: meinplugin
display_name:
  de: "Mein Plugin"
  en: "My Plugin"
version: "1.0.0"
package: bibliogon_meinplugin
entry_class: MeinPlugin
```

### Namensvalidierung

Plugin-Namen müssen dem Muster entsprechen: `[a-z][a-z0-9_-]{1,48}[a-z0-9]` (3-50 Zeichen, Kleinbuchstaben, Ziffern, Bindestriche, Unterstriche).

## Tests

Plugin-Tests liegen unter `plugins/bibliogon-plugin-{name}/tests/`.

```bash
# Tests für ein bestimmtes Plugin
make test-plugin-{name}

# Alle Plugin-Tests
make test-plugins
```

## Vorhandene Plugins als Referenz

| Plugin | Komplexität | Gutes Beispiel für |
|--------|------------|-------------------|
| help | Einfach | Routes + Config + i18n |
| ms-tools | Mittel | Hooks + Per-Book-Einstellungen + UI-Panel |
| export | Komplex | Mehrere Formate + Async-Jobs + Scaffolding |
| audiobook | Komplex | Externe APIs + SSE-Fortschritt + Persistenz |

Beginne mit dem Help-Plugin als Vorlage, dann ms-tools für Hook-Implementierungsmuster.
