"""Add Article.ai_tokens_used for per-article AI cost tracking.

Mirrors ``Book.ai_tokens_used``. Default 0; bumped from every
article-level AI generation call (SEO meta, tags, future).

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-04-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op


revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Idempotent: skip when the column already exists.

    Same shape as the article-deleted_at migration: fresh installs
    land the column via ``Base.metadata.create_all`` so re-running
    ``alembic upgrade head`` against a stamped DB must not error
    with ``duplicate column``.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("articles")}
    if "ai_tokens_used" not in columns:
        with op.batch_alter_table("articles") as batch:
            batch.add_column(
                sa.Column(
                    "ai_tokens_used",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("articles")}
    if "ai_tokens_used" in columns:
        with op.batch_alter_table("articles") as batch:
            batch.drop_column("ai_tokens_used")
