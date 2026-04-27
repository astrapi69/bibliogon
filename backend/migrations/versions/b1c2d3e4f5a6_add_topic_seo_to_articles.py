"""add topic + seo_title + seo_description to articles

AR-02 Phase 2.1: primary category + dedicated SEO title/desc on
the Article. ``topic`` is settings-managed (config/app.yaml
topics: list[str]); ``seo_title`` + ``seo_description`` default
to the article's title + excerpt at publish time when empty.

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-04-27 19:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a0b1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("articles") as batch_op:
        batch_op.add_column(sa.Column("topic", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("seo_title", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("seo_description", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("articles") as batch_op:
        batch_op.drop_column("seo_description")
        batch_op.drop_column("seo_title")
        batch_op.drop_column("topic")
