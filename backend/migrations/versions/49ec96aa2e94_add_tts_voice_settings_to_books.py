"""add tts voice settings to books

Revision ID: 49ec96aa2e94
Revises: fd1e9e5b4d91
Create Date: 2026-04-04 10:58:57.678238

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '49ec96aa2e94'
down_revision: Union[str, Sequence[str], None] = 'fd1e9e5b4d91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add TTS voice settings columns to books table."""
    with op.batch_alter_table('books') as batch_op:
        batch_op.add_column(sa.Column('tts_engine', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('tts_voice', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('tts_language', sa.String(length=10), nullable=True))


def downgrade() -> None:
    """Remove TTS voice settings columns from books table."""
    with op.batch_alter_table('books') as batch_op:
        batch_op.drop_column('tts_language')
        batch_op.drop_column('tts_voice')
        batch_op.drop_column('tts_engine')
