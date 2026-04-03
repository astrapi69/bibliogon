# Code-Hygiene

Automatisierte Durchsetzung von Codequalitaet. Diese Regeln sorgen dafuer, dass der Code bei jedem Commit konsistent aussieht, egal ob von Mensch oder KI geschrieben.

## Formatierung und Linting (automatisch)

### Python (Backend + Plugins)

```toml
# backend/pyproject.toml

[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
select = [
    "E",    # pycodestyle errors
    "W",    # pycodestyle warnings
    "F",    # pyflakes
    "I",    # isort
    "N",    # pep8-naming
    "UP",   # pyupgrade
    "B",    # flake8-bugbear
    "SIM",  # flake8-simplify
    "TCH",  # flake8-type-checking
]
ignore = [
    "E501",  # line-length (wird von formatter gehandelt)
]

[tool.ruff.lint.isort]
known-first-party = ["app"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
```

**Befehle:**
```bash
cd backend && poetry run ruff check .         # Linting
cd backend && poetry run ruff check --fix .   # Auto-Fix
cd backend && poetry run ruff format .        # Formatierung
```

### TypeScript (Frontend)

```json
// frontend/.eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["error", { "allow": ["warn", "error"] }],
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

```json
// frontend/.prettierrc
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Befehle:**
```bash
cd frontend && npx eslint src/ --fix    # Linting + Auto-Fix
cd frontend && npx prettier --write src/ # Formatierung
```

### Setup (einmalig)

```bash
# Backend
cd backend && poetry add --group dev ruff

# Frontend
cd frontend && npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react-hooks prettier
```

---

## Pre-Commit Hooks

Automatische Pruefung vor jedem Commit. Verhindert, dass unformatierter oder fehlerhafter Code ueberhaupt ins Repo kommt.

```yaml
# .pre-commit-config.yaml (im Projekt-Root)
repos:
  - repo: local
    hooks:
      - id: ruff-check
        name: ruff lint
        entry: bash -c 'cd backend && poetry run ruff check .'
        language: system
        pass_filenames: false
        files: ^backend/

      - id: ruff-format
        name: ruff format check
        entry: bash -c 'cd backend && poetry run ruff format --check .'
        language: system
        pass_filenames: false
        files: ^backend/

      - id: eslint
        name: eslint
        entry: bash -c 'cd frontend && npx eslint src/ --max-warnings=0'
        language: system
        pass_filenames: false
        files: ^frontend/src/

      - id: prettier
        name: prettier check
        entry: bash -c 'cd frontend && npx prettier --check src/'
        language: system
        pass_filenames: false
        files: ^frontend/src/

      - id: pytest-quick
        name: pytest (backend only)
        entry: bash -c 'cd backend && poetry run pytest tests/ -x -q'
        language: system
        pass_filenames: false
        files: ^backend/
```

**Setup:**
```bash
pip install pre-commit
pre-commit install
```

**Danach passiert bei jedem `git commit` automatisch:**
1. Python-Code wird auf Linting-Fehler geprueft (ruff)
2. Python-Formatierung wird gecheckt (ruff format)
3. TypeScript wird auf Fehler geprueft (ESLint)
4. TypeScript-Formatierung wird gecheckt (Prettier)
5. Backend-Tests laufen (schneller Smoke-Test)

Falls etwas fehlschlaegt: Commit wird abgelehnt, Fehler werden angezeigt.

---

## Error-Handling Patterns

Konsistentes Error-Handling macht Code lesbar und debuggbar, fuer Menschen und KI gleichermassen.

### Backend (FastAPI)

```python
# RICHTIG: HTTPException mit klarem Status und Detail
from fastapi import HTTPException

async def get_book(book_id: str):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    return book

# RICHTIG: Validierung via Pydantic, nicht manuell
class BookCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    author: str = Field(..., min_length=1)
    language: str = Field(default="de", pattern="^[a-z]{2}$")

# FALSCH: Generische Exception fangen und verschlucken
try:
    result = do_something()
except Exception:
    pass  # NIEMALS
```

**Regeln:**
- HTTP 400: Ungueltige Eingabe (Pydantic validiert automatisch -> 422).
- HTTP 404: Ressource nicht gefunden.
- HTTP 409: Konflikt (z.B. doppelter Name).
- HTTP 500: Nur fuer unerwartete Fehler. Niemals absichtlich werfen.
- Keine nackten `except Exception`. Spezifische Exceptions fangen.
- Service-Funktionen werfen ValueError/KeyError, Router fangen und mappen zu HTTPException.

### Frontend (React)

```typescript
// RICHTIG: API-Fehler zentral im Client behandeln
// api/client.ts
async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new ApiError(response.status, error.detail)
  }
  return response.json()
}

// RICHTIG: In Komponenten mit Toast-Feedback
try {
  await createBook(data)
  toast.success(t('book_created'))
} catch (error) {
  if (error instanceof ApiError) {
    toast.error(error.detail)
  } else {
    toast.error(t('unexpected_error'))
  }
}

// FALSCH: Fehler ignorieren
await createBook(data)  // Kein catch, User sieht nichts bei Fehler
```

**Regeln:**
- API-Fehler immer dem User zeigen (Toast).
- Kein `console.log` fuer Fehlermeldungen. Toast oder Logger-Service.
- ApiError-Klasse mit status und detail (im api/client.ts definieren).
- Loading-States setzen waehrend API-Calls (kein "totes" UI).

---

## API-Konventionen

Einheitliches REST-Design, damit Mensch und KI sofort verstehen wie Endpunkte funktionieren.

### URL-Schema

```
GET    /api/books                    # Liste
GET    /api/books/{id}               # Einzeln
POST   /api/books                    # Erstellen
PUT    /api/books/{id}               # Komplett aktualisieren
PATCH  /api/books/{id}               # Teilweise aktualisieren
DELETE /api/books/{id}               # Loeschen

GET    /api/books/{id}/chapters      # Unterressource Liste
POST   /api/books/{id}/chapters      # Unterressource erstellen
```

### Response-Format

```json
// Erfolg (einzeln)
{ "id": "abc", "title": "Mein Buch", "author": "Asterios" }

// Erfolg (Liste)
[{ "id": "abc", "title": "Mein Buch" }, ...]

// Fehler (automatisch von FastAPI/Pydantic)
{ "detail": "Book abc not found" }

// Validierungsfehler (automatisch von Pydantic)
{ "detail": [{ "loc": ["body", "title"], "msg": "field required", "type": "value_error.missing" }] }
```

**Regeln:**
- Keine Envelope (kein `{ "data": ..., "status": "ok" }`). HTTP-Status reicht.
- IDs sind UUIDs als Strings.
- Timestamps als ISO 8601 (UTC).
- Listen werden NICHT paginiert (Phase 1-10). Paginierung erst wenn noetig (Phase 11 SaaS).
- Plugin-Endpunkte unter /api/{plugin-name}/... (z.B. /api/grammar/check).

---

## Logging

### Backend

```python
import logging

logger = logging.getLogger(__name__)

# RICHTIG: Strukturiert, mit Kontext
logger.info("Book exported", extra={"book_id": book.id, "format": fmt})
logger.warning("Plugin load failed", extra={"plugin": name, "error": str(e)})
logger.error("Export failed", extra={"book_id": book.id}, exc_info=True)

# FALSCH:
print("export done")           # Kein print
logger.info(f"Exported {book}")  # Keine Objekte in Messages, extra nutzen
```

**Log-Levels:**
- DEBUG: Detaillierte Entwicklerinfo (nur in BIBLIOGON_DEBUG=true).
- INFO: Wichtige Aktionen (Export gestartet, Plugin geladen, Backup erstellt).
- WARNING: Unerwartetes Verhalten das nicht kritisch ist (Plugin nicht gefunden, Fallback genutzt).
- ERROR: Fehler die den User betreffen (Export fehlgeschlagen, DB-Fehler).

### Frontend

- Kein console.log im Production-Code.
- console.warn und console.error nur fuer echte Entwickler-Warnungen.
- User-Feedback ausschliesslich ueber Toast-Notifications (react-toastify).

---

## Inline-Dokumentation

### Wann Kommentare schreiben

```python
# RICHTIG: Warum, nicht Was
# TipTap nutzt 4-Space-Indent, write-book-template nutzt 2-Space.
# Verdopple die Einrueckung vor der Konvertierung.
content = re.sub(r'^( +)', lambda m: m.group(1) * 2, content, flags=re.MULTILINE)

# FALSCH: Offensichtliches kommentieren
# Erstelle ein neues Buch
book = Book(title=title, author=author)
```

**Regeln:**
- Kommentare erklaeren WARUM, nicht WAS.
- Docstrings fuer alle oeffentlichen Python-Funktionen (Google-Style).
- TypeScript: JSDoc nur fuer exportierte Funktionen mit nicht-offensichtlichen Parametern.
- TODOs nur mit Kontext: `# TODO(phase-8): Audiobook-Plugin braucht ffmpeg-Check`
- Keine auskommentierten Code-Bloecke. Git ist die Versionierung.

### Docstring-Format (Python)

```python
def export_book(book_id: str, fmt: str, options: ExportOptions) -> Path:
    """Exportiert ein Buch im angegebenen Format.

    Konvertiert TipTap-JSON zu Markdown, scaffolded die write-book-template
    Struktur und ruft manuscripta fuer die finale Konvertierung auf.

    Args:
        book_id: UUID des Buchs.
        fmt: Zielformat (epub, pdf, project).
        options: Export-Optionen (toc_depth, use_manual_toc, book_type).

    Returns:
        Pfad zur exportierten Datei.

    Raises:
        HTTPException: 404 wenn Buch nicht gefunden.
        ExportError: Wenn Pandoc/manuscripta fehlschlaegt.
    """
```

---

## Zusammenfassung: Was bei jedem Commit automatisch passiert

```
git commit
  -> pre-commit hooks laufen:
     1. ruff check (Python Linting)
     2. ruff format --check (Python Formatierung)
     3. eslint (TypeScript Linting)
     4. prettier --check (TypeScript Formatierung)
     5. pytest -x -q (Backend Smoke-Test)
  -> Alles gruen? Commit geht durch.
  -> Etwas rot? Commit abgelehnt, Fehler angezeigt.
```

Kein Code schafft es ins Repo der nicht formatiert, gelintet und getestet ist.
