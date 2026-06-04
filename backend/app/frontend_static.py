"""Serve the built frontend (SPA) from FastAPI for single-port LAN access.

LAN-MODE-PHASE-1 C1. In the normal ``make dev`` flow the frontend is
served by the Vite dev server on :5173 and this module is a no-op
(``frontend/dist`` does not exist). In the ``make dev-lan`` flow the
frontend is built to ``frontend/dist`` and served by the backend on a
single origin (:8000), so a phone on the LAN reaches the whole app at
one URL with no cross-origin CORS hop.

Serving model: one catch-all ``GET`` route resolves the request path
against the dist directory. A matching file is returned as-is; any other
path falls back to ``index.html`` so client-side routes (``/books/123``)
deep-link correctly. ``/api`` paths are never served from here -- they
are registered before this catch-all, and a stray ``/api/...`` miss
returns a JSON 404 rather than the SPA shell.
"""

from __future__ import annotations

import logging
import mimetypes
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, Response

logger = logging.getLogger(__name__)


def resolve_frontend_dist() -> Path | None:
    """Return the built-frontend directory if it exists, else ``None``.

    Override the location with ``BIBLIOGON_FRONTEND_DIST``; the default is
    ``<repo>/frontend/dist`` relative to this file. The directory only
    counts as present when it actually holds an ``index.html``.
    """
    override = os.getenv("BIBLIOGON_FRONTEND_DIST")
    if override:
        dist = Path(override).expanduser().resolve()
    else:
        # this file: backend/app/frontend_static.py -> repo root is parents[2]
        dist = (Path(__file__).resolve().parents[2] / "frontend" / "dist").resolve()
    return dist if (dist / "index.html").is_file() else None


def _media_type_for(path: Path) -> str | None:
    """Best-effort content type; covers the one extension mimetypes misses."""
    guessed, _ = mimetypes.guess_type(str(path))
    if guessed:
        return guessed
    if path.suffix == ".webmanifest":
        return "application/manifest+json"
    return None


def register_frontend_static(app: FastAPI) -> bool:
    """Mount SPA serving for the built frontend. No-op if dist is absent.

    Returns ``True`` when serving was registered, ``False`` otherwise.
    Call AFTER all ``/api`` routes are registered so the catch-all never
    shadows them.
    """
    dist = resolve_frontend_dist()
    if dist is None:
        return False

    index_file = dist / "index.html"

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str) -> Response:
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        candidate = (dist / full_path).resolve()
        # Path-traversal guard: candidate must stay within dist.
        if candidate.is_relative_to(dist) and candidate.is_file():
            return FileResponse(candidate, media_type=_media_type_for(candidate))
        return FileResponse(index_file, media_type="text/html")

    logger.info("Serving built frontend from %s (single-port mode).", dist)
    return True
