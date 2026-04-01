# Architektur-Regeln

## Zwei-Schichten-Architektur (IMMER einhalten)

1. PluginForge (externes PyPI-Paket) - anwendungsunabhaengig
2. Bibliogon App - schlanker Kern + alles via Plugins

Neue Features gehoeren IMMER in ein Plugin, es sei denn sie betreffen den Kern (Book/Chapter CRUD, Editor-Grundfunktion, Backup/Restore).

## Backend (Python/FastAPI)

### Struktur pro Plugin

```
plugins/bibliogon-plugin-{name}/
  bibliogon_{name}/
    plugin.py          # {Name}Plugin(BasePlugin), Hook-Implementierungen
    routes.py          # FastAPI Router
    {modul}.py         # Geschaeftslogik (kein FastAPI-Code hier)
  tests/
    test_{name}.py     # pytest Tests
  pyproject.toml       # Plugin-Metadaten, pluginforge Abhaengigkeit
```

### Regeln

- Plugin-Klasse erbt von BasePlugin (pluginforge).
- Geschaeftslogik in eigenen Modulen, NICHT in routes.py.
- routes.py enthaelt nur FastAPI-Endpunkte die an Service-Funktionen delegieren.
- Hook-Specs stehen in backend/app/hookspecs.py. Neue Hooks dort definieren.
- Pydantic v2 fuer alle Request/Response Schemas.
- SQLAlchemy Models in backend/app/models/.
- Konfiguration via YAML (backend/config/plugins/{name}.yaml), NICHT hardcoded.
- i18n-Strings in backend/config/i18n/{lang}.yaml ergaenzen.

## Frontend (React/TypeScript)

### Komponentenstruktur

- Pages in frontend/src/pages/ - eine Datei pro Route.
- Shared Components in frontend/src/components/.
- Plugin-spezifische UI gehoert zum Plugin (spaeter: Plugin-UI-Slots).
- TipTap ist der Editor. Erweiterungen als TipTap Extensions, nicht als eigene Logik.

### State Management

- Aktuell: React State + Props. Kein Redux, kein Zustand.
- Wenn globaler State noetig wird: Zustand einfuehren, NICHT Redux.
- Jede groessere Komponente bekommt eigenen Zustand-Store (Feature-Store-Pattern).
- Stores kommunizieren ueber Events oder Callbacks, nicht durch direkte Imports.

### API Client

- Alle Backend-Aufrufe ueber frontend/src/api/client.ts.
- Neue Endpunkte dort ergaenzen, NICHT fetch() direkt in Komponenten.
- TypeScript Types fuer API Responses im client.ts definieren.

## Persistenz

- Backend: SQLAlchemy + SQLite (Phase 11 wechselt zu PostgreSQL).
- Frontend: Kein lokaler Storage fuer Buchdaten. Alles via API.
- Dateien: Asset-Uploads ueber /api/assets/ Endpunkt.

## Datenfluss

```
UI (React) -> API Client -> FastAPI Router -> Service/Plugin -> SQLAlchemy -> SQLite
```

Unidirektional. Keine direkte DB-Zugriffe aus Routern. Kein Frontend-Code im Backend.
