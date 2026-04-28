"""add article_assets table

UX-FU-02: parallel of the ``assets`` table for articles. Featured-
image uploads from the ArticleEditor land here; the article's
``featured_image_url`` column points at the served path.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-04-28 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "article_assets",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "article_id",
            sa.String(length=32),
            sa.ForeignKey("articles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(length=500), nullable=False),
        sa.Column(
            "asset_type",
            sa.String(length=50),
            nullable=False,
            server_default="featured_image",
        ),
        sa.Column("path", sa.String(length=1000), nullable=False),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
    )
    op.create_index(
        "ix_article_assets_article_id",
        "article_assets",
        ["article_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_article_assets_article_id", table_name="article_assets")
    op.drop_table("article_assets")
