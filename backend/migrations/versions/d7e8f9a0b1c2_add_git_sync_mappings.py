"""add git_sync_mappings table

PGS-02 foundation: persistent per-book mapping for the
plugin-git-sync sync-back path. A row is written when the wizard
completes a git import; the "Commit to Repo" button reads it to
locate the on-disk clone and the remote URL/branch to push to.

Schema:
    book_id (PK, FK books.id ON DELETE CASCADE) - one row per book
    repo_url - normalized remote URL the clone was made from
    branch - branch the import targeted (default "main")
    last_imported_commit_sha - HEAD sha at import time
    local_clone_path - absolute path under uploads/git-sync/{book_id}/
    last_committed_at - nullable; set on each successful commit-to-repo

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-04-25 16:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, table: str) -> bool:
    inspector = sa.inspect(bind)
    return table in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "git_sync_mappings"):
        return
    op.create_table(
        "git_sync_mappings",
        sa.Column("book_id", sa.String(length=32), primary_key=True),
        sa.Column("repo_url", sa.String(length=2000), nullable=False),
        sa.Column("branch", sa.String(length=200), nullable=False, server_default="main"),
        sa.Column("last_imported_commit_sha", sa.String(length=64), nullable=False),
        sa.Column("local_clone_path", sa.String(length=2000), nullable=False),
        sa.Column("last_committed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "git_sync_mappings"):
        return
    op.drop_table("git_sync_mappings")
