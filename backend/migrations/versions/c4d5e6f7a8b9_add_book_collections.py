"""add book collections

CHAPTER-COLLECTIONS-01: manual chapter collections stored as a JSON list
of {id, name, chapter_ids[]} on ``books`` (Scrivener "Collections"
parity). Nullable, born NULL for every existing row.

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-06-22 22:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(sa.Column("collections", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("collections")
