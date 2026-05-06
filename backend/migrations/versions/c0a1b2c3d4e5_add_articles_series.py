"""Add Article.series for bulk-export filter and umbrella-series workflow.

Mirrors ``Book.series`` semantics: flat free-string, nullable. No
hierarchy in this revision; if parent/child series becomes required,
that lands as its own model + M2M migration.

Revision ID: c0a1b2c3d4e5
Revises: f5a6b7c8d9e0
Create Date: 2026-05-06

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op


revision: str = "c0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("articles")}
    if "series" not in columns:
        with op.batch_alter_table("articles") as batch:
            batch.add_column(
                sa.Column(
                    "series",
                    sa.String(length=300),
                    nullable=True,
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("articles")}
    if "series" in columns:
        with op.batch_alter_table("articles") as batch:
            batch.drop_column("series")
