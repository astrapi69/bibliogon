"""Regression pin for QA v0.44.0 Bug 2: a day's words_written must never
go negative when the user deletes text (net delta < 0).

record_progress floors deltas to 0 (gross words written, not net document
size); the day-series reads also floor defensively for legacy rows.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Book, WritingSession
from app.services.writing_stats import daily_global_series, recent_sessions, record_progress

DAY = date(2026, 6, 1)


@pytest.fixture
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


def test_record_progress_floors_negative_delta(db: Session):
    book = Book(title="B", author="A")
    db.add(book)
    db.flush()
    # Wrote 100, then a deletion-heavy save with net -60.
    record_progress(db, 100, book_id=book.id, chapter_id=None, day=DAY)
    db.flush()
    record_progress(db, -60, book_id=book.id, chapter_id=None, day=DAY)
    db.flush()
    row = (
        db.query(WritingSession)
        .filter(WritingSession.day == DAY, WritingSession.book_id == book.id)
        .one()
    )
    assert row.words_written == 100, "deletion must not decrement the day's words_written"


def test_pure_deletion_records_zero_not_negative(db: Session):
    book = Book(title="B2", author="A")
    db.add(book)
    db.flush()
    record_progress(db, -42, book_id=book.id, chapter_id=None, day=DAY)
    db.flush()
    row = (
        db.query(WritingSession)
        .filter(WritingSession.day == DAY, WritingSession.book_id == book.id)
        .one()
    )
    assert row.words_written == 0, "pure deletion still marks the active day at 0, never negative"


def test_day_series_never_negative_even_with_legacy_rows(db: Session):
    # Simulate a legacy negative row written before the clamp existed.
    book = Book(title="B3", author="A")
    db.add(book)
    db.flush()
    db.add(WritingSession(day=DAY, words_written=-25, book_id=book.id, chapter_id=None))
    db.flush()
    for series in (recent_sessions(db, 7), daily_global_series(db, 7, today=DAY)):
        for entry in series:
            assert entry.words_written >= 0, "widget day series must never be negative"
