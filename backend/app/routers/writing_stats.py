"""Writing-stats endpoints (WRITING-GOALS-PROGRESS-TRACKING-01 +
WRITING-HISTORY-STATS-01).

``/writing-sessions`` serves the day-aggregated history the daily-goal +
streak widget reads. ``/writing-stats/*`` serves the richer
Writing-History view: a global summary (totals, averages, streaks,
daily series), a per-book breakdown, a per-chapter breakdown, and a CSV
export. The daily goal itself is per-device (localStorage), so the
backend only serves raw counts.
"""

import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    WritingBookStatsOut,
    WritingChapterStatsOut,
    WritingSessionOut,
    WritingStatsSummaryOut,
)
from app.services.writing_stats import (
    daily_global_series,
    per_book_totals,
    per_chapter_totals,
    recent_sessions,
    summary_stats,
)

router = APIRouter(tags=["writing-stats"])


@router.get("/writing-sessions", response_model=list[WritingSessionOut])
def list_writing_sessions(
    days: int = Query(default=30, ge=1, le=366),
    db: Session = Depends(get_db),
):
    """The most recent ``days`` day-aggregated writing totals, newest first."""
    return recent_sessions(db, days)


@router.get("/writing-stats/summary", response_model=WritingStatsSummaryOut)
def writing_stats_summary(
    days: int = Query(default=90, ge=1, le=366),
    db: Session = Depends(get_db),
):
    """Global summary over the window: totals, averages, streaks, series."""
    return summary_stats(db, days)


@router.get("/writing-stats/by-book", response_model=list[WritingBookStatsOut])
def writing_stats_by_book(
    days: int = Query(default=90, ge=1, le=366),
    db: Session = Depends(get_db),
):
    """Per-book writing totals + daily series over the window."""
    return per_book_totals(db, days)


@router.get(
    "/writing-stats/by-chapter/{book_id}",
    response_model=list[WritingChapterStatsOut],
)
def writing_stats_by_chapter(
    book_id: str,
    days: int = Query(default=90, ge=1, le=366),
    db: Session = Depends(get_db),
):
    """Per-chapter writing totals for one book over the window."""
    return per_chapter_totals(db, book_id, days)


@router.get("/writing-stats/export.csv")
def writing_stats_export_csv(
    days: int = Query(default=90, ge=1, le=366),
    db: Session = Depends(get_db),
):
    """Download the global daily writing history as CSV (day,words)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["day", "words_written"])
    for entry in daily_global_series(db, days):
        writer.writerow([entry.day.isoformat(), entry.words_written])
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=writing-history.csv"},
    )
