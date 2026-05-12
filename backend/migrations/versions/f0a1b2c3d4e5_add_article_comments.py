"""add article_comments table

MEDIUM-COMMENTS-IMPORT-01. A new sibling table to ``articles``
that holds short user-written responses imported from Medium
(and future sources like WordPress / Hashnode). Comments are
linked to the article they respond to via a nullable FK; the
FK is nullable because Medium's HTML export carries no
parent-article reference at all, so every imported comment is
born an orphan.

FK ``responds_to_article_id`` uses ``ON DELETE SET NULL`` so
that deleting an article doesn't destroy the responses to it -
they survive as orphans and can be re-linked when the
responded-to article is re-imported.

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
Create Date: 2026-05-12 13:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "article_comments",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("author", sa.String(length=200), nullable=True),
        sa.Column("body_text", sa.Text(), nullable=False),
        sa.Column("body_json", sa.Text(), nullable=True),
        sa.Column(
            "language",
            sa.String(length=10),
            nullable=False,
            server_default="en",
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canonical_url", sa.String(length=500), nullable=True),
        sa.Column(
            "responds_to_article_id",
            sa.String(length=32),
            sa.ForeignKey("articles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("responds_to_url", sa.String(length=500), nullable=True),
        sa.Column("imported_from", sa.String(length=50), nullable=False),
        sa.Column(
            "imported_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column("source_filename", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_article_comments_responds_to_article_id",
        "article_comments",
        ["responds_to_article_id"],
    )
    op.create_index(
        "ix_article_comments_imported_from",
        "article_comments",
        ["imported_from"],
    )


def downgrade() -> None:
    op.drop_index("ix_article_comments_imported_from", table_name="article_comments")
    op.drop_index(
        "ix_article_comments_responds_to_article_id",
        table_name="article_comments",
    )
    op.drop_table("article_comments")
