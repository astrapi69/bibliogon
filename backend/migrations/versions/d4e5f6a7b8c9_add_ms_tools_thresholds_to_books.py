"""add ms-tools thresholds to books

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-11 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add per-book override columns for ms-tools style-check thresholds."""
    with op.batch_alter_table('books') as batch_op:
        batch_op.add_column(
            sa.Column('ms_tools_max_sentence_length', sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column('ms_tools_repetition_window', sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column('ms_tools_max_filler_ratio', sa.Float(), nullable=True)
        )


def downgrade() -> None:
    """Remove per-book ms-tools threshold columns."""
    with op.batch_alter_table('books') as batch_op:
        batch_op.drop_column('ms_tools_max_filler_ratio')
        batch_op.drop_column('ms_tools_repetition_window')
        batch_op.drop_column('ms_tools_max_sentence_length')
