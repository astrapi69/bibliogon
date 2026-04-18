"""add version column to chapters for optimistic locking

Prepares the ground for the PATCH /chapters optimistic-lock flow
landing in the next commit. The column is non-null with a default
of 1; the server_default covers both new inserts and existing rows.

Revision ID: e1f2a3b4c5d6
Revises: c8d9e0f1a2b3
Create Date: 2026-04-18 13:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('chapters') as batch_op:
        batch_op.add_column(
            sa.Column(
                'version',
                sa.Integer(),
                nullable=False,
                server_default='1',
            )
        )
    # Explicit backfill: redundant on SQLite where server_default handles
    # existing rows, but keeps the migration read the same on Postgres etc.
    op.execute(sa.text("UPDATE chapters SET version = 1 WHERE version IS NULL"))


def downgrade() -> None:
    with op.batch_alter_table('chapters') as batch_op:
        batch_op.drop_column('version')
