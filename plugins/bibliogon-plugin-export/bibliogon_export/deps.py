"""Runtime dependency injection for the export plugin routes.

Holds the DB-session factory + Book model that ``ExportPlugin.activate()``
wires in via :func:`configure`, plus the session-lifecycle helpers the data
loaders use. Kept as a tiny module so loaders, route handlers, and the plugin
class all share one source of truth for the injected dependencies (the
``global`` assignment in :func:`configure` is visible to every reader of
``deps._get_db`` / ``deps._book_model`` at call time).
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

_get_db = None
_book_model = None


def configure(get_db_dep: Any, book_model: Any) -> None:
    """Configure route dependencies. Called by ExportPlugin.activate()."""
    global _get_db, _book_model
    _get_db = get_db_dep
    _book_model = book_model


def _require_db() -> Any:
    """Get a DB session via the configured dependency, or raise."""
    if _get_db is None:
        raise HTTPException(status_code=500, detail="Export plugin not configured")
    db_gen = _get_db()
    return db_gen, next(db_gen)


def _close_db(db_gen: Any) -> None:
    """Close a DB session generator."""
    try:
        next(db_gen)
    except StopIteration:
        pass
