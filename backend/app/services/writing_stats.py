"""Writing-stats service (WRITING-GOALS-PROGRESS-TRACKING-01 +
WRITING-HISTORY-STATS-01).

Counts words in a chapter's stored content and records the per-day net
word delta into ``writing_sessions`` (per book + chapter). Also computes
the day-aggregated history, per-book/per-chapter breakdowns, and the
summary statistics the Writing-History view renders. Pure functions +
thin DB helpers; no FastAPI types (per the architecture rule).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Book, Chapter, WritingSession


@dataclass
class DailyTotal:
    """One day's word total, aggregated across whatever scope the
    caller queried (global, per-book, or per-chapter)."""

    day: date
    words_written: int


def _flatten_tiptap(node: object) -> str:
    """Flatten a TipTap node tree to plain text (mirrors the frontend
    ``flattenTipTapText`` + the prose Storyboard word-count helper)."""
    if not isinstance(node, dict):
        return ""
    text = node.get("text")
    if isinstance(text, str):
        return text
    content = node.get("content")
    if not isinstance(content, list):
        return ""
    parts = [_flatten_tiptap(child) for child in content]
    node_type = node.get("type")
    is_block = node_type in ("doc", "paragraph") or (
        isinstance(node_type, str) and node_type.startswith("heading")
    )
    return ("\n" if is_block else " ").join(parts)


def count_words(content: str | None) -> int:
    """Word count of a chapter's stored content.

    Content is TipTap JSON serialised as a string (or legacy plain
    text); both are flattened to plain text, then whitespace-split.
    """
    raw = (content or "").strip()
    if not raw:
        return 0
    plain = raw
    if raw.startswith("{"):
        try:
            plain = _flatten_tiptap(json.loads(raw))
        except (ValueError, TypeError):
            plain = raw
    return len(plain.split())


def record_progress(
    db: Session,
    delta: int,
    *,
    book_id: str | None = None,
    chapter_id: str | None = None,
    day: date | None = None,
) -> WritingSession:
    """Add ``delta`` net words to the ``(book_id, chapter_id, day)``
    session (today by default), upserting the row. Returns the session.

    A zero delta is still recorded so 'I opened and saved today' counts
    as activity at 0 net words (the row's existence marks the active
    day). The grain is per book + chapter (WRITING-HISTORY-STATS-01);
    the daily-goal widget reads the day-aggregated total across rows.
    """
    target_day = day or date.today()
    session = (
        db.query(WritingSession)
        .filter(
            WritingSession.day == target_day,
            WritingSession.book_id == book_id,
            WritingSession.chapter_id == chapter_id,
        )
        .first()
    )
    if session is None:
        session = WritingSession(
            day=target_day,
            words_written=delta,
            book_id=book_id,
            chapter_id=chapter_id,
        )
        db.add(session)
    else:
        session.words_written += delta
    return session


def recent_sessions(db: Session, days: int) -> list[DailyTotal]:
    """The most recent ``days`` calendar days of writing, as global
    day-aggregated totals (summed across all books + chapters), newest
    first. Used by the daily-goal + streak widget."""
    rows = (
        db.query(
            WritingSession.day,
            func.sum(WritingSession.words_written).label("words_written"),
        )
        .group_by(WritingSession.day)
        .order_by(WritingSession.day.desc())
        .limit(max(1, days))
        .all()
    )
    return [DailyTotal(day=row.day, words_written=int(row.words_written or 0)) for row in rows]


# --- WRITING-HISTORY-STATS-01: aggregates for the stats view ---


@dataclass
class BookTotals:
    """Per-book writing totals + daily series within the window."""

    book_id: str
    book_title: str
    total_words: int
    daily: list[DailyTotal]


@dataclass
class ChapterTotals:
    """Per-chapter writing total within the window. ``chapter_id`` is
    None for words whose chapter was later deleted (kept on the book)."""

    chapter_id: str | None
    chapter_title: str
    total_words: int


@dataclass
class StatsSummary:
    """Everything the global Writing-History view needs."""

    total_words: int
    days_active: int
    avg_per_active_day: int
    best_day: DailyTotal | None
    current_streak: int
    longest_streak: int
    daily: list[DailyTotal]


def _window_start(days: int, *, today: date | None = None) -> date:
    """First calendar day of an inclusive ``days``-day window ending
    today."""
    end = today or date.today()
    return end - timedelta(days=max(1, days) - 1)


def _compute_streaks(active_days: set[date], today: date) -> tuple[int, int]:
    """Return ``(current_streak, longest_streak)`` over the set of days
    that saw net positive writing. The current streak counts back from
    today (or yesterday, so an unfinished today never zeroes it)."""
    if not active_days:
        return 0, 0
    longest = 0
    for day in active_days:
        if day - timedelta(days=1) in active_days:
            continue  # not the start of a run
        length = 1
        cursor = day
        while cursor + timedelta(days=1) in active_days:
            cursor += timedelta(days=1)
            length += 1
        longest = max(longest, length)
    current = 0
    cursor = today if today in active_days else today - timedelta(days=1)
    while cursor in active_days:
        current += 1
        cursor -= timedelta(days=1)
    return current, longest


def daily_global_series(db: Session, days: int, *, today: date | None = None) -> list[DailyTotal]:
    """Global day-aggregated totals within the window, oldest first."""
    end = today or date.today()
    start = _window_start(days, today=end)
    rows = (
        db.query(
            WritingSession.day,
            func.sum(WritingSession.words_written).label("words_written"),
        )
        .filter(WritingSession.day >= start, WritingSession.day <= end)
        .group_by(WritingSession.day)
        .order_by(WritingSession.day.asc())
        .all()
    )
    return [DailyTotal(day=row.day, words_written=int(row.words_written or 0)) for row in rows]


def summary_stats(db: Session, days: int, *, today: date | None = None) -> StatsSummary:
    """Totals, averages, best day, and streaks over the window."""
    end = today or date.today()
    daily = daily_global_series(db, days, today=end)
    total = sum(d.words_written for d in daily)
    positive = [d for d in daily if d.words_written > 0]
    days_active = len(positive)
    avg = round(total / days_active) if days_active else 0
    best = max(positive, key=lambda d: d.words_written) if positive else None
    current, longest = _compute_streaks({d.day for d in positive}, end)
    return StatsSummary(
        total_words=total,
        days_active=days_active,
        avg_per_active_day=avg,
        best_day=best,
        current_streak=current,
        longest_streak=longest,
        daily=daily,
    )


def per_book_totals(db: Session, days: int, *, today: date | None = None) -> list[BookTotals]:
    """Per-book totals + daily series within the window, books with the
    most words first. Rows with NULL book_id (legacy global history) are
    omitted - they have no book to attribute to."""
    end = today or date.today()
    start = _window_start(days, today=end)
    rows = (
        db.query(
            WritingSession.book_id,
            Book.title,
            WritingSession.day,
            func.sum(WritingSession.words_written).label("words_written"),
        )
        .join(Book, Book.id == WritingSession.book_id)
        .filter(WritingSession.day >= start, WritingSession.day <= end)
        .group_by(WritingSession.book_id, Book.title, WritingSession.day)
        .order_by(WritingSession.day.asc())
        .all()
    )
    by_book: dict[str, BookTotals] = {}
    for row in rows:
        words = int(row.words_written or 0)
        entry = by_book.get(row.book_id)
        if entry is None:
            entry = BookTotals(book_id=row.book_id, book_title=row.title, total_words=0, daily=[])
            by_book[row.book_id] = entry
        entry.total_words += words
        entry.daily.append(DailyTotal(day=row.day, words_written=words))
    return sorted(by_book.values(), key=lambda b: b.total_words, reverse=True)


def per_chapter_totals(
    db: Session, book_id: str, days: int, *, today: date | None = None
) -> list[ChapterTotals]:
    """Per-chapter totals for one book within the window, most words
    first. Words whose chapter was deleted (chapter_id NULL but book_id
    matches) collapse into a single 'deleted chapters' bucket."""
    end = today or date.today()
    start = _window_start(days, today=end)
    rows = (
        db.query(
            WritingSession.chapter_id,
            Chapter.title,
            func.sum(WritingSession.words_written).label("words_written"),
        )
        .outerjoin(Chapter, Chapter.id == WritingSession.chapter_id)
        .filter(
            WritingSession.book_id == book_id,
            WritingSession.day >= start,
            WritingSession.day <= end,
        )
        .group_by(WritingSession.chapter_id, Chapter.title)
        .all()
    )
    deleted_total = 0
    result: list[ChapterTotals] = []
    for row in rows:
        words = int(row.words_written or 0)
        if row.chapter_id is None or row.title is None:
            deleted_total += words
            continue
        result.append(
            ChapterTotals(chapter_id=row.chapter_id, chapter_title=row.title, total_words=words)
        )
    result.sort(key=lambda c: c.total_words, reverse=True)
    if deleted_total:
        result.append(ChapterTotals(chapter_id=None, chapter_title="", total_words=deleted_total))
    return result
