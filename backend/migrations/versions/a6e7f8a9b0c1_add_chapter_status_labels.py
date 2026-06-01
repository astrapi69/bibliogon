"""add Chapter status + per-book chapter labels (CHAPTER-STATUS-LABELS-01)

Drafting-workflow metadata for prose chapters (Scrivener parity):

- ``chapters.status`` (String(20), nullable): a fixed workflow enum
  (todo / first_draft / revised / final), Literal-validated in
  Pydantic per the ``chapter_type`` / ``story_beat`` precedent. Born
  NULL = no status.
- New ``chapter_labels`` table: a per-book, user-definable set of
  named, colored labels (id, book_id, name, color, position,
  created_at). One label per chapter.
- ``chapters.label_id`` (String(32), nullable, FK chapter_labels.id
  ON DELETE SET NULL): the chapter's assigned label. Deleting a label
  clears the assignment rather than cascading the chapters away.

Reversible: downgrade drops label_id + status from chapters, then the
chapter_labels table. No data migration — every existing chapter is
born NULL on both new columns.

Revision ID: a6e7f8a9b0c1
Revises: z5d6e7f8a9b0
Create Date: 2026-06-01 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a6e7f8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "z5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chapter_labels",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "book_id",
            sa.String(length=32),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.add_column(sa.Column("status", sa.String(length=20), nullable=True))
        batch_op.add_column(
            sa.Column(
                "label_id",
                sa.String(length=32),
                sa.ForeignKey("chapter_labels.id", ondelete="SET NULL"),
                nullable=True,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.drop_column("label_id")
        batch_op.drop_column("status")
    op.drop_table("chapter_labels")
