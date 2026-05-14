"""Comments admin endpoints.

MEDIUM-COMMENTS-IMPORT-01 commit 7. Lives in core (not in the
medium-import plugin) so future importers (WordPress, Hashnode,
etc.) can write to the same ``article_comments`` table and the
admin surface doesn't have to be reachable via a
Medium-plugin-prefixed route.

Two endpoints in this v1:

  - GET /api/comments         — list comments, filterable by
                                imported_from + orphan-only.
                                Used by a future admin view to
                                surface orphans for re-linkage.
  - DELETE /api/comments/{id} — soft-delete a single comment.

Hard-delete and re-linkage endpoints are out of scope for v1;
v2 ships them when MEDIUM-COMMENTS-UI-01 builds the admin view.
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
    """Soft-delete a comment. Mirrors the trash semantics used for
    Article: ``deleted_at`` is stamped, the row stays in the DB
    so an undo can restore it. Hard-delete is deferred to v2.
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
