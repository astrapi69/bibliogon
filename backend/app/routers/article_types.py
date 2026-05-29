"""GET /api/article-types endpoint.

Exposes the ArticleTypeRegistry to the frontend so the SSoT lives
in ONE place (backend/config/article-types.yaml). The frontend's
``useArticleTypes()`` hook fetches this endpoint once on app mount
+ caches in React context — mirrors the ``useBookTypes()`` pattern.

Filed by ARTICLE-TYPES-SSOT-01 (2026-05-29).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.services.article_type_registry import ArticleTypeDef, load_article_types

router = APIRouter(prefix="/article-types", tags=["article-types"])


@router.get("", response_model=dict[str, ArticleTypeDef])
def list_article_types() -> dict[str, ArticleTypeDef]:
    """Return the {id: ArticleTypeDef} mapping from article-types.yaml.

    Empty dict if the registry file is missing or malformed (the
    registry logs warnings + returns empty rather than crashing).
    """
    return load_article_types()
