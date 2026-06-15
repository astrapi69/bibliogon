"""FastAPI exception handlers for the Bibliogon app.

Extracted from ``app/main.py`` (God-file decomposition, 2026-06-14).
Maps the typed :class:`~app.exceptions.BibliogonError` hierarchy to HTTP
responses and logs every unhandled exception with a stacktrace. Per
``.claude/rules/code-hygiene.md`` services raise ``BibliogonError``
subclasses; routers catch nothing; these handlers do the mapping.

Call :func:`register_exception_handlers` once after the ``FastAPI``
instance exists.
"""

import logging
import traceback
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.exceptions import BibliogonError

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI, *, debug: bool) -> None:
    """Register the domain + catch-all exception handlers on ``app``.

    Args:
        app: The FastAPI application instance.
        debug: When True, 500 responses include the stacktrace, endpoint,
            and method so the frontend "Report issue" button can build an
            actionable GitHub issue body.
    """

    @app.exception_handler(BibliogonError)
    async def bibliogon_error_handler(request: Request, exc: BibliogonError):
        """Map typed domain errors to HTTP responses (per code-hygiene.md)."""
        if exc.status_code >= 500:
            logger.error(
                "%s %s -> %s",
                request.method,
                request.url.path,
                exc.detail,
                exc_info=exc,
            )
        else:
            logger.warning(
                "%s %s -> %s %s",
                request.method,
                request.url.path,
                exc.status_code,
                exc.detail,
            )
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Log all unhandled exceptions with full stacktrace."""
        logger.error(
            "Unhandled error: %s %s -> %s",
            request.method,
            request.url.path,
            str(exc),
            exc_info=True,
        )
        detail: dict[str, Any] = {"detail": str(exc)}
        if debug:
            detail["stacktrace"] = traceback.format_exc()
            detail["endpoint"] = request.url.path
            detail["method"] = request.method
        return JSONResponse(status_code=500, content=detail)
