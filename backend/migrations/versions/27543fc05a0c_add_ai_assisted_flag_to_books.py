"""add ai_assisted flag to books

Revision ID: 27543fc05a0c
Revises: 49ec96aa2e94
Create Date: 2026-04-04 20:25:17.768833

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '27543fc05a0c'
down_revision: Union[str, Sequence[str], None] = '49ec96aa2e94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('books') as batch_op:
        batch_op.add_column(sa.Column('ai_assisted', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('books') as batch_op:
        batch_op.drop_column('ai_assisted')
