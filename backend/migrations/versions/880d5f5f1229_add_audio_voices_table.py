"""add audio_voices table

Revision ID: 880d5f5f1229
Revises: 27543fc05a0c
Create Date: 2026-04-05 17:03:41.582245
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '880d5f5f1229'
down_revision: Union[str, Sequence[str], None] = '27543fc05a0c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'audio_voices',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('engine', sa.String(length=50), nullable=False),
        sa.Column('language', sa.String(length=20), nullable=False),
        sa.Column('voice_id', sa.String(length=200), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('gender', sa.String(length=20), nullable=False, server_default='unknown'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('voice_id'),
    )
    op.create_index('ix_audio_voices_engine', 'audio_voices', ['engine'])
    op.create_index('ix_audio_voices_language', 'audio_voices', ['language'])


def downgrade() -> None:
    op.drop_index('ix_audio_voices_language', 'audio_voices')
    op.drop_index('ix_audio_voices_engine', 'audio_voices')
    op.drop_table('audio_voices')
