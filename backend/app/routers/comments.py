"""Comments admin endpoints.

MEDIUM-COMMENTS-IMPORT-01 commit 7 originally shipped a v1 admin
surface with soft-delete only; the trash-lifecycle counterparts
(list-trashed, restore, permanent-delete-from-trash) were
documented as "deferred to v2". Bug 10 (2026-05-16) shipped
those endpoints — comments now follow the same trash-lifecycle
shape as Articles and Books.

Lives in core (not in the medium-import plugin) so future
importers (WordPress, Hashnode, etc.) write to the same
``article_comments`` table and the admin surface stays
provider-agnostic.

Endpoints:

  GET    /api/comments                 list comments, filterable
                                       by imported_from +
                                       orphans_only. Soft-deleted
                                       rows are excluded.
  DELETE /api/comments/{id}            soft-delete a single
                                       comment. Idempotent.
  GET    /api/comments/trash/list      list every comment
                                       currently in the trash,
                                       newest-trashed first.
  POST   /api/comments/trash/{id}/restore
                                       restore a trashed comment.
                                       404 when id is unknown OR
                                       not currently in the trash.
  DELETE /api/comments/trash/empty     permanently delete every
                                       comment in the trash.
  DELETE /api/comments/trash/{id}      permanently delete one
                                       comment from the trash.
                                       404 when not in the trash.
  POST   /api/comments/{id}/reclassify-as-article
                                       move comment → article.
                                       Soft-deleted comments are
                                       eligible (the user can
                                       notice a misclassification
                                       post-trash).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ArticleComment
from app.repositories.comments import CommentRepository, get_comment_repository
from app.routers.articles import CommentOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/comments", tags=["comments"])


@router.get("", response_model=list[CommentOut])
def list_comments(
    repo: CommentRepository = Depends(get_comment_repository),
    imported_from: str | None = Query(
        default=None,
        description=(
            "Filter by source platform (``medium``, ``wordpress``, ...). "
            "Omit to list comments from every source."
        ),
    ),
    orphans_only: bool = Query(
        default=False,
        description=(
            "When True, only return comments with "
            "``responds_to_article_id IS NULL``. Drives a future "
            "admin view's orphan-management workflow."
        ),
    ),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[ArticleComment]:
    """Admin listing of comments across all articles.

    Soft-deleted comments are excluded. Ordered by ``imported_at``
    descending so the newest imports surface first - mirrors the
    Articles dashboard's "newest first" UX expectation.
    """
    return list(
        repo.list(
            imported_from=imported_from,
            orphans_only=orphans_only,
            limit=limit,
        )
    )


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: str,
    repo: CommentRepository = Depends(get_comment_repository),
) -> None:
    """Soft-delete a comment. ``deleted_at`` is stamped, the row
    stays in the DB; the user can restore it via
    ``POST /api/comments/trash/{id}/restore`` or permanently
    remove it via ``DELETE /api/comments/trash/{id}``.

    Already-trashed comments respond 204 idempotently so the admin
    view's bulk-delete-by-id flow stays clean.
    """
    comment = repo.get(comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.deleted_at is not None:
        return
    repo.soft_delete(comment)


# ---------------------------------------------------------------------------
# Bug 10 (2026-05-16): trash-lifecycle endpoints.
#
# The MEDIUM-COMMENTS-IMPORT-01 v1 admin surface shipped soft-
# delete only; the trash-view + restore + permanent-delete-from-
# trash counterparts were filed as "v2" and never picked up.
# Production smoke surfaced 61 soft-deleted comments stuck in
# invisible purgatory. These endpoints close the gap by mirroring
# the Articles + Books trash pattern exactly. See
# ``app/routers/articles.py`` ``list_trashed_articles`` /
# ``restore_article`` / ``empty_article_trash`` /
# ``permanent_delete_article`` for the parallel surface.
# ---------------------------------------------------------------------------


@router.get("/trash/list", response_model=list[CommentOut])
def list_trashed_comments(
    repo: CommentRepository = Depends(get_comment_repository),
) -> list[ArticleComment]:
    """List every comment currently in the trash, newest first.

    Mirror of ``GET /api/articles/trash/list``. Newest-trashed-
    first ordering matches the user's mental model when the
    trash view is opened immediately after a bulk move-to-trash.
    """
    return list(repo.list_trashed())


@router.post("/trash/{comment_id}/restore", response_model=CommentOut)
def restore_comment(
    comment_id: str,
    repo: CommentRepository = Depends(get_comment_repository),
) -> ArticleComment:
    """Restore a trashed comment.

    404 when the id is unknown OR not currently in the trash.
    The "not in trash" branch matters: an admin who clicks
    Restore on a row that another tab already restored should
    see a clear error, not a silent success that masks the
    multi-tab race.
    """
    comment = repo.get_trashed(comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found in trash")
    return repo.restore(comment)


@router.delete("/trash/empty", status_code=status.HTTP_204_NO_CONTENT)
def empty_comment_trash(
    repo: CommentRepository = Depends(get_comment_repository),
) -> None:
    """Permanently delete every comment currently in the trash.

    Comments are a leaf in the data model (no cascade children),
    so this is a straight hard-delete per row — no on-disk
    cleanup parallel to ``empty_article_trash``'s ``rmtree``.
    """
    repo.delete_many(repo.list_trashed())


@router.delete("/trash/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def permanent_delete_comment(
    comment_id: str,
    repo: CommentRepository = Depends(get_comment_repository),
) -> None:
    """Permanently remove one comment from the trash.

    404 when the id is unknown OR not currently in the trash.
    Refusing to hard-delete a live (non-trashed) comment via
    this endpoint forces the caller to use ``DELETE /api/comments/{id}``
    first; a single-step hard-delete-without-trash path doesn't
    exist by design.
    """
    comment = repo.get_trashed(comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found in trash")
    repo.delete(comment)


# ---------------------------------------------------------------------------
# Bug 10 Commit 5: bulk-restore (counterpart to the existing bulk-delete).
# Bulk-permanent-delete-from-trash reuses ``POST /api/comments/bulk-delete``
# with ``permanent=true`` (the existing endpoint accepts any comment id and
# hard-deletes when ``permanent`` is True, regardless of soft-delete state),
# so no separate bulk-permanent endpoint is added here.
# ---------------------------------------------------------------------------


class BulkRestoreRequest(BaseModel):
    ids: list[str] = Field(min_length=1)


class _BulkRestoreFailed(BaseModel):
    id: str
    error: str


class BulkRestoreResponse(BaseModel):
    """Per-id outcome of a bulk-restore. Mirrors the shape of
    ``BulkDeleteResponse``: a single count of successful operations,
    a list of ids that were not eligible (idempotency-skip), and a
    list of unexpected per-id failures.
    """

    restored_count: int
    skipped_not_in_trash: list[str]
    failed: list[_BulkRestoreFailed]


@router.post("/trash/bulk-restore", response_model=BulkRestoreResponse)
def bulk_restore_comments(
    body: BulkRestoreRequest,
    repo: CommentRepository = Depends(get_comment_repository),
) -> BulkRestoreResponse:
    """Restore multiple trashed comments in one round-trip.

    Per-id semantics match the existing bulk-delete:

    - Unknown id → ``failed`` entry (``"not found"``).
    - Id exists but is already live (``deleted_at IS NULL``) →
      ``skipped_not_in_trash`` entry; idempotent so a caller that
      sends a hand-built list including already-restored ids
      doesn't raise.
    - Id exists and is trashed → clear ``deleted_at``; increment
      ``restored_count``.

    Uncapped (same cost profile as bulk-delete: one DB UPDATE per
    row; sub-second for thousands).
    """
    restored_count = 0
    skipped: list[str] = []
    failed: list[_BulkRestoreFailed] = []

    rows = repo.get_by_ids(body.ids)
    by_id = {row.id: row for row in rows}

    for row_id in body.ids:
        row = by_id.get(row_id)
        if row is None:
            failed.append(_BulkRestoreFailed(id=row_id, error="not found"))
            continue
        if row.deleted_at is None:
            skipped.append(row_id)
            continue
        try:
            row.deleted_at = None
            restored_count += 1
        except Exception as exc:  # noqa: BLE001 - boundary handler
            logger.exception("bulk-restore: failed on %s", row_id)
            failed.append(_BulkRestoreFailed(id=row_id, error=str(exc)))

    repo.commit()
    return BulkRestoreResponse(
        restored_count=restored_count,
        skipped_not_in_trash=skipped,
        failed=failed,
    )


# ---------------------------------------------------------------------------
# v0.32.0 F2b: reciprocal of POST /api/articles/{id}/reclassify-as-comment
# ---------------------------------------------------------------------------


class ReclassifyAsArticleResponse(BaseModel):
    """Response from ``POST /api/comments/{id}/reclassify-as-article``.

    ``article_id`` is the newly-inserted Article — the frontend
    navigates straight to ``/articles/{article_id}`` so the user
    can edit the auto-derived title. ``deleted_comment_id``
    lets the comments-admin view drop the comment from its
    local list.
    """

    success: bool
    article_id: str
    deleted_comment_id: str


@router.post(
    "/{comment_id}/reclassify-as-article",
    response_model=ReclassifyAsArticleResponse,
)
def reclassify_comment_as_article(
    comment_id: str,
    repo: CommentRepository = Depends(get_comment_repository),
    db: Session = Depends(get_db),
) -> ReclassifyAsArticleResponse:
    """Move an ArticleComment to Article.

    Mirrors ``POST /api/articles/{id}/reclassify-as-comment``.
    No request body is required: the Article's title is
    auto-derived from the comment body (first 200 chars, trimmed
    at word boundary, plus "..." when truncated). The user
    edits the title afterwards if the auto-derivation reads
    awkwardly.

    When the comment was an imported one (``imported_from !=
    "manual"`` and ``canonical_url`` is set), a paired
    ``ArticleImportSource`` row is created so the
    "where did this come from?" provenance survives the move.

    404 when the comment doesn't exist or has been hard-
    deleted. Soft-deleted comments ARE eligible — the user can
    notice a misclassification post-trash.

    Field translation lives in
    ``app.services.reclassify.comment_to_article``. That service still
    takes the request ``Session`` directly (it creates an Article +
    provenance row); the ``db`` parameter stays until the cross-entity
    reclassify path is migrated, and it is the same request session
    that backs ``repo``.
    """
    from app.services.reclassify import comment_to_article

    comment = repo.get(comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")

    article = comment_to_article(comment, db)
    db.commit()

    return ReclassifyAsArticleResponse(
        success=True,
        article_id=article.id,
        deleted_comment_id=comment_id,
    )
