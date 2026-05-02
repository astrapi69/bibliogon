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
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import Article
from app.schemas import ArticleCreate, ArticleOut, ArticleUpdate
from app.paths import get_upload_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/articles", tags=["articles"])

_ALLOWED_STATUSES = ("draft", "ready", "published", "archived")


# --- Auto-cleanup of expired trash (mirrors books.cleanup_expired_trash) ---


def _is_permanent_delete() -> bool:
    """Mirror the books behaviour: when ``app.delete_permanently`` is
    true in app.yaml, the DELETE endpoint hard-deletes the article
    instead of moving it to the trash. Same setting governs both
    entities so the user has one switch."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    config_path = base_dir / "config" / "app.yaml"
    if not config_path.exists():
        return False
    try:
        import yaml

        with open(config_path, encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        return bool(cfg.get("app", {}).get("delete_permanently", False))
    except Exception:
        return False


def _trash_auto_delete_config() -> tuple[bool, int]:
    """Read the same ``trash_auto_delete_*`` knobs the books cleanup
    consults. Articles share one switch with books because the user
    sets it once for the whole trash."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    config_path = base_dir / "config" / "app.yaml"
    if not config_path.exists():
        return False, 30
    try:
        import yaml

        with open(config_path, encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        app = cfg.get("app", {})
        return bool(app.get("trash_auto_delete_enabled", False)), int(
            app.get("trash_auto_delete_days", 30)
        )
    except Exception:
        return False, 30


def cleanup_expired_article_trash() -> int:
    """Permanently delete articles older than the configured trash-
    auto-delete window. Mirrors ``books.cleanup_expired_trash``;
    invoked from the FastAPI lifespan startup hook."""
    enabled, days = _trash_auto_delete_config()
    if not enabled or days <= 0:
        return 0
    cutoff = datetime.now(UTC) - timedelta(days=days)
    db: Session = SessionLocal()
    count = 0
    try:
        expired = (
            db.query(Article)
            .filter(Article.deleted_at.is_not(None), Article.deleted_at < cutoff)
            .all()
        )
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
            db.delete(article)
            count += 1
        if count:
            db.commit()
            logger.info(
                "Auto-deleted %d expired article trash items (older than %d days)",
                count,
                days,
            )
    finally:
        db.close()
    return count


@router.post("", response_model=ArticleOut, status_code=status.HTTP_201_CREATED)
def create_article(payload: ArticleCreate, db: Session = Depends(get_db)) -> Article:
    """Create a draft article. ``status`` always starts at ``draft`` -
    publish via PATCH after the user is happy with the content."""
    article = Article(
        title=payload.title,
        subtitle=payload.subtitle,
        author=payload.author,
        language=payload.language,
        # content_json defaults to "" via the column server_default;
        # the editor populates it on first save.
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@router.get("", response_model=list[ArticleOut])
def list_articles(
    article_status: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> list[Article]:
    """List live articles, optionally filtered by status.

    Trashed articles (``deleted_at IS NOT NULL``) are excluded -
    callers reach the trash via ``GET /articles/trash/list``.
    """
    query = db.query(Article).filter(Article.deleted_at.is_(None))
    if article_status is not None:
        if article_status not in _ALLOWED_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"status must be one of {_ALLOWED_STATUSES}",
            )
        query = query.filter(Article.status == article_status)
    return query.order_by(Article.updated_at.desc()).all()


# --- Trash ---
#
# Routes registered before ``GET /{article_id}`` so the path-param
# match does not eat the literal ``/trash/list`` segment.


@router.get("/trash/list", response_model=list[ArticleOut])
def list_trashed_articles(db: Session = Depends(get_db)) -> list[Article]:
    """List every article currently in the trash, newest first."""
    return (
        db.query(Article)
        .filter(Article.deleted_at.is_not(None))
        .order_by(Article.deleted_at.desc())
        .all()
    )


@router.post("/trash/{article_id}/restore", response_model=ArticleOut)
def restore_article(article_id: str, db: Session = Depends(get_db)) -> Article:
    """Restore a trashed article. 404 when the id is unknown OR not
    in the trash."""
    article = (
        db.query(Article).filter(Article.id == article_id, Article.deleted_at.is_not(None)).first()
    )
    if not article:
        raise HTTPException(status_code=404, detail="Article not found in trash")
    article.deleted_at = None
    db.commit()
    db.refresh(article)
    return article


@router.delete("/trash/empty", status_code=status.HTTP_204_NO_CONTENT)
def empty_article_trash(db: Session = Depends(get_db)) -> None:
    """Permanently delete every article currently in the trash."""
    expired = db.query(Article).filter(Article.deleted_at.is_not(None)).all()
    for article in expired:
        asset_dir = get_upload_dir() / "articles" / article.id
        if asset_dir.exists():
            try:
                shutil.rmtree(asset_dir)
            except OSError as exc:
                logger.warning("empty_article_trash: rmtree %s failed: %s", asset_dir, exc)
        db.delete(article)
    db.commit()


@router.delete("/trash/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def permanent_delete_article(article_id: str, db: Session = Depends(get_db)) -> None:
    """Permanently remove a single article from the trash + its
    on-disk assets. 404 when the id is not in the trash."""
    article = (
        db.query(Article).filter(Article.id == article_id, Article.deleted_at.is_not(None)).first()
    )
    if not article:
        raise HTTPException(status_code=404, detail="Article not found in trash")
    asset_dir = get_upload_dir() / "articles" / article_id
    if asset_dir.exists():
        try:
            shutil.rmtree(asset_dir)
        except OSError as exc:
            logger.warning("permanent_delete_article: rmtree %s failed: %s", asset_dir, exc)
    db.delete(article)
    db.commit()


@router.get("/{article_id}", response_model=ArticleOut)
def get_article(article_id: str, db: Session = Depends(get_db)) -> Article:
    """Get an article by id. Returns trashed articles too so the
    editor's restore-via-direct-url flow keeps working; the front-
    end's article list filters trashed entries out."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.patch("/{article_id}", response_model=ArticleOut)
def update_article(
    article_id: str, payload: ArticleUpdate, db: Session = Depends(get_db)
) -> Article:
    """Partial update. Only fields present in the body are written.

    The TipTap editor's auto-save flow lands here with
    ``content_json`` set; the metadata sidebar lands here with
    ``title`` / ``subtitle`` / ``author`` / ``language`` /
    ``status``. Same endpoint serves both shapes.
    """
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    updates = payload.model_dump(exclude_unset=True)
    # tags is exposed as list[str] on the API but stored as JSON-text
    # to match Article.content_json + Book.keywords convention. Encode
    # before assignment.
    if "tags" in updates and updates["tags"] is not None:
        updates["tags"] = json.dumps(updates["tags"])
    for key, value in updates.items():
        setattr(article, key, value)
    db.commit()
    db.refresh(article)
    return article


# --- AI metadata generation (SEO title / SEO description / tags) ---


def _extract_plain_text(tiptap_json: str | None) -> str:
    """Walk a serialised TipTap doc string-tree and return concatenated
    plain text. Mirrors what the audiobook generator's
    ``extract_plain_text`` helper does but stays local to avoid a
    plugin import inside core. Returns ``""`` on parse failure so the
    caller can decide what "empty" means."""
    if not tiptap_json:
        return ""
    try:
        doc = json.loads(tiptap_json)
    except (ValueError, TypeError):
        return ""

    parts: list[str] = []

    def walk(node: object) -> None:
        if not isinstance(node, dict):
            return
        text = node.get("text")
        if isinstance(text, str):
            parts.append(text)
        children = node.get("content")
        if isinstance(children, list):
            for child in children:
                walk(child)

    walk(doc)
    return "\n".join(p for p in parts if p).strip()


_AI_META_FIELDS = ("seo_title", "seo_description", "tags")


class _GenerateMetaRequest(BaseModel):
    field: str = Field(..., description="One of: seo_title, seo_description, tags")
    provider: str | None = None


@router.post("/{article_id}/ai/generate-meta")
async def generate_article_meta(
    article_id: str,
    request: _GenerateMetaRequest,
    db: Session = Depends(get_db),
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

    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    body_text = _extract_plain_text(article.content_json)
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
        db.add(article)
        db.commit()

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
def delete_article(article_id: str, db: Session = Depends(get_db)) -> None:
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
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if _is_permanent_delete():
        asset_dir = get_upload_dir() / "articles" / article_id
        if asset_dir.exists():
            try:
                shutil.rmtree(asset_dir)
            except OSError as exc:
                logger.warning("delete_article: could not remove %s: %s", asset_dir, exc)
        db.delete(article)
    else:
        article.deleted_at = datetime.now(UTC)
    db.commit()
