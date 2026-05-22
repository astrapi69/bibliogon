"""Service module for BookPublishingState CRUD + upsert.

Keeps the DB-touching logic out of routes.py per the codebase
convention (routes thin, services own business logic). The
service functions take a pre-resolved ``Session`` so route
handlers stay testable without DB-mocking gymnastics.

JSON-as-Text encoding/decoding is done HERE on the way in/out so
callers (routes + tests) work with dicts. The DB column stays a
Text blob per the existing Bibliogon convention.

Pattern aligned with plugin-comics' panels.py + bubbles.py
service-like helpers; the difference is that publishing-state is
1:1 with Book (upsert) rather than a child collection.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Book, BookPublishingState


def _get_book_or_404(db: Session, book_id: str) -> Book:
    book = (
        db.query(Book)
        .filter(Book.id == book_id, Book.deleted_at.is_(None))
        .first()
    )
    if not book:
        raise HTTPException(
            status_code=404, detail=f"Book {book_id} not found"
        )
    return book


def get_publishing_state(
    db: Session, book_id: str
) -> BookPublishingState | None:
    """Return the ``BookPublishingState`` row for ``book_id``, or
    ``None`` if no row exists. The caller (route handler) handles
    the no-row case + returns a defaults response.
    """
    return (
        db.query(BookPublishingState)
        .filter(BookPublishingState.book_id == book_id)
        .first()
    )


def upsert_publishing_state(
    db: Session, book_id: str, payload: dict[str, Any]
) -> BookPublishingState:
    """Create-or-update the publishing-state row for ``book_id``.

    Validates the book exists + is not soft-deleted (raises 404).
    Applies the payload's non-None fields. JSON-shaped fields
    (``prices``, ``launch_checklist_state``) are JSON-encoded for
    storage; callers pass dicts.

    Commits the session before returning so the caller sees the
    persisted row (with auto-populated ``created_at`` /
    ``updated_at``).
    """
    _get_book_or_404(db, book_id)
    row = get_publishing_state(db, book_id)
    if row is None:
        row = BookPublishingState(book_id=book_id)
        db.add(row)

    # Apply payload fields. JSON-shaped values get encoded on the
    # way in; everything else is a direct attribute assignment.
    for key, value in payload.items():
        if value is None and key not in {"royalty_plan"}:
            # ``royalty_plan`` is explicitly nullable per the
            # Pydantic schema; other ``None`` values mean "not
            # provided in this PATCH" and skip.
            continue
        if key in {"prices", "launch_checklist_state"}:
            row.__setattr__(key, json.dumps(value or {}))
        else:
            row.__setattr__(key, value)

    db.commit()
    db.refresh(row)
    return row


def delete_publishing_state(db: Session, book_id: str) -> bool:
    """Hard-delete the publishing-state row + cascade ARC reviewers.

    Returns ``True`` if a row was deleted, ``False`` if no row
    existed. The Book itself is left intact.
    """
    row = get_publishing_state(db, book_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True
