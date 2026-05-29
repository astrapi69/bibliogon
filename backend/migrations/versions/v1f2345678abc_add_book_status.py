"""add Book.status (publication-status parity with Article)

PUBLICATION-STATUS-BOOK-PARITY-01 (2026-05-29). Article already
ships a ``status`` column with four values (draft / ready /
published / archived); Book has been missing the equivalent
parity field. The Title-Editing arc's published-work warning
needs a reliable signal "has this work been published?", and
the Articles-Dashboard has a status badge that the Books-
Dashboard lacks.

Schema-Foundation pre-commitment: this column is the foundation
the Title-Editing C2 published-work warning consumes. Without
the field, the warning has no signal to gate on for books.

Reversible: downgrade drops the column. The 4 status values
are the same as Article's; the shared Pydantic Literal +
shared status validator live in
``backend/app/schemas/__init__.py``.

Revision ID: v1f2345678abc
Revises: u0e1f2345678
Create Date: 2026-05-29 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "v1f2345678abc"
down_revision: Union[str, Sequence[str], None] = "u0e1f2345678"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(
            sa.Column(
                "status",
                sa.String(length=20),
                nullable=False,
                server_default="draft",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("status")
