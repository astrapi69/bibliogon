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

## Error-Handling Architektur

### Prinzip: Fehler an der richtigen Schicht behandeln

```
Frontend       Zeigt dem User was schiefging (Toast). Faengt ApiError.
    |
API Client     Wandelt HTTP-Fehler in ApiError um. Einziger Ort fuer fetch().
    |
Router         Faengt nichts. Globaler Exception Handler mappt automatisch.
    |
Service        Wirft fachliche Exceptions (ExportError, ValidationError). Keine HTTP-Konzepte.
    |
Plugin         Wirft PluginError. Wird vom Exception Handler gefangen.
    |
Extern         Pandoc, LanguageTool, edge-TTS. Wird im Service gewrappt.
```

Jede Schicht faengt nur das, was sie selbst behandeln kann. Alles andere wird nach oben durchgereicht.

### Backend: Exception-Hierarchie

```python
# backend/app/exceptions.py

class BibliogonError(Exception):
    """Basis fuer alle Bibliogon-Fehler."""
    def __init__(self, message: str, detail: str | None = None):
        self.message = message
        self.detail = detail or message
        super().__init__(self.message)

class NotFoundError(BibliogonError):
    """Ressource nicht gefunden (-> HTTP 404)."""
    pass

class ValidationError(BibliogonError):
    """Fachliche Validierung fehlgeschlagen (-> HTTP 400)."""
    pass

class ConflictError(BibliogonError):
    """Ressource existiert bereits (-> HTTP 409)."""
    pass

class ExportError(BibliogonError):
    """Export fehlgeschlagen: Pandoc, Scaffolding, Konvertierung (-> HTTP 500)."""
    pass

class PluginError(BibliogonError):
    """Plugin konnte nicht laden, aktivieren oder ausfuehren (-> HTTP 500)."""
    def __init__(self, plugin_name: str, message: str):
        self.plugin_name = plugin_name
        super().__init__(f"Plugin '{plugin_name}': {message}")

class ExternalServiceError(BibliogonError):
    """Externer Service nicht erreichbar (-> HTTP 502)."""
    def __init__(self, service: str, message: str):
        self.service = service
        super().__init__(f"{service}: {message}")
```

### Backend: Globaler Exception Handler

```python
# backend/app/main.py - einmal registrieren

ERROR_STATUS_MAP = {
    NotFoundError: 404,
    ValidationError: 400,
    ConflictError: 409,
    ExportError: 500,
    PluginError: 500,
    ExternalServiceError: 502,
}

@app.exception_handler(BibliogonError)
async def bibliogon_error_handler(request, exc: BibliogonError):
    status = ERROR_STATUS_MAP.get(type(exc), 500)
    logger.error(exc.message, exc_info=exc if status >= 500 else None)
    content = {"detail": exc.detail}
    if settings.debug and status >= 500:
        import traceback
        content["traceback"] = traceback.format_exception(exc)
    return JSONResponse(status_code=status, content=content)
```

### Backend: Wer wirft was

**Services** werfen fachliche Exceptions, KEINE HTTPException:

```python
# RICHTIG
def get_book(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise NotFoundError(f"Book {book_id} not found")
    return book

def export_book(book_id: str, fmt: str, ...) -> Path:
    if fmt not in SUPPORTED_FORMATS:
        raise ValidationError(f"Unsupported format: {fmt}")
    try:
        return run_pandoc(project_dir, fmt, config)
    except subprocess.CalledProcessError as e:
        raise ExportError(f"Pandoc failed: {e.stderr}")

# FALSCH: HTTPException in Service
def get_book(book_id: str, db: Session) -> Book:
    ...
    raise HTTPException(status_code=404, ...)  # NICHT in Services
```

**Router** sind duenn, der Exception Handler uebernimmt:

```python
# RICHTIG
@router.get("/{book_id}")
def get_book_endpoint(book_id: str, db: Session = Depends(get_db)):
    return book_service.get_book(book_id, db)
    # NotFoundError -> Exception Handler -> 404 automatisch
```

**Plugins** werfen PluginError:

```python
class AudiobookPlugin(BasePlugin):
    def generate(self, book_data, chapters):
        try:
            result = edge_tts.synthesize(...)
        except ConnectionError as e:
            raise ExternalServiceError("edge-TTS", str(e))
        if not result.files:
            raise PluginError(self.name, "No audio generated")
```

**Externe Tools** werden gewrappt:

```python
def check_grammar(text: str, lang: str) -> list[dict]:
    try:
        response = httpx.post(LANGUAGETOOL_URL, ...)
        response.raise_for_status()
        return response.json()["matches"]
    except httpx.ConnectError:
        raise ExternalServiceError("LanguageTool", "Service not reachable")
    except httpx.HTTPStatusError as e:
        raise ExternalServiceError("LanguageTool", f"HTTP {e.response.status_code}")
```

### Backend: Regeln

- Services werfen BibliogonError-Subklassen, KEINE HTTPException.
- Router fangen NICHTS. Der globale Exception Handler uebernimmt.
- Keine nackten `except Exception`. Spezifische Exceptions fangen.
- Externe Fehler immer wrappen in ExternalServiceError.
- Plugin-Fehler immer als PluginError mit plugin_name.
- HTTP 422 kommt automatisch von Pydantic.
- Logging: 4xx als WARNING, 5xx als ERROR mit Traceback.

### Frontend: ApiError-Klasse

```typescript
// api/errors.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public traceback?: string[],  // Nur im Debug-Mode vom Backend geliefert
  ) {
    super(detail)
    this.name = 'ApiError'
  }

  get isNotFound(): boolean { return this.status === 404 }
  get isValidation(): boolean { return this.status === 400 || this.status === 422 }
  get isServerError(): boolean { return this.status >= 500 }

  /** Generiert GitHub Issue URL mit allen Fehlerdetails. */
  toGitHubIssueUrl(repo: string, appVersion: string): string {
    const title = encodeURIComponent(`[Bug] ${this.detail}`)
    const body = encodeURIComponent([
      `**Error:** ${this.detail}`,
      `**Status:** ${this.status}`,
      `**Version:** ${appVersion}`,
      `**Browser:** ${navigator.userAgent}`,
      this.traceback ? `\n**Stacktrace:**\n\`\`\`\n${this.traceback.join('')}\`\`\`` : '',
    ].filter(Boolean).join('\n'))
    return `https://github.com/${repo}/issues/new?title=${title}&body=${body}`
  }
}
```

### Frontend: Zentraler API Client

```typescript
// api/client.ts
async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new ApiError(response.status, body.detail, body.traceback)
  }
  return response.json()
}
```

### Frontend: Fehler in Komponenten

```typescript
// RICHTIG: Spezifisch + i18n + Loading + Issue-Button bei 5xx
async function handleExport() {
  setLoading(true)
  try {
    await exportBook(bookId, format)
    toast.success(t('export_success'))
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isNotFound) {
        toast.error(t('book_not_found'))
      } else if (error.isServerError) {
        // Toast mit "Issue melden" Link fuer GitHub
        const issueUrl = error.toGitHubIssueUrl('astrapi69/bibliogon', APP_VERSION)
        toast.error(`${error.detail} | ${t('report_issue')}: ${issueUrl}`)
      } else {
        toast.error(error.detail)
      }
    } else {
      toast.error(t('unexpected_error'))
    }
  } finally {
    setLoading(false)
  }
}

// FALSCH: Fehler ignorieren
await exportBook(bookId, format)  // Kein catch

// FALSCH: Generisch ohne Kontext
catch (error) {
  toast.error('Something went wrong')  // Nicht hilfreich, nicht i18n
}
```

### Frontend: Regeln

- API-Fehler IMMER dem User zeigen (Toast), nie verschlucken.
- Kein console.log fuer User-Feedback. Nur Toast (react-toastify).
- Loading-States setzen waehrend API-Calls (kein "totes" UI).
- ApiError-Klasse fuer alle API-Fehler, nicht generische Error.
- Fehlermeldungen ueber i18n, keine hardcodierten Strings.
- finally-Block fuer Loading-State Reset.
- Toast bei Server-Fehlern (5xx) mit "Issue melden" Button der GitHub Issue oeffnet.
- GitHub Issue enthaelt: Error-Detail als Titel, Stacktrace (aus Debug-Response), Browser-Info, App-Version.
- Generische Fehlermeldungen ("Export failed") sind verboten, sie machen Issues wertlos.

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
