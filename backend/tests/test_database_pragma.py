"""Verify the SQLite PRAGMA event listener is active on every connection.

These checks are cheap and catch a class of regression where the
listener is silently removed: the backend keeps working on the surface,
but cascade deletes start failing, commits get slower, and concurrent
readers start blocking the writer.
"""
from sqlalchemy import text

from app.database import engine


def test_journal_mode_is_wal() -> None:
    with engine.connect() as conn:
        mode = conn.execute(text("PRAGMA journal_mode")).scalar()
    assert str(mode).lower() == "wal", f"expected wal, got {mode!r}"


def test_synchronous_is_normal() -> None:
    # SQLite returns the sync mode as an integer: 0=OFF, 1=NORMAL, 2=FULL, 3=EXTRA
    with engine.connect() as conn:
        sync = conn.execute(text("PRAGMA synchronous")).scalar()
    assert int(sync) == 1, f"expected synchronous=1 (NORMAL), got {sync}"


def test_foreign_keys_enabled() -> None:
    with engine.connect() as conn:
        fk = conn.execute(text("PRAGMA foreign_keys")).scalar()
    assert int(fk) == 1, f"expected foreign_keys=1 (ON), got {fk}"
