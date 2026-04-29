"""Add Article.deleted_at for soft-delete (trash bin) parity with Book.

Mirrors the existing ``Book.deleted_at`` column. NULL = live; non-NULL
= trashed. List endpoints filter on ``deleted_at IS NULL`` by default.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-04-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op


revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Idempotent: skip when the column already exists.

    Fresh installs land the column via ``Base.metadata.create_all``
    so ``alembic upgrade head`` against an already-stamped DB must be
    a no-op rather than fail with ``duplicate column``.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("articles")}
    if "deleted_at" not in columns:
        with op.batch_alter_table("articles") as batch:
            batch.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("articles")}
    if "deleted_at" in columns:
        with op.batch_alter_table("articles") as batch:
            batch.drop_column("deleted_at")
