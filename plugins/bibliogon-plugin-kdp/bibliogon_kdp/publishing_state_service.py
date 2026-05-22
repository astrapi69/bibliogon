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

from app.models import ArcReviewer, Book, BookPublishingState


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


# --- ARC Reviewer service functions (C6) -------------------------


def _ensure_publishing_state(
    db: Session, book_id: str
) -> BookPublishingState:
    """Resolve the publishing-state row for ``book_id``, creating
    a default row if none exists. Used by reviewer-add so the user
    can manage reviewers without first touching the wizard's other
    steps (the publishing-state row is an internal concern).

    Raises 404 if the book itself doesn't exist (or is soft-
    deleted).
    """
    _get_book_or_404(db, book_id)
    row = get_publishing_state(db, book_id)
    if row is None:
        row = BookPublishingState(book_id=book_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def list_reviewers(db: Session, book_id: str) -> list[ArcReviewer]:
    """List ARC reviewers for ``book_id``.

    Returns ``[]`` when no publishing-state row exists yet (no
    reviewers can possibly be attached). Raises 404 on missing
    book.
    """
    _get_book_or_404(db, book_id)
    state = get_publishing_state(db, book_id)
    if state is None:
        return []
    return (
        db.query(ArcReviewer)
        .filter(ArcReviewer.publishing_state_id == state.id)
        .order_by(ArcReviewer.created_at.asc())
        .all()
    )


def create_reviewer(
    db: Session, book_id: str, payload: dict[str, Any]
) -> ArcReviewer:
    """Add a reviewer to the book's ARC list.

    Auto-creates the publishing-state row if absent (a new book
    can start in the ARC step). Server-assigns ``review_status
    ="invited"`` + ``invited_at=now``.
    """
    state = _ensure_publishing_state(db, book_id)
    from datetime import UTC, datetime as _dt

    reviewer = ArcReviewer(
        publishing_state_id=state.id,
        reviewer_name=payload["reviewer_name"],
        reviewer_email=payload.get("reviewer_email"),
        review_status="invited",
        invited_at=_dt.now(UTC),
    )
    db.add(reviewer)
    db.commit()
    db.refresh(reviewer)
    return reviewer


def _get_reviewer_or_404(
    db: Session, book_id: str, reviewer_id: str
) -> ArcReviewer:
    """Resolve a reviewer + validate it belongs to ``book_id``.

    Prevents cross-book mutation: a reviewer from book A cannot be
    edited via book B's URL.
    """
    _get_book_or_404(db, book_id)
    state = get_publishing_state(db, book_id)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail=f"Reviewer {reviewer_id} not found",
        )
    reviewer = (
        db.query(ArcReviewer)
        .filter(
            ArcReviewer.id == reviewer_id,
            ArcReviewer.publishing_state_id == state.id,
        )
        .first()
    )
    if reviewer is None:
        raise HTTPException(
            status_code=404,
            detail=f"Reviewer {reviewer_id} not found",
        )
    return reviewer


def update_reviewer(
    db: Session,
    book_id: str,
    reviewer_id: str,
    payload: dict[str, Any],
) -> ArcReviewer:
    """Partial update on an ARC reviewer.

    When ``review_status`` transitions to ``reviewed``, the
    service auto-stamps ``reviewed_at`` unless the payload
    explicitly provides one. Other fields are direct assignments.
    """
    reviewer = _get_reviewer_or_404(db, book_id, reviewer_id)
    from datetime import UTC, datetime as _dt

    new_status = payload.get("review_status")
    explicit_reviewed_at = payload.get("reviewed_at")

    for key, value in payload.items():
        if value is None and key not in {
            "copy_version",
            "review_permalink",
            "review_text_excerpt",
            "reviewed_at",
        }:
            # Skip absent fields; preserve existing nullables.
            continue
        reviewer.__setattr__(key, value)

    # Auto-stamp reviewed_at when status flips to "reviewed" and
    # the payload didn't supply one explicitly.
    if (
        new_status == "reviewed"
        and explicit_reviewed_at is None
        and reviewer.reviewed_at is None
    ):
        reviewer.reviewed_at = _dt.now(UTC)

    db.commit()
    db.refresh(reviewer)
    return reviewer


def delete_reviewer(
    db: Session, book_id: str, reviewer_id: str
) -> None:
    """Hard-delete an ARC reviewer.

    No soft-delete (per A25). 404 if the reviewer doesn't exist or
    belongs to a different book.
    """
    reviewer = _get_reviewer_or_404(db, book_id, reviewer_id)
    db.delete(reviewer)
    db.commit()
