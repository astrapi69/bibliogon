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
fastapi = "^0.135.0"

[tool.poetry.plugins."bibliogon.plugins"]
meinplugin = "bibliogon_meinplugin.plugin:MeinPlugin"
```

Der Entry Point `[tool.poetry.plugins."bibliogon.plugins"]` ist der Mechanismus, über den PluginForge das Plugin entdeckt.

### Plugin im Backend registrieren

Für **gebündelte Plugins** (jedes Plugin, das innerhalb des Bibliogon-Repositorys unter `plugins/` ausgeliefert wird) muss zusätzlich ein Path-Dependency-Eintrag in `backend/pyproject.toml` angelegt werden, damit das Backend-Poetry-Environment das Plugin installiert und dessen Entry Points auffindbar werden:

```toml
[tool.poetry.dependencies]
# ...vorhandene Einträge...
bibliogon-plugin-myplugin = {path = "../plugins/bibliogon-plugin-myplugin", develop = true}
```

Anschließend `poetry lock` und `poetry install` im Verzeichnis `backend/` ausführen. **Wenn dieser Schritt vergessen wird, ist das Plugin in CI unsichtbar** (lokal funktioniert es für alle, deren venv die dist-info aus einer früheren Installation noch enthält, aber frische Checkouts und der CI-Runner laden nur, was in `pyproject.toml` deklariert ist). ZIP-distribuierte Drittanbieter-Plugins sind ausgenommen, weil sie zur Laufzeit über `sys.path` installiert werden, nicht zur Setup-Zeit.

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

## Abhängigkeiten

Benötigt dein Plugin eine Abhängigkeit, die nicht im Core ist, deklariere sie in deiner `pyproject.toml`. Für ZIP-verteilte Plugins müssen Abhängigkeiten gebündelt oder bereits in der Bibliogon-Umgebung verfügbar sein.

Füge KEINE neuen Abhängigkeiten zum Core hinzu, ohne zu fragen. Aktueller Stack:
- Backend: FastAPI, SQLAlchemy, Pydantic v2, pluginforge, PyYAML, httpx
- Frontend: React 19, TypeScript 6, Vite 7, TipTap, Radix UI, Lucide

## Vorhandene Plugins als Referenz

| Plugin | Komplexität | Gutes Beispiel für |
|--------|------------|-------------------|
| help | Einfach | Routes + Config + i18n |
| ms-tools | Mittel | Hooks + Per-Book-Einstellungen + UI-Panel |
| export | Komplex | Mehrere Formate + Async-Jobs + Scaffolding |
| audiobook | Komplex | Externe APIs + SSE-Fortschritt + Persistenz |
| git-sync | Mittel | Import-Plugin + Plugin-zu-Plugin-Abhaengigkeit |

Beginne mit dem Help-Plugin als Vorlage, dann ms-tools für Hook-Implementierungsmuster.

---

## Import-Plugin-Muster (aus PGS-01)

Wenn ein Plugin den Import eines neuen Formats oder einer neuen *Quelle* unterstuetzen soll, ist der Core-Import-Orchestrator (`backend/app/import_plugins/`) der Integrationspunkt. Das erste externe Import-Plugin (`plugin-git-sync`, PGS-01) brachte vier Architekturmuster hervor, die kuenftige Import-Plugins kennen sollten.

### Muster 1: Quell-Adapter statt Format-Neuimplementierung

**Problem.** Dein Plugin soll Buecher aus einer neuen *Quelle* importieren (Git-URL, Cloud-Link, Gist, ...), aber das zugrundeliegende *Format* hat bereits einen Handler im Core oder in einem anderen Plugin. Den Parser zu duplizieren erzeugt Code, der auseinanderdriftet.

**Loesung.** Dein Plugin wird ein **Quell-Adapter**: es holt/bereitet die Daten in einen Dateisystem-Pfad und uebergibt dann an den bestehenden Format-Handler. Das Format nicht noch einmal parsen.

**PGS-01 Beispiel.** `GitImportHandler.clone(url, target_dir)` klont in das Staging-Verzeichnis des Orchestrators und gibt den Projekt-Root-Pfad zurueck. Der Endpoint ruft danach `find_handler(staged_path)` auf, das den bestehenden `WbtImportHandler` (Core, aus CIO-02) greift. Das Plugin parst weder `config/metadata.yaml` noch laeuft es durch `manuscript/` — das macht `WbtImportHandler`.

**Vorteile.**
- Keine Duplikation. Ein Bugfix im Format-Handler hilft automatisch jeder Quelle.
- Konsistente `DetectedProject`-Payloads ueber alle Quellen (gleiche Preview, gleiche Duplikat-Erkennung, gleiche Override-Allowlist).
- Dein Plugin bleibt klein — ~100 LOC Handler statt 500+.

**Wann NICHT verwenden.** Wenn das Format wirklich neu ist (kein bestehender Handler produziert ein `DetectedProject` daraus), baust du ein echtes `ImportPlugin` und parst selbst. Quell-Adapter funktioniert nur, wenn ein Format-Handler nachgelagert bereitsteht.

### Muster 2: Zwei Registries im Core (`ImportPlugin` vs `RemoteSourceHandler`)

**Problem.** Ein Datei-Pfad-Input hat bei `detect()` einen Dateisystem-Pfad; eine URL nicht — sie muss erst geklont/geholt werden. Beide Shapes in ein Registry zu stopfen erzwingt `isinstance`-Heuristiken in `find_handler()`, was ein Codegeruch ist.

**Loesung.** Getrennte Registries fuer getrennte Input-Shapes. Beide teilen den `temp_ref`- + Staging-Verzeichnis-Mechanismus fuer `execute`.

- `ImportPlugin` (in `backend/app/import_plugins/protocol.py`): Datei-Pfad-Inputs. `can_handle(path) -> bool`, `detect(path)`, `execute(path, ...)`.
- `RemoteSourceHandler` (in `backend/app/import_plugins/registry.py`, neu in PGS-01): URL-Inputs. `can_handle(url) -> bool`, `clone(url, target_dir) -> Path`. Nach dem Klonen dispatcht der Orchestrator per `find_handler()` auf dem geklonten Pfad — die Format-Erkennung nutzt also das `ImportPlugin`-Registry wieder.

**Beim Hinzufuegen einer dritten Input-Shape.** Wenn dein Plugin eine neue Shape bringt, die in keines passt (z. B. "Buch aus SQL-Abfrage-Ergebnis"), abwaegen: (a) im Plugin auf eine der bestehenden Shapes normalisieren, (b) drittes Registry + neuer Endpoint (`POST /api/import/detect/{kind}`). Bevorzuge (a) — haelt die Registry-Anzahl klein.

**Anti-Muster.** `if input.startswith("http"): ... elif Path(input).is_dir(): ...` in einem einzelnen `find_handler` mischt Shape-Erkennung in die Abstraktion. Dispatch bleibt semantisch, nicht syntaktisch.

### Muster 3: Plugin-zu-Plugin-Abhaengigkeit via Path-Dep

**Problem.** Dein Plugin braucht Utility-Code aus einem anderen Plugin (z. B. `tiptap_to_markdown` aus `plugin-export`). Du willst den Code nicht kopieren und kannst das andere Plugin (noch) nicht per pip installieren, weil beide im gleichen Monorepo liegen.

**Loesung.** Abhaengigkeit in `pyproject.toml` per relativem Pfad deklarieren:

```toml
[tool.poetry.dependencies]
bibliogon-plugin-export = {path = "../bibliogon-plugin-export", develop = true}
```

`poetry install` im Plugin-Verzeichnis bindet das andere Plugin in die venv. Imports funktionieren wie bei einem PyPI-Paket.

**PGS-01 Beispiel.** `plugin-git-sync` deklariert `bibliogon-plugin-export` als Path-Dep. Phase 1 nutzt die Abhaengigkeit zur Laufzeit noch nicht — sie ist Geruest fuer PGS-02 (Export-to-Repo), das per `from bibliogon_export.tiptap_to_md import tiptap_to_markdown` Buecher zurueck ins Git-Repo serialisieren wird. Die Deklaration kommt frueh, damit die Architektur sichtbar ist, bevor der Code folgt.

**Beim PyPI-Release.** Ein Path-Dep loest bei `pip install bibliogon-plugin-git-sync` ausserhalb des Monorepos nicht auf. Der Publish-Schritt muss ihn auf einen Versions-Pin umstellen:

```toml
bibliogon-plugin-export = ">=1.0.0,<2.0.0"
```

Das passiert beim PyPI-Release, nicht waehrend der Entwicklung.

**Wenn die Abhaengigkeit optional ist.** Wenn dein Plugin auch ohne die andere funktioniert, keinen Path-Dep deklarieren — deferred Import innerhalb des betroffenen Code-Pfads, `ImportError` abfangen, graceful degradieren. Path-Deps sind fuer Pflicht-Abhaengigkeiten.

### Muster 4: PluginForge-Activation -> Core-Registry-Bridge

**Problem.** PluginForge erkennt Plugins per Entry-Points; Bibliogons Core-Registries (`ImportPlugin`, `RemoteSourceHandler`, Hookspecs, ...) haben eigene `register(...)`-Funktionen. Etwas muss "PluginForge hat das Plugin geladen" und "Bibliogon kennt seine Handler" verbinden.

**Loesung.** Der `activate()`-Hook des Plugins importiert die Core-Registrierungsfunktion deferred und ruft sie auf:

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

Und `registration.py`:

```python
def register_git_handler(handler: object) -> None:
    from app.import_plugins import register_remote_handler
    register_remote_handler(handler)  # type: ignore[arg-type]
```

**Warum deferred Imports.** Ein Import von `app.*` auf Modul-Ebene koppelt das Plugin-Modul an das voll geladene Bibliogon-Backend. Das bricht Plugin-Unit-Tests, die nur die Handler-Logik testen wollen. Verlagern in `activate()` (das erst im App-Lifespan feuert) haelt das Plugin-Modul eigenstaendig importierbar.

**Timing.** PluginForge ruft `activate()` waehrend `manager.discover_plugins()` im App-Lifespan auf, vor dem ersten HTTP-Request. Wenn eine Route feuert, sind alle Registrierungen bereits passiert.

**Anti-Muster.** Side-Effect-Imports auf Modul-Ebene (`register_remote_handler(...)` ganz unten in `plugin.py`) funktionieren in Produktion, brechen aber eigenstaendige Testlaeufe und machen Import-Ordering fragil. Immer ueber `activate()`.

---

## Dein erstes Plugin schreiben (PGS-01 als Vorlage)

Schritt-fuer-Schritt mit der Shape von PGS-01. Endzustand: funktionsfaehiges Plugin-Geruest zum Ausbauen.

### Schritt 1: Entscheide, was dein Plugin tut

Drei haeufige Shapes:

| Shape | Protocol | Registriert bei | Beispiel |
|-------|----------|-----------------|----------|
| Neues Format | `ImportPlugin` | `app.import_plugins.register` | `WbtImportHandler` (Core, CIO-02) |
| Neue Quelle | `RemoteSourceHandler` | `app.import_plugins.register_remote_handler` | `GitImportHandler` (PGS-01) |
| Neues Core-Verhalten | Pluggy `@hookimpl` | `BibliogonHookSpec` (siehe `backend/app/hookspecs.py`) | `plugin-grammar` (content_pre_import) |

Eins waehlen. Wenn deine Arbeit wirklich zwei umfasst (z. B. Format-Plugin + Hookspec), beides — PluginForge erlaubt das.

### Schritt 2: Plugin-Paket erstellen

Layout identisch zu den anderen 10 Plugins:

```
plugins/bibliogon-plugin-<name>/
├── pyproject.toml
├── README.md
├── bibliogon_<name>/
│   ├── __init__.py
│   ├── plugin.py           # BasePlugin-Subclass, activate()-Hook
│   └── handlers/
│       ├── __init__.py
│       └── <kind>_handler.py
└── tests/
    ├── __init__.py
    └── test_<kind>_handler.py
```

Minimal-`pyproject.toml`: siehe englische Version oben (Struktur identisch).

Ausserdem das Plugin in `backend/pyproject.toml` als Path-Dep eintragen (siehe "Plugin im Backend registrieren" oben). Wer das vergisst, macht das Plugin fuer CI unsichtbar.

### Schritt 3: Protocol implementieren

Shape vom aehnlichsten Plugin aus Schritt 1 kopieren. Fuer `RemoteSourceHandler` ist die Minimal-Signatur:

```python
class <Name>Handler:
    source_kind = "<kind>"

    def can_handle(self, url: str) -> bool: ...
    def clone(self, url: str, target_dir: Path) -> Path: ...
```

Gib den Pfad zurueck, durch den der Orchestrator dispatchen soll (meist ein Unterverzeichnis in `target_dir`). Exceptions fuer nicht-wiederherstellbare Fehler werfen; der Endpoint mappt auf HTTP 502.

### Schritt 4: Activation verdrahten

Siehe englische Version oben (Code identisch). Deferred Imports sind tragend. Im Funktionskoerper halten.

### Schritt 5: Tests hinzufuegen

Drei Ebenen, jede in eigener Datei:

- **Plugin-Ebene** (`plugins/bibliogon-plugin-<name>/tests/test_<kind>_handler.py`): Unit-Tests der Handler-Klasse. Externe Services mocken (GitPython, HTTP-Clients, ...). Kein App-Load.
- **Endpoint-Ebene** (`backend/tests/test_import_<kind>_endpoint.py`): `TestClient(app)`, trifft `POST /api/import/detect/<kind>`, mockt die externe Dependency des Handlers, damit die Plugin-Endpoint-Handler-Kette ohne Netzwerk getestet wird. `scope="module"` am `client`-Fixture, um Lifespan-State-Akkumulation zu begrenzen (siehe RecursionError-Notiz in `.claude/rules/lessons-learned.md`).
- **Plugin-Smoke** (gleiche Datei, 1-2 Tests): `list_remote_handlers()` (oder Aequivalent) muss deinen Handler nach Lifespan enthalten. Regressions-Guard gegen "Plugin nicht in `app.yaml` enabled-Liste".

### Schritt 6: In app.yaml aktivieren

```yaml
plugins:
  enabled:
    - export
    - help
    - ...
    - <name>
```

`backend/config/app.yaml.example` editieren — diese Datei ist die Quelle der Wahrheit fuer Neuinstallationen. Lokales `backend/config/app.yaml` ist gitignored; PS-01 kopiert `.example` beim ersten Start.

### Schritt 7: Ausliefern

- `docs/ROADMAP.md`: Eintrag der Phase auf `[x]` mit Ein-Absatz-Abschlussnotiz.
- `docs/help/_meta.yaml`: Nav-Eintrag ergaenzen, wenn dein Plugin user-sichtbares Verhalten hat.
- `docs/help/{de,en}/<topic>/<slug>.md`: user-orientierte Hilfe-Seite schreiben. Mindestens DE + EN.
- `backend/config/plugins/help.yaml`: mindestens einen FAQ-Eintrag ergaenzen, der Nutzer auf das neue Feature hinweist.
- `Makefile`: `test-plugin-<name>`-Target hinzufuegen und in `test-plugins`-Liste aufnehmen.

### Schritt 8: Haeufige Fallstricke

- **Handler zur Laufzeit nicht registriert.** Plugin nicht in `app.yaml`-enabled-Liste. PluginForge hat den Entry-Point erkannt, aber Activation uebersprungen.
- **Plugin laeuft lokal, faellt in CI aus.** Path-Dep fehlt in `backend/pyproject.toml`. Die Backend-venv ist die autoritative Umgebung; CI installiert genau das, was dort deklariert ist.
- **Import-Zyklus beim Plugin-Load.** Etwas in `plugin.py` auf Modul-Ebene importiert `app.*`. In `activate()` oder einen anderen Funktionskoerper verschieben.
- **Einzeltests gruen, volle Suite mit RecursionError rot.** Per-Test-`TestClient(app)`-Fixtures akkumulieren Plugin-Route-State am geteilten FastAPI-Singleton. `scope="module"` (siehe `.claude/rules/lessons-learned.md`).
- **Plugin-zu-Plugin-Dep loest nicht auf.** Relativer `path = "../..."` in deiner `pyproject.toml` passt nicht zum tatsaechlichen Layout. Korrigieren oder `poetry lock` laufen lassen.
- **`can_handle` des Handlers feuert nie.** Registrierungs-Reihenfolge pruefen: first-registered wins in `find_handler()`. Wenn ein frueherer Handler alles greift, ist deiner unerreichbar.

---

## Referenz: `plugin-git-sync` Quellcode-Walkthrough

Konkretes Beispiel fuer alles oben: PGS-01-Commits in Reihenfolge lesen — jeder ist ein einzelner atomarer Schritt:

| Commit | Zustaendigkeit |
|--------|----------------|
| `c93d496` | Plugin-Geruest + pyproject + Backend-Path-Dep |
| `4fb9e99` | Frontend-Input + API-Client + i18n |
| `c14c8c7` | Core-Registry + Endpoint (noch kein Plugin-Verhalten) |
| `a3616f3` | Handler-Implementierung + Plugin-Tests |
| `df6cb39` | `app.yaml`-Wiring + E2E-Integrationstest |
| `ced994c` | ROADMAP-Flip + Hilfe-Docs |

Jeden Diff neben dieser Anleitung studieren.

---

## Bidirektionale Sync-Patterns (aus PGS-02..05)

PGS-01 brachte Buecher *in* Bibliogon hinein. Phasen 2-5 schliessen den Round-Trip — Buch neu scaffolden und zurueck zum Remote pushen. Vier Patterns, die jedes Plugin trifft, das externen State veraendert.

### Muster 5: Per-Buch-Lock fuer Cross-Subsystem-Operationen

**Problem.** Klick auf "Commit ueberall" faechert den Aufruf in zwei Subsysteme auf (Core-Git + plugin-git-sync). Ohne Koordination racen zwei gleichzeitige Faechrungen (alter Dialog in anderem Tab, Re-Click waehrend langsamem ersten Versuch) am Working Tree und am `last_committed_at`-Cursor.

**Loesung.** Schluesselter Lock auf `book_id` mit kurzem Timeout. PGS-05 liefert `app.services.git_sync_lock.book_commit_lock(book_id, timeout=30)`:

```python
from app.services.git_sync_lock import book_commit_lock

with book_commit_lock(book_id, timeout=30):
    # core git zuerst (kleinerer Blast Radius), plugin-git-sync danach
    ...
```

Timeout mappt im Router auf HTTP 503, nie 500. Der Nutzer sieht "anderer Commit laeuft" und versucht es erneut.

**Wann nutzen.** Immer wenn eine User-Aktion auf >=2 mutierende Subsysteme derselben Resource auffaechert. Lock ist per Resource, nicht per Prozess.

**Anti-Pattern.** Implizit auf "niemand klickt zweimal" zu vertrauen ist der Bug; funktioniert in QA, scheitert wenn SSE-Reconnects denselben Aufruf wiederholen, wenn der Toast eines langsamen ersten Versuchs ablaeuft und der Nutzer neu klickt usw. Immer locken.

### Muster 6: Weiche Per-Subsystem-Fehleraggregation

**Problem.** Wenn Core-Git + plugin-git-sync gefaechert werden, ist Teil-Fehlschlag die Norm: eine Seite gelingt, die andere scheitert an Auth, Netzwerk oder "nichts zu committen". Ein hartes `raise HTTPException(500)` verliert den Erfolg und laesst den Nutzer mit generischem Fehler stehen.

**Loesung.** Per-Subsystem-Resultat mit stabilem Status-Enum:

```python
class SubsystemResult:
    status: Literal["ok", "skipped", "nothing_to_commit", "failed"]
    detail: str | None = None
    commit_sha: str | None = None
    pushed: bool = False
```

Beide Subsystem-Resultate landen im Response-Body, auch wenn eines scheiterte. Toast-Stufe (success / warning / error) entscheidet die Client-Seite aus den kombinierten Stati, sodass der Nutzer "Core erfolgreich, Plugin fehlgeschlagen (Auth)" sieht statt "Internal Server Error".

503 bleibt — feuert aber NUR wenn der Per-Buch-Lock nicht zu bekommen ist. Subsystem-Level-Fehler bleiben im 200-Payload.

**Wann nutzen.** Endpoint, der >=2 Subsysteme orchestriert wo Teilerfolg sinnvoll ist. Wenn beide atomar gelingen muessen (z.B. Finanztransaktion), passt das Pattern nicht — Transaction Boundary nutzen.

### Muster 7: One-Shot-Pushurl fuer Credential-Injection

**Problem.** PAT in `origin`-URL via `git remote set-url` einbetten funktioniert fuer HTTPS-Push, aber dann liegt der PAT in `.git/config` auf der Platte. Backup-Read des Repos wuerde den Token leaken.

**Loesung.** Eingebettete URL kurz vor dem Push setzen, Original-URL im `finally` wiederherstellen. PGS-02s `_push`:

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

Nach Return ist die URL auf Platte wieder original. Regression-Test (`test_commit_push_uses_per_book_pat_without_persisting_to_git_config`) liest `.git/config` nach dem Push und assertet, dass der Token nie auftaucht.

**Wann nutzen.** Immer wenn ein Secret in ein Config-Feld als temporaerer Auth-Carrier eingebettet wird.

**Per-Buch-Credential-Helper.** PGS-02-FU-01 fuegte `app.services.git_credentials` hinzu, sodass mehrere Subsysteme einen einzigen Per-Buch-PAT-Slot teilen. Wenn du Credentials fuer ein neues Subsystem am selben Buch brauchst, diesen Helper wiederverwenden statt parallelen Store bauen. Encrypted-at-rest via Fernet mit Schluessel aus `BIBLIOGON_CREDENTIALS_SECRET`.

### Muster 8: Fehlertolerante Lazy-Imports fuer Side-Effects

**Problem.** Dein Plugin produziert ein Primaer-Artefakt (z.B. einen Commit) und eine "nice to have"-Begleitdatei (z.B. Markdown-Sidefile neben dem kanonischen JSON fuer lesbare Git-Diffs). Der Begleitschreiber haengt via Path-Dep an einem Konverter eines anderen Plugins. Wenn der Begleitschreiber bricht, muss das Primaer-Artefakt trotzdem rausgehen.

**Loesung.** Helper innerhalb `try/except` lazy importieren, im Fehlerfall loggen und weitermachen. PGS-05s Markdown-Sidefile-Emitter:

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

Der Commit landet trotzdem; das Sidefile vielleicht nicht. Naechster Commit versucht es erneut.

**Wann nutzen.** Immer wenn du ein nicht-kanonisches Begleit-Artefakt produzierst. Wenn das Begleit-Artefakt das einzige Artefakt ist (z.B. EPUB-Output des Export-Plugins), passt das Pattern nicht — Fehler muessen hart hochpoppen.

**Anti-Pattern.** Eager-Import des Helpers oben im Plugin-Modul: ein zukuenftiger Refactor des Helper-Plugins bricht die Lade-Discovery *deines* Plugins, obwohl deine Primaer-Arbeit nichts damit zu tun hat.

---

## Three-Way-Diff-Patterns (aus PGS-03 + PGS-03-FU-01)

Wenn dein Plugin Inhalte aus einer externen Quelle re-importiert, die der Nutzer auch lokal editiert hat, musst du den Diff so aufbereiten, dass der Nutzer aufloesen kann. PGS-03 lieferte einen Three-Way-Diff (base / local / remote) ueber Kapitel; die Patterns generalisieren.

### Muster 9: Git-Refs ohne Working-Tree-Checkout lesen

**Problem.** Base-vs-Remote-Diff erfordert das Lesen von Dateiinhalt an ZWEI Commits. Naives `git checkout <ref>` wechselt den Working Tree und bricht parallele Commit-to-Repo-Flows.

**Loesung.** `git ls-tree -r --name-only <commit> <prefix>` + `git show <commit>:<path>` sind read-only und beruehren den Working Tree nie. PGS-03s `_read_wbt_at_ref(clone_path, ref)`:

```python
commit = repo.commit(ref)
tree = repo.git.ls_tree("-r", "--name-only", commit.hexsha, prefix).splitlines()
for path in tree:
    if path.endswith(".md"):
        content = repo.git.show(f"{commit.hexsha}:{path}")
        # ...
```

Ref erst zu Commit aufloesen, dann sind die `show`-Aufrufe deterministisch, auch wenn der Branch unter dir wandert.

**Wann nutzen.** Immer wenn du Inhalt an mehreren Refs in derselben logischen Operation brauchst. Working Tree als exklusiv fuer Commit-to-Repo / Merge / Checkout behandeln — nie fuer Read-Only-Inspektion.

### Muster 10: Reine Klassifikation + seiteneffektige Anwendung

**Problem.** Ein Diff hat zwei Verantwortungen: herausfinden *was sich geaendert hat* (Per-Kapitel-Klassifikation) und *Nutzer-Aufloesung anwenden* (DB mutieren). Vermischen ergibt eine 200-Zeilen-Funktion, untestbar ohne reales Git-Repo + DB.

**Loesung.** Zwei getrennte Funktionen:

- `_classify(base, local, remote) -> list[ChapterDiff]`: rein. Drei dicts identity → content rein, Liste von Klassifikationen raus. Kein Git, keine DB. Unit-testbar aus In-Memory-dicts.
- `apply_resolutions(db, *, book_id, resolutions)`: seiteneffektig. Mutiert DB nach Per-Kapitel-Wahl und bumpt den Cursor.

`diff_book(db, book_id)` ist der duenne Glue, der Inputs liest (via Pattern 9) und in `_classify` einspeist.

**Wann nutzen.** Jede nicht-triviale Entscheidung, die in einer DB-Mutation endet. Die Klassifikations-Haelfte verdient ~10 eigene Unit-Tests fuer Edge-Cases (`unchanged`, beidseitig-entfernt, identische-Edits-beidseitig, Blank-Line-only-Differenzen, ...). Dieselbe Coverage ueber End-to-End-Fixtures zu erreichen ist 5x langsamer und 10x sproeder.

**Normalisierungstolerante Vergleiche.** PGS-03s `_normalize` strippt trailing Whitespace pro Zeile, kollabiert Blank-Line-Runs, trimmt fuehrenden/abschliessenden Whitespace vor Equality. Markdown-Round-Trips ueber TipTap → Markdown → Datei → TipTap fuegen oft einen finalen Newline hinzu oder weg; ohne Normalisierung wuerde jedes "unchanged"-Kapitel als "local_changed" klassifiziert.

### Muster 11: Post-Process-Collapse fuer Rename-Detection

**Problem.** Eine Datei, die von `slug-a` nach `slug-b` mit identischem Body wandert, klassifiziert als `*_removed` fuer den alten Slug UND `*_added` fuer den neuen — zwei verwirrende Zeilen, die der Nutzer mental paaren muss.

**Loesung.** Basis-Klassifizierer bleibt simpel (kennt keine Renames). Rename-Detection als separater Pass `_collapse_renames(diffs)` paart `(removed, added)`-Zeilen mit matchenden normalisierten Bodies in eine einzige `renamed_*`-Zeile. PGS-03-FU-01:

```python
def _collapse_renames(diffs: list[ChapterDiff]) -> list[ChapterDiff]:
    # gruppiere nach Klassifikation
    # fuer (remote_removed, remote_added): match Bodies, ersetze durch renamed_remote
    # fuer (local_removed, local_added): match Bodies, ersetze durch renamed_local
    # ungepaarte Zeilen unveraendert lassen
```

**Nur strikte Body-Matches.** Near-Misses (z.B. kleine Edits im Body waehrend des Renames) bleiben als unabhaengige removed + added stehen, sodass der Nutzer den echten Diff sieht. Fuzzy-Schwellen erzeugen False Positives, die unabhaengige Kapitel falsch paaren.

**Cross-Side-Pairing verboten.** Nie `remote_removed` mit `local_added` paaren, auch bei identischem Body — das ist Zufall, kein Rename, und es als solchen zu behandeln wuerde unabhaengige Arbeit stillschweigend mergen.

**Wann nutzen.** Jede "Rename"-Detection ueber einem Per-Item-Klassifizierer. Klassifizierer dumm halten, Post-Process gezielt.

---

## Multi-Branch / Translation-Group-Patterns (aus PGS-04 + PGS-04-FU-01)

Wenn dein Plugin mehrere Varianten derselben Resource aus einer Quelle importiert (z.B. Uebersetzungen eines Buchs auf verschiedenen Git-Branches), ist Failure-Isolation wichtiger als Erfolg.

### Muster 12: Stabile Reason-Slugs + Payload-driven Skip-Surface

**Problem.** Ueber N Branches iterieren und jeden importieren ist der einfache Teil. Schwer wird's bei den 2 von 5 Branches, die scheitern: WBT-Layout fehlt, Kapitel-Struktur inkompatibel, Metadata invalid. Wenn du `try/except` und nur loggst, sieht der Nutzer 3 importierte Buecher und verliert 2 still.

**Loesung.** Jeden Per-Item-Failure in ein strukturiertes `SkippedItem`-Payload neben den Erfolgen aufs Ergebnisobjekt fangen. PGS-04-FU-01s `MultiBranchResult.skipped: list[SkippedBranch]`:

```python
@dataclass
class SkippedBranch:
    branch: str
    reason: Literal["no_wbt_layout", "import_failed"]
    detail: str  # gekuerzte Diagnostik-Zeile
```

Zwei Failure-Modes mit eigenen Slugs:

- `no_wbt_layout` — strukturelle Vorbedingung scheiterte (config-Dir fehlt). Branch ist im Scope, aber kein Buch.
- `import_failed` — innerer Importer warf. Inkl. Exception-Klasse + Message, auf 500 Zeichen gekuerzt.

Router echot `skipped[]` im Response (default `[]` bei sauberen Imports), Frontend rendert eine "Aufmerksamkeit erforderlich"-Sektion pro Eintrag.

**Stabile englische Slugs in der API; lokalisierte Labels im Frontend.** Der Slug ist der API-Vertrag — nie ohne Migration aendern. Frontend mappt Slug → User-sichtbarer String pro Sprache. Wenn ein neuer Failure-Mode (vierter Slug) dazukommt, gewinnt die API einen neuen Wert, alte Frontends fallen aufs Rendern des Raw-Slug zurueck statt zu crashen.

**Detail server-side kuerzen.** 5MB-Exception-Payload ist DoS-Vektor und fuer den Nutzer nutzlos. 500 Zeichen reichen fuer Exception-Klasse + ersten Satz von `str(exc)`.

**Wann nutzen.** Jedes Iterate-and-Import-Pattern, wo Teilerfolg realistisch ist. Pattern transferiert auch auf Nicht-Import-Iterationen — Bulk-Export, Bulk-Validation, Batch-Translation.

**Anti-Pattern.** Teil-Failures hinter einem `result.success: bool`-Flag verstecken. Der Nutzer hat keinen Weg zurueck zum Verlorenen.

---

## Referenz: PGS-02..05 Commit-Walkthrough

Jede Phase landete in 1-3 atomaren Commits. In Reihenfolge neben dieser Anleitung lesen:

| Phase | Zustaendigkeit | Commits |
|-------|----------------|---------|
| PGS-02 | Commit-to-Repo + Push (Overwrite-MVP) | `aa25d74` (Backend) + `782490e` (Frontend) |
| PGS-02-FU-01 | Per-Buch-PAT shared across Subsysteme | `32137bb` |
| PGS-03 | Three-Way-Diff + Per-Kapitel-Aufloesung | `c87b7dd` (Backend) + `1338d87` (Frontend) |
| PGS-03-FU-01 | mark_conflict + Rename-Detection | `819e571` + `5bfd76a` + `e58d9e1` |
| PGS-04 | Translation-Group Multi-Branch-Import | `4aa7153` + `9c8eee5` |
| PGS-04-FU-01 | Skipped-Branch-Surface + reusable Panel | `06c7c1b` + `75046b9` |
| PGS-05 | Unified-Commit-Fan-Out + Per-Buch-Lock | `6af6f5c` + `b0133ec` |
