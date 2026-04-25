"""make books.author nullable

Author can now be NULL in the DB. The new
``app.allow_books_without_author`` toggle gates which clients are
allowed to write NULL: when off, the API rejects clearing the author;
when on, the import wizard's "defer" path and PATCH /api/books/{id}
both accept NULL.

Display layer treats NULL as "no author" (em-dash on the dashboard,
empty field in the metadata editor) without a validation error.

Revision ID: b5c6d7e8f9a0
Revises: a3b4c5d6e7f8
Create Date: 2026-04-25 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b5c6d7e8f9a0'
down_revision: Union[str, Sequence[str], None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("books", schema=None) as batch_op:
        batch_op.alter_column(
            "author",
            existing_type=sa.String(length=300),
            nullable=True,
        )


def downgrade() -> None:
    # Backfill any NULL with "Unknown" so the NOT NULL re-add succeeds.
    op.execute("UPDATE books SET author = 'Unknown' WHERE author IS NULL")
    with op.batch_alter_table("books", schema=None) as batch_op:
        batch_op.alter_column(
            "author",
            existing_type=sa.String(length=300),
            nullable=False,
        )
