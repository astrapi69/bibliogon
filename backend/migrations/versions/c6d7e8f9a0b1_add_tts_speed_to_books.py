"""add tts_speed column to books

Backfills the missing migration for ``Book.tts_speed``. The column
was added to the SQLAlchemy model alongside the other TTS columns
(tts_engine, tts_voice, tts_language - migration 49ec96aa2e94)
but never got its own Alembic migration. Fresh installs received
the column via ``Base.metadata.create_all``; long-lived dev DBs
that follow the alembic upgrade path were left without it, which
broke EVERY books-table query (the trash-cleanup SELECT during
lifespan, /api/import/detect's _check_duplicate, etc.) with
``no such column: books.tts_speed`` and a 500 cascade.

This migration is the missing link. ``IF NOT EXISTS`` semantics
via the column-existence check at the top so re-running on a DB
that already has the column (created via create_all on a fresh
install) is a no-op.

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-04-25 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'c6d7e8f9a0b1'
down_revision: Union[str, Sequence[str], None] = 'b5c6d7e8f9a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    return column in [c["name"] for c in inspector.get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "books", "tts_speed"):
        return
    with op.batch_alter_table("books", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("tts_speed", sa.String(length=10), nullable=True)
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "books", "tts_speed"):
        return
    with op.batch_alter_table("books", schema=None) as batch_op:
        batch_op.drop_column("tts_speed")
