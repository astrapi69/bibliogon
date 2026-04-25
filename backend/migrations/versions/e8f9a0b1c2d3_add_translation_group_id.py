"""add translation_group_id to books

PGS-04 foundation: a flat cross-link between books that are
translations of each other. Books with the same
``translation_group_id`` belong to the same multi-language
group; ``NULL`` means unlinked. No master/translation hierarchy
- siblings reference each other via the shared group id.

Auto-populated on multi-branch git imports (``main`` + ``main-XX``);
manually settable via the Settings link/unlink UI for books
imported separately.

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-04-25 17:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, Sequence[str], None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    return column in [c["name"] for c in inspector.get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "books", "translation_group_id"):
        return
    with op.batch_alter_table("books", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("translation_group_id", sa.String(length=36), nullable=True)
        )
    op.create_index(
        "ix_books_translation_group_id",
        "books",
        ["translation_group_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "books", "translation_group_id"):
        return
    op.drop_index("ix_books_translation_group_id", table_name="books")
    with op.batch_alter_table("books", schema=None) as batch_op:
        batch_op.drop_column("translation_group_id")
