"""Bulk delete + bulk restore for Articles, Books, and ArticleComments.

Mirrored across all three entities:

    POST /api/articles/bulk-delete
    POST /api/books/bulk-delete
    POST /api/comments/bulk-delete

    POST /api/articles/trash/bulk-restore
    POST /api/books/trash/bulk-restore
    POST /api/comments/trash/bulk-restore  (lives in comments.py for
                                            historical reasons; same shape)

Body shape (all endpoints):

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
models/__init__.py. ArticleComment is a leaf in the data model
(no cascade children), so the permanent path just removes the
row.

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
from typing import cast

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.models import Article, ArticleComment, Book
from app.repositories.bulk import BulkRepository, get_bulk_repository

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
comments_router = APIRouter(prefix="/comments", tags=["comments"])


def _bulk_delete(
    model: type[Article] | type[Book] | type[ArticleComment],
    ids: list[str],
    permanent: bool,
    repo: BulkRepository,
) -> BulkDeleteResponse:
    """Shared core. Same shape for Article / Book / ArticleComment;
    the SQLAlchemy cascade configuration on each model handles child
    rows (ArticleComment is a leaf — no children to cascade)."""
    deleted_count = 0
    skipped: list[str] = []
    failed: list[_FailedItem] = []

    # Single query loads every requested row in one round-trip. We
    # don't pre-filter ``deleted_at`` here because both code paths
    # need to know whether a requested ID actually exists.
    # ``cast`` because the generic ``repo.get_by_ids`` returns
    # ``list[Any]``, but the caller always passes Article / Book /
    # ArticleComment so the runtime rows DO carry the expected attributes.
    rows = cast(
        "list[Article | Book | ArticleComment]",
        repo.get_by_ids(model, ids),
    )
    by_id: dict[str, Article | Book | ArticleComment] = {row.id: row for row in rows}

    for row_id in ids:
        row = by_id.get(row_id)
        if row is None:
            failed.append(_FailedItem(id=row_id, error="not found"))
            continue

        if permanent:
            try:
                repo.delete(row)
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

    repo.commit()
    return BulkDeleteResponse(
        deleted_count=deleted_count,
        skipped_already_trashed=skipped,
        failed=failed,
    )


@articles_router.post("/bulk-delete", response_model=BulkDeleteResponse)
def bulk_delete_articles(
    body: BulkDeleteRequest,
    repo: BulkRepository = Depends(get_bulk_repository),
) -> BulkDeleteResponse:
    return _bulk_delete(Article, body.ids, body.permanent, repo)


@books_router.post("/bulk-delete", response_model=BulkDeleteResponse)
def bulk_delete_books(
    body: BulkDeleteRequest,
    repo: BulkRepository = Depends(get_bulk_repository),
) -> BulkDeleteResponse:
    return _bulk_delete(Book, body.ids, body.permanent, repo)


@comments_router.post("/bulk-delete", response_model=BulkDeleteResponse)
def bulk_delete_comments(
    body: BulkDeleteRequest,
    repo: BulkRepository = Depends(get_bulk_repository),
) -> BulkDeleteResponse:
    return _bulk_delete(ArticleComment, body.ids, body.permanent, repo)


# ---------------------------------------------------------------------------
# Bulk restore (counterpart to bulk-delete). Mirrors the shape of
# the existing ``comments.bulk_restore_comments`` (see comments.py),
# extended here to Article + Book so the bulk-delete + Undo-toast
# flow consolidates from N parallel single-item restores into one
# round-trip with per-id status.
#
# Why per-id status (not 404-or-204): the caller is an Undo flow
# that already has the IDs in hand. A 4xx on the whole batch when
# one id is unknown would be hostile (the other 89 should still
# restore). The shape mirrors BulkDeleteResponse for symmetry.
# ---------------------------------------------------------------------------


class BulkRestoreRequest(BaseModel):
    ids: list[str] = Field(min_length=1)


class _RestoreFailedItem(BaseModel):
    id: str
    error: str


class BulkRestoreResponse(BaseModel):
    restored_count: int
    skipped_not_in_trash: list[str] = Field(default_factory=list)
    failed: list[_RestoreFailedItem] = Field(default_factory=list)


def _bulk_restore(
    model: type[Article] | type[Book],
    ids: list[str],
    repo: BulkRepository,
) -> BulkRestoreResponse:
    """Shared core. Same shape as ``_bulk_delete`` but inverse:
    clear ``deleted_at`` on every row whose ``deleted_at IS NOT NULL``.
    Already-live rows land in ``skipped_not_in_trash`` (idempotent).

    Single-transaction commit so a Promise.all-style undo can't race
    SQLite write contention the way 90 parallel single-item POSTs can.
    """
    restored_count = 0
    skipped: list[str] = []
    failed: list[_RestoreFailedItem] = []

    rows = cast(
        "list[Article | Book]",
        repo.get_by_ids(model, ids),
    )
    by_id: dict[str, Article | Book] = {row.id: row for row in rows}

    for row_id in ids:
        row = by_id.get(row_id)
        if row is None:
            failed.append(_RestoreFailedItem(id=row_id, error="not found"))
            continue
        if row.deleted_at is None:
            skipped.append(row_id)
            continue
        try:
            row.deleted_at = None
            restored_count += 1
        except Exception as exc:  # noqa: BLE001 - boundary handler
            logger.exception("bulk-restore: failed on %s", row_id)
            failed.append(_RestoreFailedItem(id=row_id, error=str(exc)))

    repo.commit()
    return BulkRestoreResponse(
        restored_count=restored_count,
        skipped_not_in_trash=skipped,
        failed=failed,
    )


@articles_router.post("/trash/bulk-restore", response_model=BulkRestoreResponse)
def bulk_restore_articles(
    body: BulkRestoreRequest,
    repo: BulkRepository = Depends(get_bulk_repository),
) -> BulkRestoreResponse:
    return _bulk_restore(Article, body.ids, repo)


@books_router.post("/trash/bulk-restore", response_model=BulkRestoreResponse)
def bulk_restore_books(
    body: BulkRestoreRequest,
    repo: BulkRepository = Depends(get_bulk_repository),
) -> BulkRestoreResponse:
    return _bulk_restore(Book, body.ids, repo)
