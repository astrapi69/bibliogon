"""add Chapter storyboard columns (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C3)

Four nullable columns on the ``chapters`` table, mirroring the four
Page storyboard columns (``t9d0e1f23456``). They power the prose-book
chapter-card Storyboard view: a chapter card carries the same
annotation shape (notes / story_beat / mood_color / act_group) as a
picture/comic page card.

Each column is independently optional; existing rows are born NULL with
zero rendering impact on the chapter editor / export pipelines. Column
shapes are validated at the Pydantic schema layer, not at SQL — matches
the precedent for ``Chapter.chapter_type`` and ``Page.layout`` (String
columns, Literal-validated in Pydantic).

- ``notes`` (Text): free-text author memo; not rendered in exported
  book output.
- ``story_beat`` (String(20)): one of {setup, inciting, rising, climax,
  falling, resolution}.
- ``mood_color`` (String(7)): hex color code ``#RRGGBB``;
  Pydantic-regex validated.
- ``act_group`` (String(100)): free-text grouping label.

Reversible: downgrade drops all four columns cleanly. No data
migration — every existing row is born NULL.

Revision ID: y4c5d6e7f8a9
Revises: x3b4c5d6e7f8
Create Date: 2026-06-01 09:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "y4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "x3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("story_beat", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("mood_color", sa.String(length=7), nullable=True))
        batch_op.add_column(sa.Column("act_group", sa.String(length=100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.drop_column("act_group")
        batch_op.drop_column("mood_color")
        batch_op.drop_column("story_beat")
        batch_op.drop_column("notes")
