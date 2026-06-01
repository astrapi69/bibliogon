"""Coverage for the Writing-History stats layer (WRITING-HISTORY-STATS-01).

Two angles:
- Service functions with controlled dates + direct WritingSession
  inserts (deterministic streaks/windows via the ``today`` kwarg).
- Endpoint smoke through TestClient (summary / by-book / by-chapter /
  CSV) seeded by real chapter PATCHes so the per-book + per-chapter
  grain is exercised end-to-end.
"""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Book, Chapter, WritingSession
from app.services.writing_stats import (
    per_book_totals,
    per_chapter_totals,
    record_progress,
    summary_stats,
)

client = TestClient(app)

TODAY = date(2026, 6, 1)


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _seed_book(db: Session, title: str = "Book") -> Book:
    book = Book(title=title, author="A", language="en")
    db.add(book)
    db.flush()
    return book


def _seed_session(db: Session, day: date, words: int, *, book_id=None, chapter_id=None) -> None:
    db.add(WritingSession(day=day, words_written=words, book_id=book_id, chapter_id=chapter_id))


# --- record_progress grain ---


def test_record_progress_is_per_book_chapter(db: Session):
    book = _seed_book(db)
    c1 = Chapter(book_id=book.id, title="One", content="x", position=0)
    c2 = Chapter(book_id=book.id, title="Two", content="y", position=1)
    db.add_all([c1, c2])
    db.flush()
    # Each call models a separate PATCH request (committed between), so
    # flush after each so the upsert query sees the prior row.
    record_progress(db, 10, book_id=book.id, chapter_id=c1.id, day=TODAY)
    db.flush()
    record_progress(db, 5, book_id=book.id, chapter_id=c2.id, day=TODAY)
    db.flush()
    record_progress(db, 7, book_id=book.id, chapter_id=c1.id, day=TODAY)  # same row
    db.flush()
    rows = (
        db.query(WritingSession)
        .filter(WritingSession.day == TODAY, WritingSession.book_id == book.id)
        .all()
    )
    # Two distinct (book, chapter) rows; c1 accumulated 10+7.
    assert len(rows) == 2
    by_chapter = {r.chapter_id: r.words_written for r in rows}
    assert by_chapter == {c1.id: 17, c2.id: 5}


# --- summary_stats: totals, averages, streaks ---


def test_summary_totals_average_and_best_day(db: Session):
    _seed_session(db, TODAY, 300)
    _seed_session(db, TODAY - timedelta(days=1), 100)
    _seed_session(db, TODAY - timedelta(days=2), 0)  # zero day, not "active"
    db.flush()
    summary = summary_stats(db, 30, today=TODAY)
    assert summary.total_words == 400
    assert summary.days_active == 2
    assert summary.avg_per_active_day == 200
    assert summary.best_day is not None and summary.best_day.words_written == 300


def test_summary_streaks(db: Session):
    # Active today, yesterday, day-before -> current streak 3.
    for offset in (0, 1, 2):
        _seed_session(db, TODAY - timedelta(days=offset), 50)
    # A gap, then an older 2-day run (longest stays 3).
    _seed_session(db, TODAY - timedelta(days=5), 50)
    _seed_session(db, TODAY - timedelta(days=6), 50)
    db.flush()
    summary = summary_stats(db, 30, today=TODAY)
    assert summary.current_streak == 3
    assert summary.longest_streak == 3


def test_summary_current_streak_survives_unfinished_today(db: Session):
    # Nothing today, but yesterday + the day before -> current streak 2.
    _seed_session(db, TODAY - timedelta(days=1), 80)
    _seed_session(db, TODAY - timedelta(days=2), 80)
    db.flush()
    summary = summary_stats(db, 30, today=TODAY)
    assert summary.current_streak == 2


# --- per-book + per-chapter ---


def test_per_book_totals_split_and_ordering(db: Session):
    a = _seed_book(db, "Alpha")
    b = _seed_book(db, "Beta")
    _seed_session(db, TODAY, 100, book_id=a.id)
    _seed_session(db, TODAY - timedelta(days=1), 50, book_id=a.id)
    _seed_session(db, TODAY, 400, book_id=b.id)
    _seed_session(db, TODAY, 30, book_id=None)  # legacy global, excluded
    db.flush()
    totals = per_book_totals(db, 30, today=TODAY)
    assert [t.book_id for t in totals] == [b.id, a.id]  # most words first
    assert totals[0].total_words == 400
    assert totals[1].total_words == 150
    assert len(totals[1].daily) == 2


def test_per_chapter_totals_with_deleted_bucket(db: Session):
    book = _seed_book(db, "Gamma")
    ch = Chapter(book_id=book.id, title="Opening", content="x", position=0)
    db.add(ch)
    db.flush()
    _seed_session(db, TODAY, 120, book_id=book.id, chapter_id=ch.id)
    # Words whose chapter is gone (chapter_id NULL, book matches).
    _seed_session(db, TODAY, 40, book_id=book.id, chapter_id=None)
    db.flush()
    totals = per_chapter_totals(db, book.id, 30, today=TODAY)
    assert totals[0].chapter_id == ch.id
    assert totals[0].total_words == 120
    # Deleted-chapter bucket collapses to a single chapter_id=None entry.
    deleted = [t for t in totals if t.chapter_id is None]
    assert len(deleted) == 1 and deleted[0].total_words == 40


# --- endpoint smoke (real PATCH-driven recording) ---


def _book_api() -> str:
    return client.post("/api/books", json={"title": "Stats API", "author": "A"}).json()["id"]


def test_stats_endpoints_round_trip():
    book_id = _book_api()
    ch = client.post(f"/api/books/{book_id}/chapters", json={"title": "Ch", "content": "a"}).json()
    # A content PATCH records a per-book/per-chapter writing delta today.
    client.patch(
        f"/api/books/{book_id}/chapters/{ch['id']}",
        json={"content": "one two three four five", "version": ch["version"]},
    )

    summary = client.get("/api/writing-stats/summary").json()
    assert summary["total_words"] >= 1
    assert "daily" in summary and "current_streak" in summary

    by_book = client.get("/api/writing-stats/by-book").json()
    assert any(b["book_id"] == book_id for b in by_book)

    by_chapter = client.get(f"/api/writing-stats/by-chapter/{book_id}").json()
    assert any(c["chapter_id"] == ch["id"] for c in by_chapter)

    csv_resp = client.get("/api/writing-stats/export.csv")
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")
    assert "day,words_written" in csv_resp.text

    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")
