"""Bulk delete for Articles and Books.

Two endpoints, mirrored:

    POST /api/articles/bulk-delete
    POST /api/books/bulk-delete

Body shape (both endpoints):

    {"ids": ["...", "..."], "permanent": false}

Response shape:

    {"deleted_count": int,
     "skipped_already_trashed": ["..."],
     "failed": [{"id": "...", "error": "..."}]}

Soft path (``permanent=false``, default): sets ``deleted_at`` on
every row whose ``deleted_at IS NULL``. Already-trashed rows land
in ``skipped_already_trashed`` (idempotent; never raises).

Permanent path (``permanent=true``): hard-deletes the row.
SQLAlchemy ``cascade="all, delete-orphan"`` handles the children
(Article -> Publication / ArticleAsset / ArticleImportSource;
Book -> Chapter / Asset / BookImportSource), all verified in
models/__init__.py.

No hard cap. Bulk-delete is intentionally uncapped (unlike bulk-
export which keeps its 200-article cap): the cost profile is
"DB UPDATE / DELETE per row" rather than "spawn pandoc per row +
network round-trip per asset", so 1000-row deletes complete in
under a second and don't trip request-timeout limits. See the
"Bulk-operation limits should be per-operation cost-profile"
lessons-learned entry for the rule.

The endpoint never short-circuits on a single failing row: per-row
errors land in ``failed[]`` with the offending ID so the caller's
toast can render "X deleted, Y already trashed, Z failed".
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Article, Book

logger = logging.getLogger(__name__)


class _FailedItem(BaseModel):
    id: str
    error: str


class BulkDeleteRequest(BaseModel):
    # min_length=1 keeps "empty body" a 422; no upper bound because
    # the operation is uncapped (see module docstring + the
    # bulk-operation cost-profile lesson).
    ids: list[str] = Field(min_length=1)
    permanent: bool = False


class BulkDeleteResponse(BaseModel):
    deleted_count: int
    skipped_already_trashed: list[str] = Field(default_factory=list)
    failed: list[_FailedItem] = Field(default_factory=list)


articles_router = APIRouter(prefix="/articles", tags=["articles"])
books_router = APIRouter(prefix="/books", tags=["books"])


def _bulk_delete(
    model: type,
    ids: list[str],
    permanent: bool,
    db: Session,
) -> BulkDeleteResponse:
    """Shared core. Same shape for Article and Book; the SQLAlchemy
    cascade configuration on each model handles child rows."""
    deleted_count = 0
    skipped: list[str] = []
    failed: list[_FailedItem] = []

    # Single query loads every requested row in one round-trip. We
    # don't pre-filter ``deleted_at`` here because both code paths
    # need to know whether a requested ID actually exists.
    rows = db.query(model).filter(model.id.in_(ids)).all()
    by_id = {row.id: row for row in rows}

    for row_id in ids:
        row = by_id.get(row_id)
        if row is None:
            failed.append(_FailedItem(id=row_id, error="not found"))
            continue

        if permanent:
            try:
                db.delete(row)
                deleted_count += 1
            except Exception as exc:  # noqa: BLE001 - boundary handler
                logger.exception("bulk-delete: failed on %s", row_id)
                failed.append(_FailedItem(id=row_id, error=str(exc)))
        else:
            # Soft path: skip rows already in trash so the operation
            # is idempotent. The caller's "Alle auswählen" should
            # never have included trashed rows (dashboards filter
            # them out), but defensive against a direct-API caller
            # who sends a hand-built list.
            if row.deleted_at is not None:
                skipped.append(row_id)
                continue
            try:
                row.deleted_at = datetime.now(UTC)
                deleted_count += 1
            except Exception as exc:  # noqa: BLE001 - boundary handler
                logger.exception("bulk-delete: failed on %s", row_id)
                failed.append(_FailedItem(id=row_id, error=str(exc)))

    db.commit()
    return BulkDeleteResponse(
        deleted_count=deleted_count,
        skipped_already_trashed=skipped,
        failed=failed,
    )


@articles_router.post("/bulk-delete", response_model=BulkDeleteResponse)
def bulk_delete_articles(
    body: BulkDeleteRequest,
    db: Session = Depends(get_db),
) -> BulkDeleteResponse:
    return _bulk_delete(Article, body.ids, body.permanent, db)


@books_router.post("/bulk-delete", response_model=BulkDeleteResponse)
def bulk_delete_books(
    body: BulkDeleteRequest,
    db: Session = Depends(get_db),
) -> BulkDeleteResponse:
    return _bulk_delete(Book, body.ids, body.permanent, db)
