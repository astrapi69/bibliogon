"""Comic-Bubble CRUD routes for plugin-comics (Session 2 C2).

The routes live under
``/api/books/{book_id}/comic-panels/{panel_id}/bubbles`` for
create + list and ``/api/books/{book_id}/comic-bubbles/{bubble_id}``
for mutate. All operations gate on
``Book.book_type == "comic_book"`` plus FK chain validation
(bubble → panel → page → book).

Bubble position assignment: server-side, append-to-end on create.
``position`` doubles as initial z-order; Session 3 adds an
explicit ``z_order`` column + drag-to-front/back controls.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, ComicBubble, ComicPanel, Page
from app.schemas import (
    ComicBubbleCreate,
    ComicBubbleOut,
    ComicBubbleUpdate,
)


router = APIRouter(prefix="/books", tags=["comic-bubbles"])


def _get_comic_book_or_400(book_id: str, db: Session) -> Book:
    """Resolve the book + enforce the comic_book book_type gate.
    Duplicated here to avoid panels.py ↔ bubbles.py import cycle;
    same semantics as panels.py._get_comic_book_or_400.
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
                f"Comic bubbles are only available on comic books "
                f"(book_type='comic_book'). Book {book_id} is "
                f"book_type='{book.book_type}'."
            ),
        )
    return book


def _get_panel_in_book_or_404(
    book_id: str, panel_id: str, db: Session
) -> ComicPanel:
    """Resolve a ComicPanel that belongs to the given comic_book.
    Joins through pages to enforce the panel → page → book chain.
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
    return panel


def _serialize_json_field(value: dict[str, Any] | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


@router.post(
    "/{book_id}/comic-panels/{panel_id}/bubbles",
    response_model=ComicBubbleOut,
    status_code=status.HTTP_201_CREATED,
)
def create_bubble(
    book_id: str,
    panel_id: str,
    payload: ComicBubbleCreate,
    db: Session = Depends(get_db),
) -> ComicBubble:
    """Append a new bubble to the panel. Server-assigns position
    (initial z-order).
    """
    _get_panel_in_book_or_404(book_id, panel_id, db)
    max_pos = (
        db.query(func.max(ComicBubble.position))
        .filter(ComicBubble.panel_id == panel_id)
        .scalar()
    )
    next_position = (max_pos or 0) + 1
    bubble = ComicBubble(
        panel_id=panel_id,
        position=next_position,
        bubble_type=payload.bubble_type,
        anchor=_serialize_json_field(payload.anchor) or "{}",
        width_pct=payload.width_pct,
        height_pct=payload.height_pct,
        tail_direction=payload.tail_direction,
        tail_position_pct=payload.tail_position_pct,
        tail_length_px=payload.tail_length_px,
        bubble_config=_serialize_json_field(payload.bubble_config),
        text_content=payload.text_content,
    )
    db.add(bubble)
    db.commit()
    db.refresh(bubble)
    return bubble


@router.patch(
    "/{book_id}/comic-bubbles/{bubble_id}",
    response_model=ComicBubbleOut,
)
def update_bubble(
    book_id: str,
    bubble_id: str,
    payload: ComicBubbleUpdate,
    db: Session = Depends(get_db),
) -> ComicBubble:
    """Partial update on a comic-bubble. Validates the bubble →
    panel → page → book chain so a bubble from book A can't be
    mutated via book B's URL.
    """
    _get_comic_book_or_400(book_id, db)
    bubble = (
        db.query(ComicBubble)
        .join(ComicPanel, ComicBubble.panel_id == ComicPanel.id)
        .join(Page, ComicPanel.page_id == Page.id)
        .filter(ComicBubble.id == bubble_id, Page.book_id == book_id)
        .first()
    )
    if not bubble:
        raise HTTPException(
            status_code=404,
            detail=f"Comic bubble {bubble_id} not found in book {book_id}",
        )
    update_data = payload.model_dump(exclude_unset=True)
    if "anchor" in update_data:
        update_data["anchor"] = _serialize_json_field(update_data["anchor"]) or "{}"
    if "bubble_config" in update_data:
        update_data["bubble_config"] = _serialize_json_field(
            update_data["bubble_config"]
        )
    for field, value in update_data.items():
        setattr(bubble, field, value)
    db.commit()
    db.refresh(bubble)
    return bubble


@router.delete(
    "/{book_id}/comic-bubbles/{bubble_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_bubble(
    book_id: str, bubble_id: str, db: Session = Depends(get_db)
) -> None:
    """Delete a comic-bubble."""
    _get_comic_book_or_400(book_id, db)
    bubble = (
        db.query(ComicBubble)
        .join(ComicPanel, ComicBubble.panel_id == ComicPanel.id)
        .join(Page, ComicPanel.page_id == Page.id)
        .filter(ComicBubble.id == bubble_id, Page.book_id == book_id)
        .first()
    )
    if not bubble:
        raise HTTPException(
            status_code=404,
            detail=f"Comic bubble {bubble_id} not found in book {book_id}",
        )
    db.delete(bubble)
    db.commit()
