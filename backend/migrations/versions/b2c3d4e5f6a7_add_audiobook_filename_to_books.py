"""add audiobook_filename to books

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add audiobook_filename column to books table."""
    with op.batch_alter_table('books') as batch_op:
        batch_op.add_column(sa.Column('audiobook_filename', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Remove audiobook_filename column from books table."""
    with op.batch_alter_table('books') as batch_op:
        batch_op.drop_column('audiobook_filename')
