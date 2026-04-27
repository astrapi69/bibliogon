"""AR-01 Phase 1 + AR-02 Phase 2: standalone Article CRUD.

Articles are long-form content distinct from Books. Single TipTap
document, minimal metadata, simple draft/published/archived
lifecycle. Phase 2 (AR-02) layered on canonical SEO fields and a
one-to-many relationship to :class:`Publication`; per-platform
publication CRUD lives in ``publications.py``.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Article
from app.schemas import ArticleCreate, ArticleOut, ArticleUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/articles", tags=["articles"])

_ALLOWED_STATUSES = ("draft", "published", "archived")


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
    """List articles, optionally filtered by status."""
    query = db.query(Article)
    if article_status is not None:
        if article_status not in _ALLOWED_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"status must be one of {_ALLOWED_STATUSES}",
            )
        query = query.filter(Article.status == article_status)
    return query.order_by(Article.updated_at.desc()).all()


@router.get("/{article_id}", response_model=ArticleOut)
def get_article(article_id: str, db: Session = Depends(get_db)) -> Article:
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


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(article_id: str, db: Session = Depends(get_db)) -> None:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    db.delete(article)
    db.commit()
