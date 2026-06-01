"""add Book.graph_layout (STORY-BIBLE-RELATIONSHIP-GRAPH-01 C5)

Persisted relationship-graph node positions: a JSON object
``{entity_id: {x, y}}`` on the book. NULL = no saved layout (the graph
falls back to its circular auto-layout).

Plain ADD COLUMN (no FK) so SQLite batch mode does not recreate
``books`` - keeps ``alembic upgrade head`` clean (see
ALEMBIC-UPGRADE-CHAIN-FIX). Reversible.

Revision ID: e0c1d2e3f4a5
Revises: d9b0c1d2e3f4
Create Date: 2026-06-01 17:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e0c1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "d9b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(sa.Column("graph_layout", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("graph_layout")
