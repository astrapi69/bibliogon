"""add aplus_documents

Editable A+ document (#891): the author's content name, short
description, bullets and module list per book and language, kept apart
from the AI generation cache in aplus_content.

Revision ID: g8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g8b9c0d1e2f3"
down_revision: str | Sequence[str] | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "aplus_documents",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("book_id", sa.String(length=32), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("document_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("book_id", "language", name="uq_aplus_documents_book_lang"),
    )
    op.create_index(
        op.f("ix_aplus_documents_book_id"), "aplus_documents", ["book_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_aplus_documents_book_id"), table_name="aplus_documents")
    op.drop_table("aplus_documents")
