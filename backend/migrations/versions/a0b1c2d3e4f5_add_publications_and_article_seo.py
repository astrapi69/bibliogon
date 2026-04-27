"""add publications table + Article SEO fields

AR-02 Phase 2: per-platform Publication entity (linked to Article)
plus canonical SEO fields on the Article itself
(canonical_url, featured_image_url, excerpt, tags).

Revision ID: a0b1c2d3e4f5
Revises: f9a0b1c2d3e4
Create Date: 2026-04-27 18:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a0b1c2d3e4f5"
down_revision: Union[str, Sequence[str], None] = "f9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """AR-02 Phase 2 schema changes."""
    op.create_table(
        "publications",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("article_id", sa.String(length=32), nullable=False),
        sa.Column("platform", sa.String(length=50), nullable=False),
        sa.Column("is_promo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="planned"),
        sa.Column("platform_metadata", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("content_snapshot_at_publish", sa.Text(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_publications_article_id", "publications", ["article_id"], unique=False)
    op.create_index("ix_publications_status", "publications", ["status"], unique=False)

    with op.batch_alter_table("articles") as batch_op:
        batch_op.add_column(sa.Column("canonical_url", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("featured_image_url", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("excerpt", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "tags",
                sa.Text(),
                nullable=False,
                server_default="[]",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("articles") as batch_op:
        batch_op.drop_column("tags")
        batch_op.drop_column("excerpt")
        batch_op.drop_column("featured_image_url")
        batch_op.drop_column("canonical_url")

    op.drop_index("ix_publications_status", table_name="publications")
    op.drop_index("ix_publications_article_id", table_name="publications")
    op.drop_table("publications")
