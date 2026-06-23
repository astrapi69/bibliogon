"""add chapter inspector_notes

CHAPTER-SYNOPSIS-NOTES-01 (additive enhancement): a per-chapter
``inspector_notes`` free-text column for the author's chapter-local
working notes (the Scrivener "Inspector Notes" equivalent). Distinct
from the Storyboard ``notes`` sticky and from project-wide
``Book.notes``. Nullable Text, born NULL for every existing row.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-06-23 10:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.add_column(sa.Column("inspector_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.drop_column("inspector_notes")
