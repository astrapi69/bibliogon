"""add article_import_sources table

Mirrors book_import_sources for Article-side provenance. Written by
importer plugins (bibliogon-plugin-medium-import is the first) so
re-imports can detect duplicates and the user can answer "where did
this article come from?".

Revision ID: d8e9f0a1b2c3
Revises: c0a1b2c3d4e5
Create Date: 2026-05-08 09:45:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, Sequence[str], None] = "c0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "article_import_sources",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "article_id",
            sa.String(length=32),
            sa.ForeignKey("articles.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
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
        sa.Column(
            "import_metadata",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("importer_version", sa.String(length=50), nullable=True),
        sa.Column(
            "conversion_warnings",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.create_index(
        "ix_article_import_sources_article_id",
        "article_import_sources",
        ["article_id"],
    )
    op.create_index(
        "ix_article_import_sources_identifier_type",
        "article_import_sources",
        ["source_identifier", "source_type"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_article_import_sources_identifier_type",
        table_name="article_import_sources",
    )
    op.drop_index(
        "ix_article_import_sources_article_id",
        table_name="article_import_sources",
    )
    op.drop_table("article_import_sources")
