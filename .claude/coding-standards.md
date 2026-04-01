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

## TypeScript (Frontend)

- Strict Mode aktiv. Kein `any` ohne Kommentar.
- Interfaces fuer Datenmodelle, Types fuer Unions/Aliases.
- Funktionale Komponenten mit Hooks. Keine Klassen-Komponenten.
- Props als Interface definiert.
- Komplexe Logik in Utility-Funktionen oder den API Client auslagern, nicht in Komponenten.

## Benennung

- Python: snake_case (Dateien, Funktionen, Variablen), PascalCase (Klassen).
- TypeScript: PascalCase (Komponenten, Interfaces), camelCase (Funktionen, Variablen).
- Plugin-Ordner: bibliogon-plugin-{name} (kebab-case).
- Python-Package im Plugin: bibliogon_{name} (snake_case).
- Events/Hooks: snake_case (chapter_pre_save, export_execute).
- Kein I-Prefix fuer Interfaces. `Book` statt `IBook`.

## Formatierung

- Kein Em-Dash (-- oder Unicode). Bindestriche (-) oder Kommas nutzen.
- Nur Standard-UTF-8-Zeichen.
- Keine Emojis im Code oder in Kommentaren.
- Einrueckung: 4 Spaces (Python), 2 Spaces (TypeScript/CSS).

## Git

- Conventional Commits: feat:, fix:, refactor:, docs:, test:, chore:
- Scope angeben wenn klar: feat(export): ..., fix(editor): ...
- Ein Commit pro logische Aenderung, nicht alles in einen.
- Branch-Benennung: feature/{name}, fix/{name}, chore/{name}

## Tests

- Jedes Plugin MUSS Tests haben.
- Backend: pytest, Plugin-Tests in plugins/{name}/tests/.
- Frontend: Playwright fuer E2E (existieren bereits, 52 Tests).
- Neue Endpunkte: Mindestens ein Happy-Path Test.
- Bugfixes: Failing Test ZUERST, dann Fix.
- Mocking: Externe Services (LanguageTool, Pandoc) mocken, keine echten Calls in Tests.

## Sicherheit

- BIBLIOGON_SECRET_KEY niemals committen.
- .env Dateien in .gitignore.
- Lizenz-Keys nur ueber LicenseStore (backend/app/licensing.py).
- User-Uploads validieren (Dateityp, Groesse) bevor Speicherung.

## Performance

- SQLite ist single-writer. Writes minimieren, Batch wo moeglich.
- TipTap-JSON kann gross werden. Autosave mit Debounce (nicht bei jedem Keystroke).
- Plugin-Loading beim Start. Lazy-Loading fuer Plugin-UI wo moeglich.
