"""add is_profile_author flag to authors

Marks Authors-Database rows mirrored from the user's author profile
(real name + pen names) via the opt-in "Add to database" button, so the
Authors-Database list can badge them. Defaults to 0 (false) for every
existing row; the column is NOT NULL with a server_default so the
backfill is implicit.

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-06-10 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("authors") as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_profile_author",
                sa.Boolean(),
                nullable=False,
                server_default="0",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("authors") as batch_op:
        batch_op.drop_column("is_profile_author")
