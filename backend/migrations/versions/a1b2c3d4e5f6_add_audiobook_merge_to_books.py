"""add audiobook_merge to books

Revision ID: a1b2c3d4e5f6
Revises: 880d5f5f1229
Create Date: 2026-04-09 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '880d5f5f1229'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add audiobook_merge column to books table."""
    with op.batch_alter_table('books') as batch_op:
        batch_op.add_column(sa.Column('audiobook_merge', sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Remove audiobook_merge column from books table."""
    with op.batch_alter_table('books') as batch_op:
        batch_op.drop_column('audiobook_merge')
