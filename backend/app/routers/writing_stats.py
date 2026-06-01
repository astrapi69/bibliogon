"""Writing-stats endpoints (WRITING-GOALS-PROGRESS-TRACKING-01).

Exposes the per-day writing-session history. The daily-goal + streak
are computed on the frontend from this history against the user's
per-device goal, so the backend only serves the raw per-day word
counts.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import WritingSessionOut
from app.services.writing_stats import recent_sessions

router = APIRouter(prefix="/writing-sessions", tags=["writing-stats"])


@router.get("", response_model=list[WritingSessionOut])
def list_writing_sessions(
    days: int = Query(default=30, ge=1, le=366),
    db: Session = Depends(get_db),
):
    """The most recent ``days`` writing-session rows, newest first."""
    return recent_sessions(db, days)
