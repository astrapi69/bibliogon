"""Comic-Panel CRUD routes for plugin-comics (Session 2 C2).

The routes live under ``/api/books/{book_id}/comic-pages/{page_id}/panels``
plus ``/api/books/{book_id}/comic-panels/{panel_id}`` so they sit
alongside picture-book's ``/pages`` namespace without colliding.
All panel operations gate on ``Book.book_type == "comic_book"``.

Per Session 1's sharing decision (README-documented), comic-book
pages live in the existing ``pages`` table with
``Book.book_type == "comic_book"`` as the discriminator. NO
``comic_pages`` table; the ``page_id`` FK from ``comic_panels``
points to ``pages.id`` directly.

Panel position assignment: server-side, append-to-end on create.
A future reorder endpoint mirrors PagesReorder's atomic-bulk
shape; out of scope here.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, ComicPanel, Page
from app.schemas import ComicPanelCreate, ComicPanelOut, ComicPanelUpdate


router = APIRouter(prefix="/books", tags=["comic-panels"])


def _get_comic_book_or_400(book_id: str, db: Session) -> Book:
    """Resolve the book + enforce the comic_book book_type gate.

    Raises 404 if missing/soft-deleted, 400 if not a comic_book.
    Mirrors the picture-book ``_get_picture_book_or_400`` shape so
    error messages stay consistent across the two plugins.
    """
    book = (
        db.query(Book)
        .filter(Book.id == book_id, Book.deleted_at.is_(None))
        .first()
    )
    if not book:
        raise HTTPException(
            status_code=404, detail=f"Book {book_id} not found"
        )
    if book.book_type != "comic_book":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Comic panels are only available on comic books "
                f"(book_type='comic_book'). Book {book_id} is "
                f"book_type='{book.book_type}'."
            ),
        )
    return book


def _get_comic_book_page_or_404(
    book_id: str, page_id: str, db: Session
) -> Page:
    """Resolve a Page that belongs to a comic_book Book. Used by
    the panel-list + panel-create routes (the panel-mutate routes
    look up panels directly by panel_id without re-validating the
    page since the FK relationship is enforced at the DB layer).
    """
    _get_comic_book_or_400(book_id, db)
    page = (
        db.query(Page)
        .filter(Page.id == page_id, Page.book_id == book_id)
        .first()
    )
    if not page:
        raise HTTPException(
            status_code=404,
            detail=f"Page {page_id} not found in book {book_id}",
        )
    return page


def _serialize_json_field(value: dict[str, Any] | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


@router.get(
    "/{book_id}/comic-pages/{page_id}/panels",
    response_model=list[ComicPanelOut],
)
def list_panels(
    book_id: str, page_id: str, db: Session = Depends(get_db)
) -> list[ComicPanel]:
    """List a comic-book page's panels ordered by position ascending."""
    _get_comic_book_page_or_404(book_id, page_id, db)
    return (
        db.query(ComicPanel)
        .filter(ComicPanel.page_id == page_id)
        .order_by(ComicPanel.position.asc())
        .all()
    )


@router.post(
    "/{book_id}/comic-pages/{page_id}/panels",
    response_model=ComicPanelOut,
    status_code=status.HTTP_201_CREATED,
)
def create_panel(
    book_id: str,
    page_id: str,
    payload: ComicPanelCreate,
    db: Session = Depends(get_db),
) -> ComicPanel:
    """Append a new panel to the page. Server-assigns position to
    ``max(existing_positions) + 1`` so authors don't have to think
    about position values.
    """
    _get_comic_book_page_or_404(book_id, page_id, db)
    max_pos = (
        db.query(func.max(ComicPanel.position))
        .filter(ComicPanel.page_id == page_id)
        .scalar()
    )
    next_position = (max_pos or 0) + 1
    panel = ComicPanel(
        page_id=page_id,
        position=next_position,
        image_asset_id=payload.image_asset_id,
        bounds=_serialize_json_field(payload.bounds) or "{}",
        panel_config=_serialize_json_field(payload.panel_config),
    )
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return panel


@router.patch(
    "/{book_id}/comic-panels/{panel_id}",
    response_model=ComicPanelOut,
)
def update_panel(
    book_id: str,
    panel_id: str,
    payload: ComicPanelUpdate,
    db: Session = Depends(get_db),
) -> ComicPanel:
    """Partial update on a comic-panel. The ``book_id`` is validated
    against the panel's page→book chain so a panel from book A
    cannot be mutated via book B's URL.
    """
    _get_comic_book_or_400(book_id, db)
    panel = (
        db.query(ComicPanel)
        .join(Page, ComicPanel.page_id == Page.id)
        .filter(ComicPanel.id == panel_id, Page.book_id == book_id)
        .first()
    )
    if not panel:
        raise HTTPException(
            status_code=404,
            detail=f"Comic panel {panel_id} not found in book {book_id}",
        )
    update_data = payload.model_dump(exclude_unset=True)
    if "bounds" in update_data:
        update_data["bounds"] = _serialize_json_field(update_data["bounds"]) or "{}"
    if "panel_config" in update_data:
        update_data["panel_config"] = _serialize_json_field(
            update_data["panel_config"]
        )
    for field, value in update_data.items():
        setattr(panel, field, value)
    db.commit()
    db.refresh(panel)
    return panel


@router.delete(
    "/{book_id}/comic-panels/{panel_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_panel(
    book_id: str, panel_id: str, db: Session = Depends(get_db)
) -> None:
    """Delete a comic-panel. CASCADE chain wipes its bubbles via the
    DB-level FK constraint.
    """
    _get_comic_book_or_400(book_id, db)
    panel = (
        db.query(ComicPanel)
        .join(Page, ComicPanel.page_id == Page.id)
        .filter(ComicPanel.id == panel_id, Page.book_id == book_id)
        .first()
    )
    if not panel:
        raise HTTPException(
            status_code=404,
            detail=f"Comic panel {panel_id} not found in book {book_id}",
        )
    db.delete(panel)
    db.commit()
