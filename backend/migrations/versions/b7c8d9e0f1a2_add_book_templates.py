"""add book_templates and book_template_chapters

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f7
Create Date: 2026-04-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create tables for book templates (TM-01)."""
    op.create_table(
        'book_templates',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('genre', sa.String(length=100), nullable=False),
        sa.Column('language', sa.String(length=10), nullable=False, server_default='en'),
        sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'book_template_chapters',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('template_id', sa.String(length=32), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('chapter_type', sa.String(length=20), nullable=False, server_default='chapter'),
        sa.Column('content', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['template_id'], ['book_templates.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_book_template_chapters_template_id',
        'book_template_chapters',
        ['template_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_book_template_chapters_template_id', 'book_template_chapters')
    op.drop_table('book_template_chapters')
    op.drop_table('book_templates')
