"""Writing-stats service (WRITING-GOALS-PROGRESS-TRACKING-01).

Counts words in a chapter's stored content and records the per-day net
word delta into ``writing_sessions``. Pure functions + thin DB helpers;
no FastAPI types (per the architecture rule).
"""

from __future__ import annotations

import json
from datetime import date

from sqlalchemy.orm import Session

from app.models import WritingSession


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


def record_progress(db: Session, delta: int, *, day: date | None = None) -> WritingSession:
    """Add ``delta`` net words to the given day's session (today by
    default), upserting the row. Returns the session. A zero delta is
    still recorded so 'I opened and saved today' counts as activity at
    0 net words (the row's existence marks the active day)."""
    target_day = day or date.today()
    session = db.query(WritingSession).filter(WritingSession.day == target_day).first()
    if session is None:
        session = WritingSession(day=target_day, words_written=delta)
        db.add(session)
    else:
        session.words_written += delta
    return session


def recent_sessions(db: Session, days: int) -> list[WritingSession]:
    """The most recent ``days`` writing-session rows, newest first."""
    return db.query(WritingSession).order_by(WritingSession.day.desc()).limit(max(1, days)).all()
