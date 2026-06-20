"""GET /api/content-types endpoint.

Exposes the ContentTypeRegistry to the frontend so the SSoT lives
in ONE place (backend/config/content-types.yaml). The frontend's
``useContentTypes()`` hook fetches this endpoint once on app mount
+ caches in React context — mirrors the ``useBookTypes()`` pattern.

Filed by ARTICLE-TYPES-SSOT-01 (2026-05-29).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.services.registries.content_type_registry import ContentTypeDef, load_content_types

router = APIRouter(prefix="/content-types", tags=["content-types"])


@router.get("", response_model=dict[str, ContentTypeDef])
def list_content_types() -> dict[str, ContentTypeDef]:
    """Return the {id: ContentTypeDef} mapping from content-types.yaml.

    Empty dict if the registry file is missing or malformed (the
    registry logs warnings + returns empty rather than crashing).
    """
    return load_content_types()
