"""add Page storyboard columns (PICTURE-BOOK-STORYBOARD-VIEW-01)

Four nullable columns on the ``pages`` table for the Storyboard
view feature. Each is independently optional; existing rows are
born NULL on every new column with zero rendering impact for
PageEditor / ComicBookEditor / PDF export / EPUB export.

Schema-Foundation pre-commitment per the Pre-Inspection (A1):
columns ship in Session 1 so the Storyboard UI in Session 2 can
edit them without a second migration round-trip.

Column shapes are validated at the Pydantic schema layer, not at
SQL — matches the existing precedent for ``Page.layout`` and
``Chapter.chapter_type`` (both String columns, Literal-validated
in Pydantic):

- ``notes`` (Text): free-text author memo; not rendered in
  exported book output.
- ``story_beat`` (String(20)): one of {setup, inciting, rising,
  climax, falling, resolution}; 6 fixed values constrain future
  beat-sheet template features.
- ``mood_color`` (String(7)): hex color code ``#RRGGBB``;
  Pydantic-regex validated.
- ``act_group`` (String(100)): free-text label; grouping headers
  in the storyboard UI are derived from distinct values rather
  than a structured ``acts`` table (deferred per A7).

Reversible: downgrade drops all four columns cleanly. No data
migration — every existing row is born NULL.

Revision ID: t9d0e1f23456
Revises: s8c9d0e1f234
Create Date: 2026-05-27 09:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "t9d0e1f23456"
down_revision: Union[str, Sequence[str], None] = "s8c9d0e1f234"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("pages") as batch_op:
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("story_beat", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("mood_color", sa.String(length=7), nullable=True))
        batch_op.add_column(sa.Column("act_group", sa.String(length=100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("pages") as batch_op:
        batch_op.drop_column("act_group")
        batch_op.drop_column("mood_color")
        batch_op.drop_column("story_beat")
        batch_op.drop_column("notes")
