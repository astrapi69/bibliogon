"""add writing goals: chapter target, book target/deadline, writing_sessions
(WRITING-GOALS-PROGRESS-TRACKING-01)

Scrivener-style writing targets + daily-session tracking:

- ``chapters.target_words`` (Integer, nullable): per-chapter word
  target. Promotes the previous per-device localStorage goal to a
  DB column so it syncs across devices + survives backup/restore +
  feeds the Outliner.
- ``books.word_target`` (Integer, nullable): per-book aggregate word
  target.
- ``books.word_target_deadline`` (Date, nullable): optional draft
  deadline; the UI computes "words/day to stay on track" from it.
- New ``writing_sessions`` table: one row per calendar day with the
  net words written that day (``day`` unique). Populated by the
  chapter PATCH handler when content changes. The daily-goal + streak
  are computed on the frontend from this history against the user's
  per-device goal.

Reversible. No data migration — all new columns born NULL; the
table starts empty.

Revision ID: b7f8a9b0c1d2
Revises: a6e7f8a9b0c1
Create Date: 2026-06-01 14:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "a6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.add_column(sa.Column("target_words", sa.Integer(), nullable=True))
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(sa.Column("word_target", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("word_target_deadline", sa.Date(), nullable=True))
    op.create_table(
        "writing_sessions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("day", sa.Date(), nullable=False, unique=True),
        sa.Column("words_written", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("writing_sessions")
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("word_target_deadline")
        batch_op.drop_column("word_target")
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.drop_column("target_words")
