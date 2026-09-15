"""add aplus_content

A+ Content Generator (#825): cached generated package per book and
language, invalidated by a source-hash fingerprint.

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-09-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: str | Sequence[str] | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "aplus_content",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("book_id", sa.String(length=32), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("ruleset_version", sa.String(length=20), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("model_name", sa.String(length=200), nullable=False),
        sa.Column("content_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("book_id", "language", name="uq_aplus_content_book_lang"),
    )
    op.create_index(
        op.f("ix_aplus_content_book_id"), "aplus_content", ["book_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_aplus_content_book_id"), table_name="aplus_content")
    op.drop_table("aplus_content")
