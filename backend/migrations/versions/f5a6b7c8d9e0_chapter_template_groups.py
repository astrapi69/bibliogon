"""Add ChapterTemplate.child_template_ids for multi-chapter templates.

Implements TM-04b sub-item 3 (multi-chapter chapter templates). The
existing single-chapter shape stays the default; a non-null
``child_template_ids`` (JSON-stringified ``list[str]``) marks the
row as a group whose application inserts N chapters, one per
referenced child.

Mirrors the idempotent pattern used by the article migrations: skip
when the column already exists so re-running ``alembic upgrade head``
against a stamped DB does not error with ``duplicate column``.

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-05-02

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op


revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, Sequence[str], None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("chapter_templates")}
    if "child_template_ids" not in columns:
        with op.batch_alter_table("chapter_templates") as batch:
            batch.add_column(
                sa.Column(
                    "child_template_ids",
                    sa.Text(),
                    nullable=True,
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("chapter_templates")}
    if "child_template_ids" in columns:
        with op.batch_alter_table("chapter_templates") as batch:
            batch.drop_column("child_template_ids")
