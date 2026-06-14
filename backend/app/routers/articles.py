"""AR-01 Phase 1 + AR-02 Phase 2: standalone Article CRUD.

Articles are long-form content distinct from Books. Single TipTap
document, minimal metadata, simple draft/published/archived
lifecycle. Phase 2 (AR-02) layered on canonical SEO fields and a
one-to-many relationship to :class:`Publication`; per-platform
publication CRUD lives in ``publications.py``.
"""

import json
import logging
import shutil
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.template_schema import extract_body_text
from app.database import SessionLocal, get_db
from app.models import Article, ArticleComment
from app.paths import get_upload_dir
from app.repositories.articles import (
    ArticleRepository,
    SqlAlchemyArticleRepository,
    get_article_repository,
)
from app.repositories.comments import CommentRepository, get_comment_repository
from app.schemas import ArticleCreate, ArticleOut, ArticleUpdate
from app.services.app_settings import get_trash_auto_delete_config, is_permanent_delete

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/articles", tags=["articles"])

_ALLOWED_STATUSES = ("draft", "ready", "published", "archived")


# --- Auto-cleanup of expired trash (mirrors books.cleanup_expired_trash) ---


def cleanup_expired_article_trash() -> int:
    """Permanently delete articles older than the configured trash-
    auto-delete window. Mirrors ``books.cleanup_expired_trash``;
    invoked from the FastAPI lifespan startup hook."""
    enabled, days = get_trash_auto_delete_config()
    if not enabled or days <= 0:
        return 0
    cutoff = datetime.now(UTC) - timedelta(days=days)
    db: Session = SessionLocal()
    count = 0
    try:
        repo = SqlAlchemyArticleRepository(db)
        expired = repo.list_expired_trash(cutoff)
        for article in expired:
            asset_dir = get_upload_dir() / "articles" / article.id
            if asset_dir.exists():
                try:
                    shutil.rmtree(asset_dir)
                except OSError as exc:
                    logger.warning(
                        "cleanup_expired_article_trash: rmtree %s failed: %s",
                        asset_dir,
                        exc,
                    )
        count = len(expired)
        if count:
            repo.delete_all(expired)
            logger.info(
                "Auto-deleted %d expired article trash items (older than %d days)",
                count,
                days,
            )
    finally:
        db.close()
    return count


@router.post("", response_model=ArticleOut, status_code=status.HTTP_201_CREATED)
def create_article(
    payload: ArticleCreate,
    repo: ArticleRepository = Depends(get_article_repository),
) -> Article:
    """Create a draft article. ``status`` always starts at ``draft`` -
    publish via PATCH after the user is happy with the content.

    ``content_type`` (article-type discriminator) defaults to
    ``"blogpost"`` via the column default when the payload omits it.
    ``article_metadata`` is JSON-text on the column; the payload
    sends a dict which is encoded here.
    """
    kwargs: dict[str, Any] = {
        "title": payload.title,
        "subtitle": payload.subtitle,
        "author": payload.author,
        "language": payload.language,
    }
    if payload.content_type is not None:
        kwargs["content_type"] = payload.content_type
    if payload.article_metadata is not None:
        kwargs["article_metadata"] = json.dumps(payload.article_metadata)

    article = Article(**kwargs)
    return repo.add(article)


@router.get("", response_model=list[ArticleOut])
def list_articles(
    article_status: str | None = Query(default=None, alias="status"),
    series: str | None = Query(default=None, max_length=300),
    tag: str | None = Query(default=None, max_length=100),
    topic: str | None = Query(default=None, max_length=100),
    limit: int | None = Query(default=None, ge=1, le=1000),
    repo: ArticleRepository = Depends(get_article_repository),
) -> list[Article]:
    """List live articles with optional filters (status, series, tag, topic).

    Filters compose with AND semantics: each one narrows the result
    set further. Trashed articles (``deleted_at IS NOT NULL``) are
    always excluded; callers reach the trash via
    ``GET /articles/trash/list``.

    The ``tag`` filter checks for membership in the JSON-encoded
    ``tags`` text column. SQLite has no JSON-array operators in the
    portable SQL surface, so the match is a LIKE on the JSON-string
    payload with the tag wrapped in quotes - good enough for the
    typical tag set sizes Bibliogon ships with and avoids a
    DB-engine-specific operator.

    Optional ``limit`` caps the response at the most-recently-updated
    N rows after filtering. Default ``None`` preserves the historical
    "return everything" behaviour; the ArticleList dashboard passes
    the user-selected page size.
    """
    if article_status is not None and article_status not in _ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"status must be one of {_ALLOWED_STATUSES}",
        )
    return list(
        repo.list(
            status=article_status,
            series=series,
            tag=tag,
            topic=topic,
            limit=limit,
        )
    )


# --- Trash ---
#
# Routes registered before ``GET /{article_id}`` so the path-param
# match does not eat the literal ``/trash/list`` segment.


@router.get("/trash/list", response_model=list[ArticleOut])
def list_trashed_articles(
    repo: ArticleRepository = Depends(get_article_repository),
) -> list[Article]:
    """List every article currently in the trash, newest first."""
    return list(repo.list_trashed())


@router.post("/trash/{article_id}/restore", response_model=ArticleOut)
def restore_article(
    article_id: str,
    repo: ArticleRepository = Depends(get_article_repository),
) -> Article:
    """Restore a trashed article. 404 when the id is unknown OR not
    in the trash."""
    article = repo.get_trashed(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found in trash")
    article.deleted_at = None
    return repo.save(article)


@router.delete("/trash/empty", status_code=status.HTTP_204_NO_CONTENT)
def empty_article_trash(
    repo: ArticleRepository = Depends(get_article_repository),
) -> None:
    """Permanently delete every article currently in the trash."""
    expired = repo.list_trashed()
    for article in expired:
        asset_dir = get_upload_dir() / "articles" / article.id
        if asset_dir.exists():
            try:
                shutil.rmtree(asset_dir)
            except OSError as exc:
                logger.warning("empty_article_trash: rmtree %s failed: %s", asset_dir, exc)
    repo.delete_all(expired)


@router.delete("/trash/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def permanent_delete_article(
    article_id: str,
    repo: ArticleRepository = Depends(get_article_repository),
) -> None:
    """Permanently remove a single article from the trash + its
    on-disk assets. 404 when the id is not in the trash."""
    article = repo.get_trashed(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found in trash")
    asset_dir = get_upload_dir() / "articles" / article_id
    if asset_dir.exists():
        try:
            shutil.rmtree(asset_dir)
        except OSError as exc:
            logger.warning("permanent_delete_article: rmtree %s failed: %s", asset_dir, exc)
    repo.delete(article)


@router.get("/{article_id}", response_model=ArticleOut)
def get_article(
    article_id: str,
    repo: ArticleRepository = Depends(get_article_repository),
) -> Article:
    """Get an article by id. Returns trashed articles too so the
    editor's restore-via-direct-url flow keeps working; the front-
    end's article list filters trashed entries out."""
    article = repo.get(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


# ---------------------------------------------------------------------------
# MEDIUM-COMMENTS-IMPORT-01 commit 6: article-scoped comments listing
# ---------------------------------------------------------------------------


class CommentOut(BaseModel):
    """Read-only view of an ArticleComment. Lives in core (not
    in the medium-import plugin) because future importers
    (WordPress, Hashnode) reuse the same table and shouldn't
    have to go through a Medium-plugin-prefixed route."""

    id: str
    author: str | None
    body_text: str
    body_json: str | None
    language: str
    published_at: datetime | None
    canonical_url: str | None
    responds_to_article_id: str | None
    responds_to_url: str | None
    imported_from: str
    imported_at: datetime
    source_filename: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("/{article_id}/comments", response_model=list[CommentOut])
def list_article_comments(
    article_id: str,
    repo: ArticleRepository = Depends(get_article_repository),
    comment_repo: CommentRepository = Depends(get_comment_repository),
) -> list[ArticleComment]:
    """List comments that respond to this article.

    Returns soft-deleted-filtered comments ordered by their
    original ``published_at`` (NULL last). 404 when the article
    doesn't exist so the editor can distinguish "no comments
    yet" (200 + []) from "wrong article id" (404).
    """
    if repo.get(article_id) is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return list(comment_repo.list_for_article(article_id))


# ---------------------------------------------------------------------------
# v0.32.0 F2b: Article ⇄ ArticleComment reclassify (one direction; the
# reciprocal Comment → Article path lives in ``app.routers.comments``)
# ---------------------------------------------------------------------------


class ReclassifyAsCommentRequest(BaseModel):
    """Request body for ``POST /api/articles/{id}/reclassify-as-comment``.

    Both fields are optional. When the caller knows the parent
    article URL or id, supply it so the new ArticleComment is
    immediately linked. Omitted fields default to None (orphan
    semantics, the dominant case for ad-hoc reclassifies).
    """

    responds_to_url: str | None = None
    responds_to_article_id: str | None = None


class ReclassifyAsCommentResponse(BaseModel):
    """Response from ``POST /api/articles/{id}/reclassify-as-comment``.

    The frontend uses ``comment_id`` to deep-link a "View in
    Comments admin" toast action; ``deleted_article_id`` lets it
    drop the article from any local cache it holds.
    """

    success: bool
    comment_id: str
    deleted_article_id: str


@router.post(
    "/{article_id}/reclassify-as-comment",
    response_model=ReclassifyAsCommentResponse,
)
def reclassify_article_as_comment(
    article_id: str,
    payload: ReclassifyAsCommentRequest,
    repo: ArticleRepository = Depends(get_article_repository),
    db: Session = Depends(get_db),
) -> ReclassifyAsCommentResponse:
    """Move an Article to ArticleComment.

    The two writes (insert comment + delete article) commit
    together — never half-applied. Field translation is
    documented in ``app.services.reclassify.article_to_comment``.

    404 when the article doesn't exist or is hard-deleted. The
    endpoint accepts soft-deleted articles too: a user could
    notice the misclassification only after trashing the
    article, and the reciprocal move should still work.

    400 when ``responds_to_article_id`` references an article
    that doesn't exist — silently flipping the FK to NULL would
    confuse the user.

    The ``article_to_comment`` service still takes the request
    ``Session`` directly (it inserts a comment + deletes the article
    atomically); the ``db`` parameter stays until that cross-entity
    path is migrated, and it is the same request session that backs
    ``repo``.
    """
    from app.services.reclassify import article_to_comment

    article = repo.get(article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    if payload.responds_to_article_id is not None:
        target = repo.get(payload.responds_to_article_id)
        if target is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"responds_to_article_id {payload.responds_to_article_id!r} does not exist"
                ),
            )

    comment = article_to_comment(
        article,
        db,
        responds_to_url=payload.responds_to_url,
        responds_to_article_id=payload.responds_to_article_id,
    )
    db.commit()

    return ReclassifyAsCommentResponse(
        success=True,
        comment_id=comment.id,
        deleted_article_id=article_id,
    )


@router.patch("/{article_id}", response_model=ArticleOut)
def update_article(
    article_id: str,
    payload: ArticleUpdate,
    repo: ArticleRepository = Depends(get_article_repository),
) -> Article:
    """Partial update. Only fields present in the body are written.

    The TipTap editor's auto-save flow lands here with
    ``content_json`` set; the metadata sidebar lands here with
    ``title`` / ``subtitle`` / ``author`` / ``language`` /
    ``status``. Same endpoint serves both shapes.
    """
    article = repo.get(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    updates = payload.model_dump(exclude_unset=True)
    # tags is exposed as list[str] on the API but stored as JSON-text
    # to match Article.content_json + Book.keywords convention. Encode
    # before assignment.
    if "tags" in updates and updates["tags"] is not None:
        updates["tags"] = json.dumps(updates["tags"])
    # ARTICLE-TYPES-SSOT-01. article_metadata is exposed as dict on
    # the API; stored as JSON-text on the column. Same encode-on-write
    # convention as tags above.
    if "article_metadata" in updates and updates["article_metadata"] is not None:
        updates["article_metadata"] = json.dumps(updates["article_metadata"])
    for key, value in updates.items():
        setattr(article, key, value)
    return repo.save(article)


# --- AI metadata generation (SEO title / SEO description / tags) ---


_AI_META_FIELDS = ("seo_title", "seo_description", "tags")


class _GenerateMetaRequest(BaseModel):
    field: str = Field(..., description="One of: seo_title, seo_description, tags")
    provider: str | None = None


@router.post("/{article_id}/ai/generate-meta")
async def generate_article_meta(
    article_id: str,
    request: _GenerateMetaRequest,
    repo: ArticleRepository = Depends(get_article_repository),
) -> dict:
    """Single-shot AI generation for SEO title / description / tags.

    Reuses the existing ``app.ai.llm_client`` infrastructure so the
    user's configured provider, model, and API key apply unchanged.
    Article body is extracted from TipTap JSON, metadata header
    (title / subtitle / topic / author) is included in the prompt
    for context.

    Tokens consumed bump ``Article.ai_tokens_used`` for the
    per-article cost dashboard.
    """
    from app.ai.llm_client import LLMError
    from app.ai.routes import _get_client, _is_ai_enabled
    from app.ai.seo_prompts import (
        build_seo_description_prompt,
        build_seo_title_prompt,
        build_tags_prompt,
        parse_tags_from_ai_output,
    )

    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")

    if request.field not in _AI_META_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"field must be one of {_AI_META_FIELDS}",
        )

    article = repo.get(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    body_text = extract_body_text(article.content_json)
    if not body_text:
        raise HTTPException(
            status_code=400,
            detail="Article has no content to generate from",
        )

    if request.field == "seo_title":
        prompt = build_seo_title_prompt(article, body_text)
        max_length = 60
        result_format = "string"
    elif request.field == "seo_description":
        prompt = build_seo_description_prompt(article, body_text)
        max_length = 160
        result_format = "string"
    else:  # tags
        prompt = build_tags_prompt(article, body_text)
        max_length = None
        result_format = "list"

    client = _get_client()
    try:
        result = await client.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
        )
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    raw_text = (result.get("content") or "").strip()
    usage = result.get("usage", {}) or {}
    tokens_used = int(usage.get("total_tokens", 0) or 0)

    if tokens_used:
        article.ai_tokens_used = (article.ai_tokens_used or 0) + tokens_used
        repo.save(article)

    if result_format == "string":
        # Strip enclosing quotes the model often adds despite the
        # "no quotes" instruction.
        generated = raw_text.strip('"').strip("'").strip()
        if max_length:
            generated = generated[:max_length]
        return {"generated_text": generated, "tokens_used": tokens_used}

    return {
        "generated_tags": parse_tags_from_ai_output(raw_text),
        "tokens_used": tokens_used,
    }


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: str,
    repo: ArticleRepository = Depends(get_article_repository),
) -> None:
    """Move article to trash by default; hard-delete when
    ``app.delete_permanently`` is true in app.yaml.

    Trash mode (default):
        - Sets ``deleted_at`` to now. Article disappears from the
          default list endpoint until restored or permanently
          deleted via ``DELETE /trash/{id}``.

    Permanent mode (config opt-in):
        - Cascades publications + article-assets via SQLAlchemy FK
          ``ondelete="CASCADE"``; removes ``uploads/articles/{id}/``
          off disk first so a half-finished delete does not orphan
          files when the DB commit fails.

    Mirrors ``books.delete_book``; same ``delete_permanently``
    setting governs both entities so the user has one switch.
    """
    article = repo.get(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if is_permanent_delete():
        asset_dir = get_upload_dir() / "articles" / article_id
        if asset_dir.exists():
            try:
                shutil.rmtree(asset_dir)
            except OSError as exc:
                logger.warning("delete_article: could not remove %s: %s", asset_dir, exc)
        repo.delete(article)
    else:
        repo.soft_delete(article)
