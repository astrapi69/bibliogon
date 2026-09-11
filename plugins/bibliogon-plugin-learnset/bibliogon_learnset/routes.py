"""HTTP surface of the learnset plugin (single router, #763).

``GET /api/learnset/{book_id}/export`` streams the Phase-1 scaffold
ZIP (alc set layout, schema-validated). Route stays thin per the
error-handling architecture: services raise, the global handler maps.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import NotFoundError, ValidationError
from app.models import Book, Chapter
from bibliogon_learnset.scaffold import (
    DEFAULT_SKIP_CHAPTER_TYPES,
    ChapterInput,
    build_scaffold_zip,
    slugify_ascii,
)

router = APIRouter(prefix="/learnset", tags=["learnset"])

_plugin_config: dict[str, Any] = {}


def set_config(config: dict[str, Any]) -> None:
    """Receive the plugin config at activate() time (help-plugin pattern)."""
    _plugin_config.clear()
    _plugin_config.update(config or {})


def _skip_chapter_types() -> frozenset[str]:
    configured = (_plugin_config.get("settings") or {}).get("skip_chapter_types")
    if isinstance(configured, list) and configured:
        return frozenset(str(entry) for entry in configured)
    return DEFAULT_SKIP_CHAPTER_TYPES


def _chapter_markdown(chapter: Chapter) -> str:
    import json

    from bibliogon_export.tiptap_to_md import tiptap_to_markdown

    raw_content = chapter.content
    if not raw_content:
        return ""
    doc = json.loads(raw_content) if isinstance(raw_content, str) else raw_content
    if not isinstance(doc, dict):
        return ""
    return tiptap_to_markdown(doc)


@router.get("/{book_id}/export")
def export_learnset_scaffold(book_id: str, db: Session = Depends(get_db)) -> Response:
    """Build + download the schema-validated learnset scaffold ZIP."""
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if book is None:
        raise NotFoundError(f"Book {book_id} not found")

    chapter_rows = (
        db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.position).all()
    )
    chapters = [
        ChapterInput(
            title=row.title,
            chapter_type=str(getattr(row.chapter_type, "value", row.chapter_type) or "chapter"),
            markdown=_chapter_markdown(row),
        )
        for row in chapter_rows
    ]

    try:
        zip_bytes = build_scaffold_zip(book, chapters, skip_chapter_types=_skip_chapter_types())
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc

    filename = f"{slugify_ascii(book.title)}-learnset.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
