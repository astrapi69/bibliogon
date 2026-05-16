"""add authors table (Authors-Database foundation, Bug 8 Phase 1)

Foundation for the Wizard author-dropdown (Bug 8) and the new
Settings "Authors-Database" tab. The authors table is a
standalone catalogue — NOT linked by foreign key to ``books``,
``articles`` or ``article_comments``. Those entities continue
to carry free-text ``author`` columns per D5. Authors-DB is an
opt-in suggestion layer.

Schema:

- ``name`` (String 300, required, indexed for search)
- ``slug`` (String 300, required, unique, stored explicitly so
  the unique index lives at the DB layer; slug auto-generation
  + collision-suffixing happens in the create endpoint in
  Commit 2)
- ``bio`` (Text, nullable)
- ``created_at`` / ``updated_at``

Indexes:

- ``ix_authors_name`` for name-prefix / substring search.
- Unique constraint on ``slug`` creates an implicit unique index;
  no separate ``ix_authors_slug`` needed.

Reversible: downgrade drops the table cleanly. No data migration —
the table is born empty.

Revision ID: ma2b3c4d5e6f
Revises: kb1a2b3c4d5e
Create Date: 2026-05-16 18:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ma2b3c4d5e6f"
down_revision: Union[str, Sequence[str], None] = "kb1a2b3c4d5e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "authors",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("slug", sa.String(length=300), nullable=False),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("slug", name="uq_authors_slug"),
    )
    op.create_index("ix_authors_name", "authors", ["name"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_authors_name", table_name="authors")
    op.drop_table("authors")
