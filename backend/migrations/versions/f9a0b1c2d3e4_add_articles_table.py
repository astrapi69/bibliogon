"""add articles table

AR-01 Phase 1: standalone Article entity for long-form content.
Single TipTap document + minimal metadata. No chapters, no
ISBN, no per-platform publication state (Phase 2+).

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-04-27 14:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f9a0b1c2d3e4"
down_revision: Union[str, Sequence[str], None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the articles table (AR-01 Phase 1)."""
    op.create_table(
        "articles",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("subtitle", sa.String(length=500), nullable=True),
        sa.Column("author", sa.String(length=300), nullable=True),
        sa.Column("language", sa.String(length=10), nullable=False, server_default="en"),
        sa.Column("content_type", sa.String(length=20), nullable=False, server_default="article"),
        sa.Column("content_json", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_articles_status", "articles", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_articles_status", table_name="articles")
    op.drop_table("articles")
