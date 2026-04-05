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
- HTML-Konvertierung: HTMLParser-basiert, KEIN Regex fuer verschachtelte Strukturen.

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
- Keine generischen Namen: data, info, result, temp, item, obj, val, tmp, x sind verboten.
  Stattdessen: book_data, plugin_info, export_result, chapter_item.
  Ausnahme: Loop-Variablen (i, j) und Lambdas.

## Formatierung

- Kein Em-Dash (-- oder Unicode U+2014). Bindestriche (-) oder Kommas nutzen.
- Nur Standard-UTF-8-Zeichen.
- Keine Emojis im Code oder in Kommentaren.
- Einrueckung: 4 Spaces (Python), 2 Spaces (TypeScript/CSS).
- Automatische Formatierung: ruff (Python), Prettier (TypeScript). Siehe code-hygiene.md.
- Automatisches Linting: ruff (Python), ESLint (TypeScript). Siehe code-hygiene.md.
- Pre-Commit Hooks erzwingen Formatierung und Linting vor jedem Commit.

## Git

- Conventional Commits: feat:, fix:, refactor:, docs:, test:, chore:
- Scope angeben wenn klar: feat(export): ..., fix(editor): ...
- Ein Commit pro logische Aenderung, nicht alles in einen.
- Branch-Benennung: feature/{name}, fix/{name}, chore/{name}

## Funktionsdesign und Kohaesion

### Grundregeln

- Jede Funktion hat genau eine Verantwortung.
- Max 40 Zeilen pro Funktion. Ueber 50 ist ein sofortiges Refactoring-Signal.
- Funktionen die mehrere Dinge tun (parsen UND speichern, validieren UND transformieren) in separate Funktionen zerlegen.
- Erkennungszeichen fuer niedrige Kohaesion: Kommentare wie "# Step 1", "# Step 2", "# Now do X" innerhalb einer Funktion. Jeder Step ist eine eigene Funktion.

### Abstraktionsebenen nicht mischen

- Eine Funktion operiert auf EINER Abstraktionsebene.
- FALSCH: db.query() und string-Formatierung in derselben Funktion.
- RICHTIG: High-Level-Funktion ruft Low-Level-Hilfsfunktionen auf.

### Route-Handler

- routes.py enthaelt NUR Routing-Logik: Eingabe validieren, Service aufrufen, Response zurueckgeben.
- Geschaeftslogik gehoert in Service-Module oder Hilfsfunktionen, NICHT in Route-Handler.
- Verschiedene Code-Pfade (if/elif-Kaskaden fuer Formate, Typen, etc.) in eigene Funktionen extrahieren.

### Daten zwischen Funktionen

- Gemeinsam genutzte Daten: Dataclass oder TypedDict, NICHT lose Dicts durchreichen.
- Jede extrahierte Funktion muss einzeln testbar sein, ohne den gesamten Kontext aufzubauen.

### Crash Early

- Ungueltige Eingaben am Anfang der Funktion abfangen, nicht tief verschachtelt.
- Pydantic Validierung fuer API-Input.
- Guard Clauses statt tief verschachtelter if/else.

**Anti-Pattern (God Method):**
```python
# FALSCH: 150+ Zeilen, 8 Verantwortlichkeiten
@router.get("/{fmt}")
def export(book_id, fmt, ...):
    # DB laden, Config laden, TOC erkennen, scaffolden,
    # Dateinamen bauen, ZIP/Audiobook/Pandoc, Cover suchen, ...
```

**Richtig (Zerlegt):**
```python
# routes.py - NUR Routing
@router.get("/{fmt}")
def export(book_id, fmt, ...):
    validate_format(fmt)
    context = build_export_context(book_id, fmt, book_type, ...)
    return EXPORTERS[fmt](context)

# exporters.py - Eine Funktion pro Format-Gruppe
def export_project(ctx: ExportContext) -> FileResponse: ...
def export_audiobook(ctx: ExportContext) -> FileResponse: ...
def export_document(ctx: ExportContext) -> FileResponse: ...

# helpers.py - Einzeln testbar
def validate_format(fmt: str) -> None: ...
def detect_manual_toc(chapters: list[dict]) -> bool: ...
def build_filename(slug: str, book_type: str, suffix: bool) -> str: ...
def find_cover_image(project_dir: Path) -> str | None: ...
```

## DRY - Don't Repeat Yourself

- Gleiche Logik an zwei Stellen: In eine gemeinsame Funktion extrahieren.
- Gleiche Konstanten an zwei Stellen: In eine zentrale Datei.
- Drei Duplicates: Sofort refactoren, nicht spaeter.

## Boy Scout Rule

- Code den du anfasst hinterlaesst du sauberer als du ihn vorgefunden hast. Kleine Verbesserungen bei jeder Aenderung.
- Gilt auch fuer Claude Code: Wenn du eine Funktion aenderst und sie gegen Regeln verstoesst, repariere den Verstoss mit.

## Error Reporting

Fehlerdetails muessen so praezise sein, dass ein GitHub Issue daraus direkt actionable ist, ohne Rueckfragen.

Kette: BibliogonError -> API Response (detail + traceback) -> ApiError -> Toast mit "Issue melden" -> GitHub Issue

- Kein except ohne logger.error(). Keine Exception verschlucken.
- Exception-Detail muss den Fehlergrund enthalten, nicht nur den Funktionsnamen.
- Services: str(e) in BibliogonError-Subklassen aufnehmen (NICHT HTTPException, siehe code-hygiene.md).
- Im Debug-Mode: Stacktrace in der Response mitliefern (globaler Exception Handler in main.py). Wird vom "Issue melden" Button als Issue-Body verwendet.
- Im Frontend: ApiError-Objekt an toast.error() durchreichen, nicht nur String.
- "Issue melden" Button im Toast: Oeffnet GitHub Issue mit Titel (Error-Detail), Body (Stacktrace, Browser, App-Version).
- Generische Fehlermeldungen wie "Export failed" oder "Import failed" ohne Details sind VERBOTEN. Sie machen GitHub Issues wertlos.
- Alle fetch-Aufrufe im Frontend muessen bei Fehler ApiError werfen, nicht Error.

## Tests

- Backend: pytest. Plugin-Tests in plugins/{name}/tests/.
- Frontend: Vitest (happy-dom).
- E2E: Playwright.
- Mutation Testing: mutmut (Python).
- Neue Endpunkte: Mindestens ein Happy-Path Test.
- Bugfixes: Failing Test ZUERST, dann Fix.
- Mocking: Externe Services (LanguageTool, Pandoc) mocken, keine echten Calls in Tests.
- `make test` muss gruen bleiben nach jeder Aenderung.
- Ueberlebende Mutanten in kritischem Code: Tests ergaenzen. In trivialem Code: Ignorieren.
- Siehe quality-checks.md fuer vollstaendige Teststrategie und mutmut-Konfiguration.

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

Backend: FastAPI, SQLAlchemy, Pydantic v2, pluginforge, manuscripta, PyYAML, markdown (MD->HTML)
Frontend: React 18, TypeScript, TipTap (15+1 Extensions), Vite, Radix UI, @dnd-kit, Lucide, react-toastify
Testing: pytest, Playwright, Vitest, mutmut (Python Mutation Testing)
Linting/Formatierung: ruff (Python), ESLint + Prettier (TypeScript), pre-commit
Tooling: Poetry, npm, Docker, Make