# Architektur-Regeln

## Schichtenmodell (4 Schichten, IMMER einhalten)

```
1. Frontend        React 18 + TypeScript + TipTap + Vite
2. Backend         FastAPI + SQLAlchemy + SQLite + Pydantic v2
3. PluginForge     Externes PyPI-Paket (pluginforge ^0.5.0), basiert auf pluggy
4. Plugins         Eigenstaendige Pakete, registriert via Entry Points
```

Neue Features gehoeren IMMER in ein Plugin, es sei denn sie betreffen den Kern (Book/Chapter CRUD, Editor-Grundfunktion, Backup/Restore, UI-Shell).

## Zwei Repositories

| Repo | Zweck | Lizenz |
|------|-------|--------|
| `pluginforge` | Anwendungsunabhaengiges Plugin-Framework (PyPI) | MIT |
| `bibliogon` | Buch-Autoren-Plattform, nutzt PluginForge | MIT (Core), proprietaer (Premium) |

PluginForge ist EXTERN. Aenderungen an PluginForge sind ein separates Repo und ein separater Release-Zyklus. Bibliogon pinnt auf `pluginforge ^0.5.0`.

## Backend (Python/FastAPI)

### Struktur pro Plugin

```
plugins/bibliogon-plugin-{name}/
  bibliogon_{name}/
    plugin.py          # {Name}Plugin(BasePlugin), Hook-Implementierungen
    routes.py          # FastAPI Router (delegiert an Service-Funktionen)
    {modul}.py         # Geschaeftslogik (kein FastAPI-Code hier)
  tests/
    test_{name}.py     # pytest Tests
  pyproject.toml       # Entry Point: [project.entry-points."bibliogon.plugins"]
```

### Regeln

- Plugin-Klasse erbt von BasePlugin (pluginforge).
- Geschaeftslogik in eigenen Modulen, NICHT in routes.py.
- routes.py enthaelt nur FastAPI-Endpunkte die an Service-Funktionen delegieren.
- Hook-Specs stehen in backend/app/hookspecs.py. Neue Hooks dort definieren, mit api_version.
- Pydantic v2 fuer alle Request/Response Schemas.
- SQLAlchemy Models in backend/app/models/.
- Konfiguration via YAML (backend/config/plugins/{name}.yaml), NICHT hardcoded.
- i18n-Strings in backend/config/i18n/{lang}.yaml ergaenzen (5 Sprachen: DE, EN, ES, FR, EL).
- Plugin-Abhaengigkeiten als Klassen-Attribut: `depends_on = ["export"]`.
- Proprietary Plugins brauchen Lizenzpruefung via pre_activate Callback.
- MIT Plugins (export, help, getstarted) sind frei, keine Lizenzpruefung.

### Plugin-Installation (ZIP)

Drittanbieter-Plugins werden als ZIP ueber Settings > Plugins installiert:
1. ZIP muss enthalten: plugin.yaml, Python-Paket mit plugin.py
2. Extraktion nach plugins/installed/{name}/
3. Config nach config/plugins/{name}.yaml
4. Dynamische Registrierung via sys.path + PluginManager
5. Plugin-Namen: nur Kleinbuchstaben, Ziffern, Bindestriche
6. Path Traversal Pruefung auf ZIP-Pfade

### Lizenzierung

- Bibliogon-spezifisch, NICHT Teil von PluginForge.
- Code in backend/app/licensing.py.
- HMAC-SHA256 signierte Lizenzschluessel, offline validierbar.
- Lizenzen in config/licenses.json, verwaltbar ueber Settings-UI.
- Format: BIBLIOGON-{PLUGIN}-v{N}-{base64 payload}.{base64 signature}

## Frontend (React/TypeScript)

### UI-Komponentenstrategie

| Bibliothek | Zweck |
|------------|-------|
| Radix UI | Unstyled accessible Primitives (Dialog, Tabs, Dropdown, Select, Tooltip) |
| @dnd-kit | Drag-and-Drop (Kapitel-Sortierung, Listen-Reorder) |
| TipTap | WYSIWYG/Markdown-Editor (StarterKit + 15 Extensions) |
| Lucide React | Icons |
| react-toastify | Toast-Notifications |

Abgelehnt: shadcn/ui (braucht Tailwind), MUI (zu opinionated), Ant Design (zu schwer).

### Theming

- 3 Themes: Warm Literary, Cool Modern, Nord (jeweils Light + Dark = 6 Varianten).
- Alles ueber CSS Variables. Neue UI-Elemente MUESSEN CSS Variables nutzen.
- Kein Tailwind. Custom Properties in frontend/src/styles/global.css.

### Plugin-UI (Manifest-driven)

Plugins deklarieren UI-Erweiterungen via get_frontend_manifest(). Frontend fragt /api/plugins/manifests ab.

Vordefinierte UI-Slots:

| Slot | Ort |
|------|-----|
| sidebar_actions | BookEditor Sidebar |
| toolbar_buttons | Editor Toolbar |
| editor_panels | Neben dem Editor |
| settings_section | Settings > Plugins |
| export_options | ExportDialog |

Fuer komplexe Plugin-UIs: Web Components als Custom Elements (kompiliertes JS-Bundle im Plugin-ZIP).

### TipTap Editor

- 15 offizielle Extensions + 1 Community (Figure/Figcaption).
- 24 Toolbar-Buttons.
- Vor Custom-Code IMMER pruefen ob eine offizielle TipTap-Extension existiert.
- Siehe lessons-learned.md fuer bekannte TipTap-Fallstricke.

### Komponentenstruktur

- Pages in frontend/src/pages/ (Dashboard, BookEditor, Settings, Help, GetStarted).
- Shared Components in frontend/src/components/.
- API-Aufrufe NUR ueber frontend/src/api/client.ts, nie fetch() direkt in Komponenten.

### UX-Patterns fuer Formulare

- **Modal mit Stufen** fuer Erstellungs-Dialoge: Stufe 1 zeigt Pflichtfelder (2-3), Stufe 2 ist aufklappbar ("Weitere Details") fuer optionale Felder.
- **Grund:** Modals bleiben kompakt fuer Quick-Creation, optionale Felder ueberladen nicht.
- **Beispiel:** CreateBookModal - Stufe 1: Titel, Autor, Genre. Stufe 2: Untertitel, Sprache, Serie.
- **Eingabefelder mit Vorschlaegen:** `<input>` + `<datalist>` fuer Freitext mit Dropdown-Vorschlaegen (z.B. Genre). Kein hartes Select wenn eigene Werte moeglich sein sollen.
- **Bedingte Felder:** Checkbox-Toggle fuer optionale Gruppen (z.B. "Teil einer Serie" -> Reihe + Band). Werte werden beim Deaktivieren zurueckgesetzt.
- **Keine eigene Seite** fuer einfache Erstellungs-Workflows. Modal reicht bis ~8 Felder.

### State Management

- Aktuell: React State + Props. Kein globales State-Management.
- Wenn globaler State noetig wird: Zustand einfuehren, NICHT Redux.
- Stores kommunizieren ueber Events oder Callbacks, nicht durch direkte Imports.

## Internes Speicherformat

- TipTap JSON ist das Speicherformat. NICHT HTML, NICHT Markdown.
- Markdown ist nur ein Anzeige-/Eingabemodus im Editor.
- Konvertierung (JSON -> Markdown, JSON -> HTML) ist Plugin-Verantwortung (Export-Plugin).
- TipTap JSON in der DB: Chapter.content Feld.

## Persistenz

- Backend: SQLAlchemy + SQLite (Phase 11 wechselt zu PostgreSQL).
- Frontend: Kein lokaler Storage fuer Buchdaten. Alles via API.
- Assets: Lokal im Dateisystem, verwaltet ueber /api/assets/.
- Backup: .bgb Dateien (ZIP), Restore stellt kompletten Zustand wieder her.
- Projekt-Import: .bgp Dateien (write-book-template ZIP).

## Datenfluss

```
UI (React) -> API Client -> FastAPI Router -> Service/Plugin -> SQLAlchemy -> SQLite
```

Unidirektional. Keine direkte DB-Zugriffe aus Routern. Kein Frontend-Code im Backend.

## Offline/Local-first

- SQLite als Default (keine externe DB noetig).
- Assets lokal im Dateisystem.
- Frontend als statische Dateien auslieferbar.
- Lizenzvalidierung offline (signierte Keys, kein Lizenzserver).
- Ausnahme: Plugins mit externen APIs (TTS, LanguageTool) brauchen Netz.
