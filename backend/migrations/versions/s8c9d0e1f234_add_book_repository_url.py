"""add Book.repository_url column (BOOK-REPOSITORY-URL-FIELD-01)

Optional ``repository_url`` column on the ``books`` table for
authors who track their book project in a git repository
outside plugin-git-sync.

Two source paths overlap conceptually:

- plugin-git-sync imports: ``GitSyncMapping.repo_url`` holds the
  canonical URL + branch + clone path for the round-trip (commit
  + push) flow. When that row exists, the UI surfaces it
  read-only.
- Manual tracking: the author maintains the repo themselves
  (no plugin-git-sync round-trip) and just wants the URL stored
  in book metadata. This new column carries the value for that
  case.

``GitSyncMapping`` is NOT relaxed (its NOT NULL constraints on
``local_clone_path`` + ``last_imported_commit_sha`` stay) — the
two storage shapes serve different lifecycles.

Reversible: downgrade drops the column cleanly. No data
migration — the column is born NULL on every existing row.

Revision ID: s8c9d0e1f234
Revises: rf7a8b9cd0e1
Create Date: 2026-05-25 13:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s8c9d0e1f234"
down_revision: Union[str, Sequence[str], None] = "rf7a8b9cd0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(sa.Column("repository_url", sa.String(length=2000), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("repository_url")
