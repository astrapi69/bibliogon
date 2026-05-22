"""Tests for BookPublishingState + ArcReviewer SQLAlchemy models
(KDP Publishing Wizard Phase 2 C4).

Coverage scope:
- Table creation reachable via Base.metadata (Alembic migration
  rf7a8b9cd0e1_add_kdp_publishing_state_and_arc_reviewers.py).
- Field defaults (kdp_select_enrolled=False, expanded_distribution
  =False, prices="{}", launch_checklist_state="{}",
  review_status="invited" per migration server_default).
- 1:1 enforcement via UNIQUE(book_id) — second insertion against
  the same book must raise IntegrityError.
- CASCADE chain: book → book_publishing_state → arc_reviewers.
  Hard-deleting a book cascades through both tables.
- Repr formatting (small but pinned so downstream debugging stays
  predictable).
"""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import ArcReviewer, Book, BookPublishingState


def _make_book(session, title: str = "Test Book") -> Book:
    book = Book(title=title, author="Author", book_type="prose")
    session.add(book)
    session.flush()
    return book


def test_creates_publishing_state_with_defaults() -> None:
    """Insert a BookPublishingState row with only required fields;
    defaults from the migration's server_default values populate
    the rest."""
    with SessionLocal() as session:
        book = _make_book(session)
        state = BookPublishingState(book_id=book.id)
        session.add(state)
        session.flush()
        session.refresh(state)
        assert state.id
        assert state.book_id == book.id
        assert state.royalty_plan is None
        assert state.kdp_select_enrolled is False
        assert state.kdp_select_enrollment_date is None
        assert state.expanded_distribution is False
        assert state.prices == "{}"
        assert state.launch_checklist_state == "{}"
        assert state.publication_target_date is None
        assert state.last_kdp_upload_at is None
        assert state.created_at is not None
        assert state.updated_at is not None


def test_unique_constraint_enforces_one_state_per_book() -> None:
    """The 1:1 contract is enforced at the DB layer via
    UNIQUE(book_id). A second insert against the same book must
    raise IntegrityError."""
    with SessionLocal() as session:
        book = _make_book(session)
        session.add(BookPublishingState(book_id=book.id))
        session.flush()
        session.add(BookPublishingState(book_id=book.id))
        with pytest.raises(IntegrityError):
            session.flush()


def test_cascade_chain_book_to_publishing_state_to_reviewers() -> None:
    """Hard-deleting a Book cascades through BookPublishingState
    and ArcReviewer per the FK ondelete=CASCADE chain."""
    with SessionLocal() as session:
        book = _make_book(session)
        state = BookPublishingState(book_id=book.id)
        session.add(state)
        session.flush()
        reviewer = ArcReviewer(
            publishing_state_id=state.id,
            reviewer_name="Reviewer A",
            reviewer_email="a@example.com",
        )
        session.add(reviewer)
        session.flush()

        state_id = state.id
        reviewer_id = reviewer.id

        session.delete(book)
        session.flush()

        # Both children must be gone.
        assert (
            session.query(BookPublishingState)
            .filter_by(id=state_id)
            .one_or_none()
        ) is None
        assert (
            session.query(ArcReviewer)
            .filter_by(id=reviewer_id)
            .one_or_none()
        ) is None


def test_arc_reviewer_defaults() -> None:
    """ArcReviewer insertions with only the required fields pick
    up review_status='invited' + nullable optional fields."""
    with SessionLocal() as session:
        book = _make_book(session)
        state = BookPublishingState(book_id=book.id)
        session.add(state)
        session.flush()
        reviewer = ArcReviewer(
            publishing_state_id=state.id,
            reviewer_name="Reviewer B",
        )
        session.add(reviewer)
        session.flush()
        session.refresh(reviewer)
        assert reviewer.id
        assert reviewer.reviewer_email is None
        assert reviewer.review_status == "invited"
        assert reviewer.copy_version is None
        assert reviewer.review_permalink is None
        assert reviewer.review_text_excerpt is None
        assert reviewer.invited_at is None
        assert reviewer.reviewed_at is None


def test_multiple_reviewers_per_publishing_state() -> None:
    """ArcReviewer is N:1 with BookPublishingState — multiple
    reviewers attach to the same publishing-state row."""
    with SessionLocal() as session:
        book = _make_book(session)
        state = BookPublishingState(book_id=book.id)
        session.add(state)
        session.flush()
        for i in range(3):
            session.add(
                ArcReviewer(
                    publishing_state_id=state.id,
                    reviewer_name=f"Reviewer {i}",
                )
            )
        session.flush()
        session.refresh(state)
        assert len(state.arc_reviewers) == 3
        names = sorted(r.reviewer_name for r in state.arc_reviewers)
        assert names == ["Reviewer 0", "Reviewer 1", "Reviewer 2"]


def test_repr_includes_key_fields() -> None:
    """Repr formatting for diagnostic output."""
    with SessionLocal() as session:
        book = _make_book(session)
        state = BookPublishingState(book_id=book.id, royalty_plan="70")
        session.add(state)
        session.flush()
        assert "BookPublishingState" in repr(state)
        assert "royalty_plan='70'" in repr(state)

        reviewer = ArcReviewer(
            publishing_state_id=state.id,
            reviewer_name="X",
        )
        session.add(reviewer)
        session.flush()
        assert "ArcReviewer" in repr(reviewer)
        assert "name='X'" in repr(reviewer)
        assert "status='invited'" in repr(reviewer)
