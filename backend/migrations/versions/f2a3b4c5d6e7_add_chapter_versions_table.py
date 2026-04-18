"""add chapter_versions table

Immutable per-chapter snapshots populated by the PATCH /chapters
handler. Retention policy (last N per chapter) is enforced in code
by the router, not by the schema.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-04-18 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'chapter_versions',
        sa.Column('id', sa.String(length=32), primary_key=True),
        sa.Column(
            'chapter_id',
            sa.String(length=32),
            sa.ForeignKey('chapters.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False, server_default=''),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
    )
    op.create_index(
        'ix_chapter_versions_chapter_id',
        'chapter_versions',
        ['chapter_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_chapter_versions_chapter_id', table_name='chapter_versions')
    op.drop_table('chapter_versions')
