"""GET /api/book-types endpoint.

Exposes the BookTypeRegistry to the frontend so the SSoT lives
in ONE place (backend/config/book-types.yaml). The frontend's
useBookTypes() hook fetches this endpoint once on app mount + caches
in React context — mirrors the article-platforms pattern.

Filed by BOOK-TYPES-SSOT-YAML-01 (2026-05-24).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.services.book_type_registry import BookTypeDef, load_book_types

router = APIRouter(prefix="/book-types", tags=["book-types"])


@router.get("", response_model=dict[str, BookTypeDef])
def list_book_types() -> dict[str, BookTypeDef]:
    """Return the {id: BookTypeDef} mapping from book-types.yaml.

    Empty dict if the registry file is missing or malformed (the
    registry logs warnings + returns empty rather than crashing).
    """
    return load_book_types()
