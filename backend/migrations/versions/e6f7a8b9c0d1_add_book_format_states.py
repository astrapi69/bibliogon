"""add book_format_states + books.universal_link

Promotion Phase 1 (#782): per-book, per-format retail presence plus
the one shortlink an author hands out. ``Book.status`` is a single
value for the whole book, so per-format presence had nowhere to live.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-09-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: str | Sequence[str] | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "book_format_states",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("book_id", sa.String(length=32), nullable=False),
        sa.Column("book_format", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("store_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("book_id", "book_format", name="uq_book_format"),
    )
    op.create_index(
        op.f("ix_book_format_states_book_id"),
        "book_format_states",
        ["book_id"],
        unique=False,
    )
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(sa.Column("universal_link", sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("universal_link")
    op.drop_index(op.f("ix_book_format_states_book_id"), table_name="book_format_states")
    op.drop_table("book_format_states")
