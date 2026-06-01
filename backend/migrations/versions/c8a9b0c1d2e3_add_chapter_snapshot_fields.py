"""add chapter snapshot fields: name + is_manual (CHAPTER-SNAPSHOTS-01)

Scrivener-style named snapshots, an extension of the existing
``chapter_versions`` table:

- ``chapter_versions.name`` (String(200), nullable): optional
  user-given label for a manual snapshot ("Before restructure").
  NULL for automatic version-history rows.
- ``chapter_versions.is_manual`` (Boolean, not null, default 0):
  marks a deliberately-taken snapshot. Manual rows are exempt from
  the auto-version retention trim (last-20-per-chapter) so a kept
  fassung is never silently deleted.

Reversible. No data migration - existing rows are all automatic
(``is_manual`` server_default 0, ``name`` NULL).

Revision ID: c8a9b0c1d2e3
Revises: b7f8a9b0c1d2
Create Date: 2026-06-01 15:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8a9b0c1d2e3"
down_revision: Union[str, Sequence[str], None] = "b7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chapter_versions") as batch_op:
        batch_op.add_column(sa.Column("name", sa.String(length=200), nullable=True))
        batch_op.add_column(
            sa.Column(
                "is_manual",
                sa.Boolean(),
                nullable=False,
                server_default="0",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("chapter_versions") as batch_op:
        batch_op.drop_column("is_manual")
        batch_op.drop_column("name")
