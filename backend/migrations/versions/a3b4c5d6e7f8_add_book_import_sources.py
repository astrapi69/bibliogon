"""add book_import_sources table

Tracks each imported book's origin (source_identifier + source_type)
so the new import orchestrator can detect duplicates and offer
Cancel / Overwrite / Copy in the preview panel.

See docs/explorations/core-import-orchestrator.md Section 8 Phase 1
scope.

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-04-23 10:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "book_import_sources",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "book_id",
            sa.String(length=32),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_identifier", sa.String(length=500), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("format_name", sa.String(length=50), nullable=False),
        sa.Column(
            "imported_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
    )
    op.create_index(
        "ix_book_import_sources_book_id",
        "book_import_sources",
        ["book_id"],
    )
    # Composite index on (source_identifier, source_type) for O(log n)
    # duplicate lookup during the detect phase.
    op.create_index(
        "ix_book_import_sources_identifier_type",
        "book_import_sources",
        ["source_identifier", "source_type"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_book_import_sources_identifier_type", table_name="book_import_sources"
    )
    op.drop_index("ix_book_import_sources_book_id", table_name="book_import_sources")
    op.drop_table("book_import_sources")
