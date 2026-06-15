"""DB data loaders for the export pipeline.

Load + serialize Book / Chapter / Page / ComicPanel / ComicBubble rows for
the rendering pipeline. The only export module that touches the DB; it does
so through the injected dependencies in :mod:`.deps` (configured by
``ExportPlugin.activate()``).
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from . import deps
from .serializers import (
    _serialize_book,
    _serialize_chapters,
    _serialize_comic_bubble,
    _serialize_comic_panel,
    _serialize_page,
)


def _load_book(book_id: str) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Load book, chapters, and assets from DB."""
    db_gen, db = deps._require_db()
    try:
        return _query_book_data(book_id, db)
    finally:
        deps._close_db(db_gen)


def _load_picture_book_pages(
    book_id: str,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Load picture-book data for the WeasyPrint generator.

    Returns ``(book_data, pages, assets)`` mirroring ``_load_book``'s
    shape but with pages (position-ordered) instead of chapters AND
    asset entries that include ``id`` (so the generator can match
    ``Page.image_asset_id`` to the asset list). The existing
    ``_load_book`` does NOT include ``id`` in its asset serialization
    because the chapter-based pipeline references assets by filename;
    keeping the two loaders separate avoids touching the prose path.

    Raises HTTPException 404 if the book does not exist, or 400 if
    the book's content discriminator is not ``picture_book`` (i.e.
    the dispatch above wrongly routed a prose book here).
    """
    from app.models import Asset, Page

    db_gen, db = deps._require_db()
    try:
        if deps._book_model is None:
            raise HTTPException(
                status_code=500,
                detail="Export plugin not properly configured",
            )
        Book = deps._book_model
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        content_type = getattr(book, "book_type", "prose")
        if content_type != "picture_book":
            raise HTTPException(
                status_code=400,
                detail=(f"Book {book_id} is not a picture book (book_type={content_type!r})"),
            )
        book_data = _serialize_book(book)
        pages = db.query(Page).filter(Page.book_id == book_id).order_by(Page.position.asc()).all()
        pages_data = [_serialize_page(p) for p in pages]
        assets_data = [
            {
                "id": a.id,
                "filename": a.filename,
                "asset_type": a.asset_type,
                "path": a.path,
            }
            for a in db.query(Asset).filter(Asset.book_id == book_id).all()
        ]
        return book_data, pages_data, assets_data
    finally:
        deps._close_db(db_gen)


def _load_comic_book_data(
    book_id: str,
) -> tuple[
    dict[str, Any],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    """Load comic-book data for the comic-book PDF walker.

    Comic-book Session 1 sharing decision: comic pages live in the
    existing ``pages`` table (Book.book_type discriminator). Session
    2 adds ``comic_panels`` (page_id FK) + ``comic_bubbles``
    (panel_id FK) plugin-owned tables.

    Returns ``(book_data, pages, panels, bubbles, assets)``. All four
    list shapes match their respective ``XxxOut`` Pydantic schemas
    so the comic_book_pdf walker can consume them directly without
    additional ORM coupling.

    Raises HTTPException 404 if the book does not exist, or 400 if
    the book is not a comic_book.
    """
    from app.models import Asset, ComicBubble, ComicPanel, Page

    db_gen, db = deps._require_db()
    try:
        if deps._book_model is None:
            raise HTTPException(
                status_code=500,
                detail="Export plugin not properly configured",
            )
        Book = deps._book_model
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        content_type = getattr(book, "book_type", "prose")
        if content_type != "comic_book":
            raise HTTPException(
                status_code=400,
                detail=(f"Book {book_id} is not a comic book (book_type={content_type!r})"),
            )
        book_data = _serialize_book(book)
        pages = db.query(Page).filter(Page.book_id == book_id).order_by(Page.position.asc()).all()
        pages_data = [_serialize_page(p) for p in pages]
        page_ids = [p.id for p in pages]
        if page_ids:
            panels = (
                db.query(ComicPanel)
                .filter(ComicPanel.page_id.in_(page_ids))
                .order_by(ComicPanel.position.asc())
                .all()
            )
        else:
            panels = []
        panel_ids = [p.id for p in panels]
        if panel_ids:
            bubbles = (
                db.query(ComicBubble)
                .filter(ComicBubble.panel_id.in_(panel_ids))
                .order_by(ComicBubble.position.asc())
                .all()
            )
        else:
            bubbles = []
        panels_data = [_serialize_comic_panel(p) for p in panels]
        bubbles_data = [_serialize_comic_bubble(b) for b in bubbles]
        assets_data = [
            {
                "id": a.id,
                "filename": a.filename,
                "asset_type": a.asset_type,
                "path": a.path,
            }
            for a in db.query(Asset).filter(Asset.book_id == book_id).all()
        ]
        return book_data, pages_data, panels_data, bubbles_data, assets_data
    finally:
        deps._close_db(db_gen)


def _load_book_overwrite_flag(book_id: str) -> bool:
    """Read only the ``audiobook_overwrite_existing`` column for one book.

    Used by the pre-flight 409 check so we do not pay the cost of loading
    the full book + chapters just to decide whether to skip the warning.
    Returns False when the column or the book is missing.
    """
    if deps._book_model is None:
        return False
    db_gen, db = deps._require_db()
    try:
        Book = deps._book_model
        book = db.query(Book).filter(Book.id == book_id).first()
        if book is None:
            return False
        return bool(getattr(book, "audiobook_overwrite_existing", False))
    finally:
        deps._close_db(db_gen)


def _query_book_data(
    book_id: str, db: Any
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Query book data from DB and return as dicts."""
    from sqlalchemy.orm import joinedload

    from app.models import Asset

    if deps._book_model is None:
        raise HTTPException(status_code=500, detail="Export plugin not properly configured")

    Book = deps._book_model
    book = db.query(Book).options(joinedload(Book.chapters)).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    book_data = _serialize_book(book)
    chapters_data = _serialize_chapters(book.chapters)
    assets_data = [
        {"filename": a.filename, "asset_type": a.asset_type, "path": a.path}
        for a in db.query(Asset).filter(Asset.book_id == book_id).all()
    ]
    return book_data, chapters_data, assets_data
