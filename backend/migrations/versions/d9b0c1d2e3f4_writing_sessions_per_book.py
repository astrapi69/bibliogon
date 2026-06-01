"""writing_sessions per book + chapter (WRITING-HISTORY-STATS-01)

Reshape ``writing_sessions`` from one global row per day to one row
per ``(book_id, chapter_id, day)``:

- Drop the old ``day``-unique constraint (multiple rows per day now).
- Add ``book_id`` (FK books, ON DELETE CASCADE, nullable, indexed).
- Add ``chapter_id`` (FK chapters, ON DELETE SET NULL, nullable,
  indexed).

Existing rows are global writing-history (written before this change)
and keep NULL ``book_id``/``chapter_id``; they still count toward the
day-aggregated totals the daily-goal widget reads.

SQLite cannot drop an inline UNIQUE constraint in place, so the table
is recreated and the existing rows are copied over.

Revision ID: d9b0c1d2e3f4
Revises: c8a9b0c1d2e3
Create Date: 2026-06-01 16:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d9b0c1d2e3f4"
down_revision: Union[str, Sequence[str], None] = "c8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "writing_sessions_new",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("words_written", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "book_id",
            sa.String(length=32),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "chapter_id",
            sa.String(length=32),
            sa.ForeignKey("chapters.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.execute(
        "INSERT INTO writing_sessions_new (id, day, words_written) "
        "SELECT id, day, words_written FROM writing_sessions"
    )
    op.drop_table("writing_sessions")
    op.rename_table("writing_sessions_new", "writing_sessions")
    op.create_index("ix_writing_sessions_day", "writing_sessions", ["day"])
    op.create_index("ix_writing_sessions_book_id", "writing_sessions", ["book_id"])
    op.create_index("ix_writing_sessions_chapter_id", "writing_sessions", ["chapter_id"])


def downgrade() -> None:
    # Collapse back to one global row per day (sum across books), with
    # the day-unique constraint restored.
    op.create_table(
        "writing_sessions_old",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("day", sa.Date(), nullable=False, unique=True),
        sa.Column("words_written", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        "INSERT INTO writing_sessions_old (id, day, words_written) "
        "SELECT MIN(id), day, SUM(words_written) FROM writing_sessions GROUP BY day"
    )
    op.drop_table("writing_sessions")
    op.rename_table("writing_sessions_old", "writing_sessions")
