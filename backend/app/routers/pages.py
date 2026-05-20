"""Pages CRUD routes (backend core).

The routes live under ``/api/books/{book_id}/pages`` so they sit
alongside the existing per-book subresources (``/chapters``,
``/assets``, ``/audiobook``). All page operations gate on
``book.book_type IN {"picture_book", "comic_book"}`` — both
page-based book types share this single CRUD surface against the
core ``pages`` table.

Originally shipped inside plugin-kinderbuch (PB-PHASE4 Session 2);
relocated to backend core in PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01
once Session-1 of plugin-comics established that comic-book pages
reuse the same ``pages`` table. The Page model and Page schemas
already lived in core; the router followed.

Per the data-model section of the picture-book exploration: a
page-based book has zero Chapter rows and N Page rows. Page 1 is
the cover (no separate Cover entity). Comic-book pages add panel +
bubble subresources owned by plugin-comics; picture-book pages
render their content directly from the Page row.
"""

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Page
from app.schemas import PageCreate, PageOut, PagesReorder, PageUpdate

router = APIRouter(prefix="/books", tags=["pages"])


PAGEABLE_BOOK_TYPES: frozenset[str] = frozenset({"picture_book", "comic_book"})


def _get_pageable_book_or_400(book_id: str, db: Session) -> Book:
    """Resolve the book and enforce the page-based book_type gate.

    Returns the Book row when it exists, is not soft-deleted, and is
    one of the page-based book types (``picture_book`` or
    ``comic_book``). Otherwise raises:
      - 404 if the book does not exist or is soft-deleted.
      - 400 if the book is prose (or any future non-page-based type).
    """
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    if book.book_type not in PAGEABLE_BOOK_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Pages are only available on page-based book types "
                f"(book_type IN {sorted(PAGEABLE_BOOK_TYPES)}). Book "
                f"{book_id} is book_type='{book.book_type}'."
            ),
        )
    return book


def _serialize_layout_config(config: dict[str, Any] | None) -> str | None:
    """Encode the dict for the JSON-as-Text DB column.

    Renamed from _serialize_speech_bubble_config in PB-PHASE4
    Session 4c when the column was generalized beyond Layout-A.
    """
    if config is None:
        return None
    return json.dumps(config)


@router.get("/{book_id}/pages", response_model=list[PageOut])
def list_pages(book_id: str, db: Session = Depends(get_db)) -> list[Page]:
    """List a book's pages ordered by position ascending."""
    _get_pageable_book_or_400(book_id, db)
    return (
        db.query(Page)
        .filter(Page.book_id == book_id)
        .order_by(Page.position.asc())
        .all()
    )


@router.post(
    "/{book_id}/pages",
    response_model=PageOut,
    status_code=status.HTTP_201_CREATED,
)
def create_page(book_id: str, payload: PageCreate, db: Session = Depends(get_db)) -> Page:
    """Append a new page to the end of a book.

    Position is the (max existing position + 1), or 1 if the book has
    no pages yet. Use POST .../reorder to move pages after creation.
    """
    _get_pageable_book_or_400(book_id, db)
    max_pos = (
        db.query(Page.position)
        .filter(Page.book_id == book_id)
        .order_by(Page.position.desc())
        .first()
    )
    next_position = (max_pos[0] + 1) if max_pos else 1
    page = Page(
        book_id=book_id,
        position=next_position,
        layout=payload.layout,
        text_content=payload.text_content,
        image_asset_id=payload.image_asset_id,
        layout_config=_serialize_layout_config(payload.layout_config),
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return page


@router.patch("/{book_id}/pages/{page_id}", response_model=PageOut)
def update_page(
    book_id: str,
    page_id: str,
    payload: PageUpdate,
    db: Session = Depends(get_db),
) -> Page:
    """Update a page's layout / text / image / bubble config.

    Position is NOT mutable here. Use POST .../reorder for position
    changes so the entire reorder runs in one atomic transaction.
    """
    _get_pageable_book_or_400(book_id, db)
    page = db.query(Page).filter(Page.id == page_id, Page.book_id == book_id).first()
    if not page:
        raise HTTPException(status_code=404, detail=f"Page {page_id} not found")
    update_data = payload.model_dump(exclude_unset=True)
    if "layout_config" in update_data:
        update_data["layout_config"] = _serialize_layout_config(
            update_data["layout_config"]
        )
    for key, value in update_data.items():
        setattr(page, key, value)
    db.commit()
    db.refresh(page)
    return page


@router.delete("/{book_id}/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_page(
    book_id: str,
    page_id: str,
    db: Session = Depends(get_db),
) -> None:
    """Delete a page and shift remaining pages' positions down.

    Positions in the book remain dense (1, 2, 3, ...) after delete.
    Runs in one transaction so a partial failure leaves no rows
    half-reordered.
    """
    _get_pageable_book_or_400(book_id, db)
    page = db.query(Page).filter(Page.id == page_id, Page.book_id == book_id).first()
    if not page:
        raise HTTPException(status_code=404, detail=f"Page {page_id} not found")
    deleted_position = page.position
    db.delete(page)
    # Shift every page after the deleted one down by 1.
    db.query(Page).filter(
        Page.book_id == book_id, Page.position > deleted_position
    ).update({Page.position: Page.position - 1}, synchronize_session=False)
    db.commit()


@router.post("/{book_id}/pages/reorder", response_model=list[PageOut])
def reorder_pages(
    book_id: str,
    payload: PagesReorder,
    db: Session = Depends(get_db),
) -> list[Page]:
    """Apply a new order to the book's pages in a single transaction.

    payload.page_ids must contain exactly the book's current page IDs
    (any missing or extra id is a 400; this catches stale clients
    that submit a reorder against an out-of-date page set).
    """
    _get_pageable_book_or_400(book_id, db)
    pages = db.query(Page).filter(Page.book_id == book_id).all()
    existing_ids = {p.id for p in pages}
    requested_ids = set(payload.page_ids)
    if existing_ids != requested_ids:
        missing = sorted(existing_ids - requested_ids)
        extra = sorted(requested_ids - existing_ids)
        raise HTTPException(
            status_code=400,
            detail=(
                f"Reorder payload does not match the book's pages. "
                f"Missing: {missing or 'none'}; unknown: {extra or 'none'}."
            ),
        )
    # Two-phase position update to avoid colliding with a future
    # UNIQUE-on-(book_id, position) constraint. Phase 1: bump every
    # row to a position outside the visible range. Phase 2: apply the
    # target positions in the requested order.
    pages_by_id = {p.id: p for p in pages}
    sentinel_base = len(pages) + 1000
    for offset, page in enumerate(pages, start=1):
        page.position = sentinel_base + offset
    db.flush()
    for new_position, page_id in enumerate(payload.page_ids, start=1):
        pages_by_id[page_id].position = new_position
    db.commit()
    return (
        db.query(Page)
        .filter(Page.book_id == book_id)
        .order_by(Page.position.asc())
        .all()
    )
