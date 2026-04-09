"""HTTP endpoints for the per-book cover image upload."""

from typing import Any

from fastapi import APIRouter, Depends, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.covers import (
    ALLOWED_EXTENSIONS,
    MAX_COVER_BYTES,
    delete_cover,
    upload_cover,
)

router = APIRouter(prefix="/books/{book_id}/cover", tags=["covers"])


@router.post("", status_code=status.HTTP_201_CREATED)
def upload_book_cover(
    book_id: str,
    file: UploadFile,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Upload (or replace) the cover image for a book.

    Validation: extension whitelist, 10 MB cap, Pillow image format check.
    Stores under ``uploads/{book_id}/cover/`` and updates ``book.cover_image``.
    """
    result = upload_cover(db, book_id, file)
    return {
        "cover_image": result.relative_path,
        "filename": result.filename,
        "width": result.width,
        "height": result.height,
        "aspect_ratio": result.aspect_ratio,
        "size_bytes": result.size_bytes,
    }


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_book_cover(book_id: str, db: Session = Depends(get_db)) -> None:
    """Remove the cover image and clear ``book.cover_image``."""
    delete_cover(db, book_id)


@router.get("/limits")
def cover_limits() -> dict[str, Any]:
    """Static metadata so the frontend can show the same caps the backend enforces."""
    return {
        "allowed_extensions": sorted(ALLOWED_EXTENSIONS),
        "max_bytes": MAX_COVER_BYTES,
        "max_mb": MAX_COVER_BYTES // (1024 * 1024),
    }
