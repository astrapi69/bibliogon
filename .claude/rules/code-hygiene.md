# Code hygiene

Automated enforcement of code quality. These rules make every commit look consistent, whether written by a human or an AI.

## Formatting and linting (automatic)

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
    "E501",  # line-length (handled by the formatter)
]

[tool.ruff.lint.isort]
known-first-party = ["app"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
```

**Commands:**
```bash
cd backend && poetry run ruff check .         # lint
cd backend && poetry run ruff check --fix .   # auto-fix
cd backend && poetry run ruff format .        # format
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

**Commands:**
```bash
cd frontend && npx eslint src/ --fix    # lint + auto-fix
cd frontend && npx prettier --write src/ # format
```

### Setup (one-time)

```bash
# Backend
cd backend && poetry add --group dev ruff

# Frontend
cd frontend && npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react-hooks prettier
```

---

## Pre-commit hooks

Automatic checks before every commit. Prevents unformatted or broken code from reaching the repo in the first place.

```yaml
# .pre-commit-config.yaml (in the project root)
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

**After that, on every `git commit` the following happens automatically:**
1. Python code is checked for lint errors (ruff)
2. Python formatting is checked (ruff format)
3. TypeScript is checked for errors (ESLint)
4. TypeScript formatting is checked (Prettier)
5. Backend tests run (quick smoke test)

If anything fails: the commit is rejected and the errors are shown.

---

## Error handling architecture

### Principle: handle errors at the right layer

```
Frontend       Shows the user what went wrong (toast). Catches ApiError.
    |
API client     Converts HTTP errors into ApiError. Only place for fetch().
    |
Router         Catches nothing. Global exception handler maps automatically.
    |
Service        Throws domain exceptions (ExportError, ValidationError). No HTTP concepts.
    |
Plugin         Throws PluginError. Caught by the exception handler.
    |
External       Pandoc, LanguageTool, edge-TTS. Wrapped inside the service.
```

Every layer catches only what it can handle itself. Everything else is passed up.

### Backend: exception hierarchy

```python
# backend/app/exceptions.py

class BibliogonError(Exception):
    """Base class for all Bibliogon errors."""
    def __init__(self, message: str, detail: str | None = None):
        self.message = message
        self.detail = detail or message
        super().__init__(self.message)

class NotFoundError(BibliogonError):
    """Resource not found (-> HTTP 404)."""
    pass

class ValidationError(BibliogonError):
    """Domain validation failed (-> HTTP 400)."""
    pass

class ConflictError(BibliogonError):
    """Resource already exists (-> HTTP 409)."""
    pass

class ExportError(BibliogonError):
    """Export failed: Pandoc, scaffolding, conversion (-> HTTP 500)."""
    pass

class PluginError(BibliogonError):
    """Plugin could not load, activate, or run (-> HTTP 500)."""
    def __init__(self, plugin_name: str, message: str):
        self.plugin_name = plugin_name
        super().__init__(f"Plugin '{plugin_name}': {message}")

class ExternalServiceError(BibliogonError):
    """External service unreachable (-> HTTP 502)."""
    def __init__(self, service: str, message: str):
        self.service = service
        super().__init__(f"{service}: {message}")
```

### Backend: global exception handler

```python
# backend/app/main.py - register once

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

### Backend: who throws what

**Services** throw domain exceptions, NEVER HTTPException:

```python
# RIGHT
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

# WRONG: HTTPException in a service
def get_book(book_id: str, db: Session) -> Book:
    ...
    raise HTTPException(status_code=404, ...)  # NOT in services
```

**Routers** are thin, the exception handler takes over:

```python
# RIGHT
@router.get("/{book_id}")
def get_book_endpoint(book_id: str, db: Session = Depends(get_db)):
    return book_service.get_book(book_id, db)
    # NotFoundError -> exception handler -> 404 automatically
```

**Plugins** throw PluginError:

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

**External tools** are wrapped:

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

### Backend: rules

- Services throw BibliogonError subclasses, NEVER HTTPException.
- Routers catch NOTHING. The global exception handler takes over.
- No bare `except Exception`. Catch specific exceptions.
- Always wrap external errors into ExternalServiceError.
- Always surface plugin errors as PluginError with plugin_name.
- HTTP 422 comes from Pydantic automatically.
- Logging: 4xx as WARNING, 5xx as ERROR with traceback.

### Frontend: ApiError class

```typescript
// api/errors.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public traceback?: string[],  // Only delivered by the backend in debug mode
  ) {
    super(detail)
    this.name = 'ApiError'
  }

  get isNotFound(): boolean { return this.status === 404 }
  get isValidation(): boolean { return this.status === 400 || this.status === 422 }
  get isServerError(): boolean { return this.status >= 500 }

  /** Builds a GitHub Issue URL with all error details. */
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

### Frontend: central API client

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

### Frontend: errors in components

```typescript
// RIGHT: specific + i18n + loading + issue button on 5xx
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
        // Toast with a "Report issue" link for GitHub
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

// WRONG: ignore the error
await exportBook(bookId, format)  // no catch

// WRONG: generic, no context
catch (error) {
  toast.error('Something went wrong')  // not helpful, not i18n
}
```

### Frontend: rules

- ALWAYS show API errors to the user (toast), never swallow them.
- No console.log for user feedback. Only toasts (react-toastify).
- Set loading states during API calls (no "dead" UI).
- ApiError class for all API errors, not generic Error.
- Error messages via i18n, no hardcoded strings.
- finally block for the loading-state reset.
- Toast on server errors (5xx) with a "Report issue" button that opens a GitHub Issue.
- The GitHub Issue contains: error detail as title, stacktrace (from the debug response), browser info, app version.
- Generic error messages ("Export failed") are forbidden, they make issues worthless.

---

## API conventions

Uniform REST design so humans and AI immediately understand how endpoints behave.

### URL schema

```
GET    /api/books                    # list
GET    /api/books/{id}               # single
POST   /api/books                    # create
PUT    /api/books/{id}               # full update
PATCH  /api/books/{id}               # partial update
DELETE /api/books/{id}               # delete

GET    /api/books/{id}/chapters      # subresource list
POST   /api/books/{id}/chapters      # subresource create
```

### Response format

```json
// Success (single)
{ "id": "abc", "title": "My Book", "author": "Asterios" }

// Success (list)
[{ "id": "abc", "title": "My Book" }, ...]

// Error (automatically from FastAPI/Pydantic)
{ "detail": "Book abc not found" }

// Validation error (automatically from Pydantic)
{ "detail": [{ "loc": ["body", "title"], "msg": "field required", "type": "value_error.missing" }] }
```

**Rules:**
- No envelope (no `{ "data": ..., "status": "ok" }`). The HTTP status is enough.
- IDs are UUIDs as strings.
- Timestamps as ISO 8601 (UTC).
- Lists are NOT paginated. Pagination only when needed.
- Plugin endpoints under /api/{plugin-name}/... (e.g. /api/grammar/check).

---

## Logging

### Backend

```python
import logging

logger = logging.getLogger(__name__)

# RIGHT: structured, with context
logger.info("Book exported", extra={"book_id": book.id, "format": fmt})
logger.warning("Plugin load failed", extra={"plugin": name, "error": str(e)})
logger.error("Export failed", extra={"book_id": book.id}, exc_info=True)

# WRONG:
print("export done")           # no print
logger.info(f"Exported {book}")  # no objects inside messages, use extra
```

**Log levels:**
- DEBUG: detailed developer info (only with BIBLIOGON_DEBUG=true).
- INFO: important actions (export started, plugin loaded, backup created).
- WARNING: unexpected behavior that is not critical (plugin not found, fallback used).
- ERROR: errors that affect the user (export failed, DB error).

### Frontend

- No console.log in production code.
- console.warn and console.error only for real developer warnings.
- User feedback exclusively via toast notifications (react-toastify).

---

## Inline documentation

### When to write comments

```python
# RIGHT: the why, not the what
# TipTap uses 4-space indent, write-book-template uses 2-space.
# Double the indentation before conversion.
content = re.sub(r'^( +)', lambda m: m.group(1) * 2, content, flags=re.MULTILINE)

# WRONG: commenting the obvious
# Create a new book
book = Book(title=title, author=author)
```

**Rules:**
- Comments explain WHY, not WHAT.
- Docstrings for every public Python function (Google style).
- TypeScript: JSDoc only for exported functions with non-obvious parameters.
- TODOs only with context: `# TODO(phase-8): audiobook plugin needs ffmpeg check`
- No commented-out code blocks. Git is the versioning.

### Docstring format (Python)

```python
def export_book(book_id: str, fmt: str, options: ExportOptions) -> Path:
    """Export a book in the given format.

    Converts TipTap JSON to Markdown, scaffolds the write-book-template
    structure and calls manuscripta for the final conversion.

    Args:
        book_id: UUID of the book.
        fmt: target format (epub, pdf, project).
        options: export options (toc_depth, use_manual_toc, book_type).

    Returns:
        Path to the exported file.

    Raises:
        HTTPException: 404 when the book is not found.
        ExportError: when Pandoc/manuscripta fails.
    """
```

---

## Summary: what happens automatically on every commit

```
git commit
  -> pre-commit hooks run:
     1. ruff check (Python lint)
     2. ruff format --check (Python format)
     3. eslint (TypeScript lint)
     4. prettier --check (TypeScript format)
     5. pytest -x -q (backend smoke test)
  -> all green? commit goes through.
  -> anything red? commit rejected, errors shown.
```

No code reaches the repo that isn't formatted, linted, and tested.
