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

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ArticleComment
from app.routers.articles import CommentOut

router = APIRouter(prefix="/comments", tags=["comments"])


@router.get("", response_model=list[CommentOut])
def list_comments(
    db: Session = Depends(get_db),
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
    query = db.query(ArticleComment).filter(ArticleComment.deleted_at.is_(None))
    if imported_from is not None:
        query = query.filter(ArticleComment.imported_from == imported_from)
    if orphans_only:
        query = query.filter(ArticleComment.responds_to_article_id.is_(None))
    return query.order_by(ArticleComment.imported_at.desc()).limit(limit).all()


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(comment_id: str, db: Session = Depends(get_db)) -> None:
    """Soft-delete a comment. ``deleted_at`` is stamped, the row
    stays in the DB; the user can restore it via
    ``POST /api/comments/trash/{id}/restore`` or permanently
    remove it via ``DELETE /api/comments/trash/{id}``.
    """
    comment = db.query(ArticleComment).filter(ArticleComment.id == comment_id).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.deleted_at is not None:
        # Already soft-deleted; respond 204 idempotently so the
        # admin view's bulk-delete-by-id flow stays clean.
        return
    comment.deleted_at = datetime.now(UTC)
    db.commit()


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
def list_trashed_comments(db: Session = Depends(get_db)) -> list[ArticleComment]:
    """List every comment currently in the trash, newest first.

    Mirror of ``GET /api/articles/trash/list``. Newest-trashed-
    first ordering matches the user's mental model when the
    trash view is opened immediately after a bulk move-to-trash.
    """
    return (
        db.query(ArticleComment)
        .filter(ArticleComment.deleted_at.is_not(None))
        .order_by(ArticleComment.deleted_at.desc())
        .all()
    )


@router.post("/trash/{comment_id}/restore", response_model=CommentOut)
def restore_comment(comment_id: str, db: Session = Depends(get_db)) -> ArticleComment:
    """Restore a trashed comment.

    404 when the id is unknown OR not currently in the trash.
    The "not in trash" branch matters: an admin who clicks
    Restore on a row that another tab already restored should
    see a clear error, not a silent success that masks the
    multi-tab race.
    """
    comment = (
        db.query(ArticleComment)
        .filter(
            ArticleComment.id == comment_id,
            ArticleComment.deleted_at.is_not(None),
        )
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found in trash")
    comment.deleted_at = None
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/trash/empty", status_code=status.HTTP_204_NO_CONTENT)
def empty_comment_trash(db: Session = Depends(get_db)) -> None:
    """Permanently delete every comment currently in the trash.

    Comments are a leaf in the data model (no cascade children),
    so this is a straight ``db.delete`` per row — no on-disk
    cleanup parallel to ``empty_article_trash``'s ``rmtree``.
    """
    rows = db.query(ArticleComment).filter(ArticleComment.deleted_at.is_not(None)).all()
    for comment in rows:
        db.delete(comment)
    db.commit()


@router.delete("/trash/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def permanent_delete_comment(comment_id: str, db: Session = Depends(get_db)) -> None:
    """Permanently remove one comment from the trash.

    404 when the id is unknown OR not currently in the trash.
    Refusing to hard-delete a live (non-trashed) comment via
    this endpoint forces the caller to use ``DELETE /api/comments/{id}``
    first; a single-step hard-delete-without-trash path doesn't
    exist by design.
    """
    comment = (
        db.query(ArticleComment)
        .filter(
            ArticleComment.id == comment_id,
            ArticleComment.deleted_at.is_not(None),
        )
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found in trash")
    db.delete(comment)
    db.commit()


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
    ``app.services.reclassify.comment_to_article``.
    """
    from app.services.reclassify import comment_to_article

    comment = db.query(ArticleComment).filter(ArticleComment.id == comment_id).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")

    article = comment_to_article(comment, db)
    db.commit()

    return ReclassifyAsArticleResponse(
        success=True,
        article_id=article.id,
        deleted_comment_id=comment_id,
    )
