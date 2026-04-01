# Coding Standards

## Allgemein

- Entwickler: Asterios Raptis (Ein-Mann-Show, KI-gestuetzt).
- Ziel: Pragmatisch, wartbar, schnell lieferbar. Kein Over-Engineering.
- Wenn unklar: Nachfragen statt raten.

## Python (Backend + Plugins)

- Python 3.11+, Poetry fuer Dependency Management.
- Type Hints IMMER. Kein `Any` ohne Kommentar.
- Docstrings fuer oeffentliche Funktionen (Google-Style).
- pytest fuer Tests. Fixtures bevorzugen, kein setUp/tearDown.
- Async bevorzugen wo FastAPI es unterstuetzt.
- Import-Reihenfolge: stdlib, third-party, local (isort-kompatibel).
- Pydantic v2 fuer Schemas. Field-Validatoren statt manuelle Checks.

## TypeScript (Frontend)

- Strict Mode aktiv. Kein `any` ohne Kommentar.
- Interfaces fuer Datenmodelle, Types fuer Unions/Aliases.
- Funktionale Komponenten mit Hooks. Keine Klassen-Komponenten.
- Props als Interface definiert.
- Komplexe Logik in Utility-Funktionen oder den API Client auslagern, nicht in Komponenten.
- Radix UI fuer Dialoge, Dropdowns, Tooltips, Tabs, Select. Kein eigenes DOM-Handling dafuer.
- @dnd-kit fuer Drag-and-Drop. Kein manuelles DnD.
- Lucide React fuer Icons. Keine anderen Icon-Libraries.
- react-toastify fuer User-Feedback. Kein window.alert(), kein console.log fuer User-Info.

## Benennung

- Python: snake_case (Dateien, Funktionen, Variablen), PascalCase (Klassen).
- TypeScript: PascalCase (Komponenten, Interfaces), camelCase (Funktionen, Variablen).
- Plugin-Ordner: bibliogon-plugin-{name} (kebab-case).
- Python-Package im Plugin: bibliogon_{name} (snake_case).
- Events/Hooks: snake_case (chapter_pre_save, export_execute).
- Kein I-Prefix fuer Interfaces. `Book` statt `IBook`.
- Dateiformate: .bgb (Backup), .bgp (Projekt). Nicht .zip.

## Formatierung

- Kein Em-Dash (-- oder Unicode U+2014). Bindestriche (-) oder Kommas nutzen.
- Nur Standard-UTF-8-Zeichen.
- Keine Emojis im Code oder in Kommentaren.
- Einrueckung: 4 Spaces (Python), 2 Spaces (TypeScript/CSS).

## Git

- Conventional Commits: feat:, fix:, refactor:, docs:, test:, chore:
- Scope angeben wenn klar: feat(export): ..., fix(editor): ...
- Ein Commit pro logische Aenderung, nicht alles in einen.
- Branch-Benennung: feature/{name}, fix/{name}, chore/{name}

## Tests

- Backend: pytest. Plugin-Tests in plugins/{name}/tests/.
- E2E: Playwright (aktuell 52 Tests).
- Neue Endpunkte: Mindestens ein Happy-Path Test.
- Bugfixes: Failing Test ZUERST, dann Fix.
- Mocking: Externe Services (LanguageTool, Pandoc) mocken, keine echten Calls in Tests.
- `make test` muss gruen bleiben nach jeder Aenderung.

## Sicherheit

- BIBLIOGON_SECRET_KEY niemals committen.
- .env Dateien in .gitignore.
- Lizenz-Keys nur ueber LicenseStore (backend/app/licensing.py).
- User-Uploads validieren (Dateityp, Groesse) bevor Speicherung.
- Plugin-ZIP-Installation: Name-Validierung + Path Traversal Check.

## Performance

- SQLite ist single-writer. Writes minimieren, Batch wo moeglich.
- TipTap-JSON kann gross werden. Autosave mit Debounce (nicht bei jedem Keystroke).
- Plugin-Loading beim App-Start. Lazy-Loading fuer Plugin-UI wo moeglich.

## Abhaengigkeiten

Neue Dependencies nur nach Rueckfrage einfuehren. Bestehender Stack:

Backend: FastAPI, SQLAlchemy, Pydantic v2, pluginforge, manuscripta, PyYAML
Frontend: React 18, TypeScript, TipTap, Vite, Radix UI, @dnd-kit, Lucide, react-toastify
Tooling: Poetry, npm, Docker, Make, Playwright
