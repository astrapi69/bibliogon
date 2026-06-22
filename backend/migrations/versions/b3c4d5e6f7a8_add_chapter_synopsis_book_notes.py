"""add chapter synopsis and book notes

CHAPTER-SYNOPSIS-NOTES-01: a dedicated per-chapter ``synopsis`` (a short
logline, distinct from the Storyboard ``notes`` annotation) and a
project-level ``notes`` scratchpad on ``books``. Both nullable Text,
born NULL for every existing row.

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-22 19:10:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.add_column(sa.Column("synopsis", sa.Text(), nullable=True))
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("notes")
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.drop_column("synopsis")
