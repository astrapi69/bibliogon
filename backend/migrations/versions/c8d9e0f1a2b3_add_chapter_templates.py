"""add chapter_templates table

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-04-17 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the chapter_templates table (TM-04)."""
    op.create_table(
        'chapter_templates',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('chapter_type', sa.String(length=20), nullable=False, server_default='chapter'),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('language', sa.String(length=10), nullable=False, server_default='en'),
        sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )


def downgrade() -> None:
    op.drop_table('chapter_templates')
