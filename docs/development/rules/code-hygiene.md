# Code hygiene

Automated enforcement of code quality. These rules make every commit look consistent, whether written by a human or an AI.

## Formatting and linting (automatic)

The configuration lives in the tool files; this section says which ones
apply and what enforces them. It used to copy the configs here, and the
copies drifted (a `py311` ruff target, an `.eslintrc.json` that never
existed, a Prettier block with the opposite settings to the real one -
#1145). Read the files, not a copy.

### Python (Backend + Plugins)

- Config: `[tool.ruff]` in `backend/pyproject.toml` (line length 100,
  target `py312`, the selected rule set and per-file ignores).
- Enforced: the `ruff` and `ruff-format` pre-commit hooks on
  `backend/app/`, and the `Backend ruff + mypy` CI job. Plugins and tests
  are not gated by ruff.

```bash
cd backend && poetry run ruff check app/          # lint
cd backend && poetry run ruff check --fix <files> # auto-fix
cd backend && poetry run ruff format <files>      # format
```

### TypeScript (Frontend)

- ESLint: the flat config `frontend/eslint.config.js` (correctness and
  security findings are errors, stylistic rules start as warnings;
  `eslint-config-prettier` keeps it from fighting Prettier).
- Prettier: `frontend/.prettierrc` (`semi: true`, `singleQuote: false`,
  `tabWidth: 4`, `printWidth: 100`, `trailingComma: "all"`).
- **Neither is gated** - no pre-commit hook and no CI step runs them, and
  much of the committed frontend does not match `.prettierrc`. So: match
  each file's existing style when editing, run ESLint on the files you
  touch, and never run `prettier --write` over files you did not change
  (see lessons-learned "Prettier is configured but ungated"). Making
  Prettier authoritative would be a deliberate repo-wide reformat plus a
  gate, not a side effect.

```bash
cd frontend && npx eslint <files>   # lint the files you touched
```

### Setup (one-time)

Dependencies come with `make install`; the git hooks with
`make install-hooks` (cloud sessions get both from the session-start
hook, #1137).

---

## Pre-commit hooks

Config: `.pre-commit-config.yaml` at the repo root. What runs on
`git commit`:

- file checks: trailing whitespace, end-of-file fixer, YAML and JSON
  syntax, large files, merge-conflict markers;
- `ruff` (with `--fix`) and `ruff-format` on `backend/app/`;
- `bandit` (Python SAST, MEDIUM/MEDIUM, the same gate as CI);
- the repo's own guards, among them: no AI `Co-Authored-By` trailer
  (commit-msg stage) and no AI commit identity (#768, #786), plugin
  lockfile paired with its pyproject, help-nav completeness, theme-token
  completeness, module-state audit, docs completeness, and a
  non-blocking roadmap-archive reminder.

No frontend linter and no test suite runs in the hooks; tests run on CI
(`ci-only-heavy-tests.md`).

```bash
make install-hooks                                  # pre-commit + commit-msg stage + pre-push
cd backend && poetry run pre-commit run --all-files # everything, by hand
```

The pre-push hook runs pre-commit over all backend files when a tag is
pushed.

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

### No inline comments - docstrings only

No inline comments (`#` / `//`) in code. Code must be self-explanatory through
descriptive variable and function names. If something needs explaining, it
belongs in a docstring/doc-block, not an inline comment.

**Python - Google Style Docstrings** for all public functions, classes, and
methods:

```python
def restore_backup(backup_data: dict, user_id: str) -> RestoreResult:
    """Restore a user's data from a backup archive.

    Matches seeded catalog rows by natural key to avoid
    UNIQUE constraint violations on re-seeded databases.

    Args:
        backup_data: Parsed backup archive contents.
        user_id: Target user for the restore operation.

    Returns:
        RestoreResult with counts of added, updated, skipped rows.

    Raises:
        IntegrityError: If a natural key conflict cannot be resolved.
    """
```

**TypeScript / React - TSDoc** for all exported functions, hooks, and components:

```typescript
/**
 * Renders the backup section in Settings > Data.
 * Hidden in Dexie mode (no backend available).
 *
 * @param userId - Active user ID for backup operations.
 */
export function BackupSection({ userId }: BackupSectionProps) {
```

**Allowed:**
- `TODO:` and `FIXME:` with an issue reference (`# TODO(#53): extract to shared util`)
- Regex or complex algorithms where the "why" is not obvious from the code
- License headers

**Forbidden:**
- `# increment counter` / `// set the value` (obvious)
- `# this fixes the bug` (belongs in the commit message)
- `# added by CC` / `# AI-generated`
- Commented-out code (delete it, do not comment it out; Git has the history)

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
  -> pre-commit hooks: file checks, ruff + ruff-format (backend/app/),
     bandit, the repo guards; commit-msg stage: no AI co-author trailer
  -> all green? commit goes through.
  -> anything red? commit rejected, errors shown.
git push (branch) -> CI runs lint, type checks and the test suites
git push (tag)    -> pre-push runs pre-commit over all backend files
```

Frontend formatting and linting are not part of this chain (see above).
