# Code hygiene (summary)

Binding rules only. Full text with the exception hierarchy, handler and client
code: `docs/development/rules/code-hygiene.md`. This summary must not
contradict it (#1143).

## Formatting and linting (automatic)
Python: ruff (lint + format), gated by pre-commit on `backend/app/` and in CI. Frontend: ESLint and Prettier are configured but not gated - match each file's existing style and never mass-reformat (the Prettier block in the full text does not match the real `frontend/.prettierrc`).

## Pre-commit hooks
`make install-hooks` installs the git hooks including the commit-msg stage (no AI co-author) and the pre-push hook that runs pre-commit on tag pushes. Cloud sessions get them from the session-start hook.

## Error handling architecture
Services raise `BibliogonError` subclasses (`NotFoundError` 404, `ValidationError` 400, `ConflictError` 409, `ExportError`/`PluginError` 500, `ExternalServiceError` 502), never `HTTPException`. Routers catch nothing; the global handler maps the status and adds the traceback in debug mode. No bare `except Exception`; wrap external tools. Frontend: every API error is an `ApiError`, shown via toast with i18n text, loading state reset in `finally`, a "Report issue" link on 5xx. Generic messages are forbidden.

## API conventions
REST under `/api/...`, plugin routes under `/api/{plugin}/...`. No response envelope, UUID string ids, ISO 8601 UTC timestamps, lists unpaginated. 422 comes from Pydantic.

## Logging
Backend: `logging.getLogger(__name__)`, context via `extra`, never `print`. INFO for actions, WARNING for fallbacks, ERROR with `exc_info` for user-facing failures. Frontend: no `console.log`; user feedback only via toasts.

## Inline documentation
No inline comments: names explain, docstrings (Google style) and TSDoc explain the rest. Allowed: `TODO(#N)`, the why of a non-obvious algorithm, licence headers. No commented-out code.

## Summary: what happens automatically on every commit
The pre-commit hooks (ruff, ruff-format, file checks, bandit, the commit-msg checks) run on `git commit`; a red hook rejects the commit.
