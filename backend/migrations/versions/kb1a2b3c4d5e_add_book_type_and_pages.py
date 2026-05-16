"""add Book.book_type column + pages table (Picture-Book foundation)

VB-PHASE4 Session 2. Backend foundation for the Picture-Book
(plugin-kinderbuch) plugin per docs/explorations/children-book-plugin.md
and docs/audits/kinderbuch-phase4-readiness-2026-05-16.md.

Schema decision: ``book_type`` is a single-column discriminator.
Valid values:

- ``"prose"`` — existing chapter-based books (default).
- ``"picture_book"`` — v1 active; handled by plugin-kinderbuch.
- ``"comic_book"`` — reserved for the future plugin-comics. The
  value is defined in the Pydantic schema layer so a future
  ``plugin-comics`` migration can add the panel + speech_bubbles
  tables WITHOUT touching the ``book_type`` discriminator again.

No intermediate ``visual_book`` umbrella + sub_type pair. Each
visual book_type is owned by its own plugin. The schema is
plugin-discriminator, not architecture-umbrella.

Default ``"prose"`` is applied to every existing row via
server_default so the migration is data-safe for pre-existing
prose books with no separate backfill.

``pages`` table holds one row per visual page (cover is Page 1,
no separate Cover entity). Cascade-delete from ``books``;
``image_asset_id`` FK SET NULL so deleting an image asset does
NOT destroy the page. ``speech_bubble_config`` is JSON-as-Text
(same pattern as ``books.keywords`` / ``chapter_summaries``).

Composite index ``ix_pages_book_id_position`` for ordered
queries (the dominant access pattern).

Layout strings (validated at the Pydantic schema layer, not the
DB layer; matches the ``Chapter.chapter_type`` pattern):

- Picture Book: ``speech_bubble``, ``image_top_text_bottom``,
  ``image_left_text_right``, ``image_full_text_overlay``,
  ``text_only``.

Out of scope for this migration (future plugin-comics):

- ``panels`` table.
- ``speech_bubbles`` table.
- comic-specific routes + validation gates.

Revision ID: kb1a2b3c4d5e
Revises: f0a1b2c3d4e5
Create Date: 2026-05-16 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "kb1a2b3c4d5e"
down_revision: Union[str, Sequence[str], None] = "f0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add the Book discriminator column. server_default ensures
    #    every existing row gets "prose" without a separate backfill.
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(
            sa.Column(
                "book_type",
                sa.String(length=30),
                nullable=False,
                server_default="prose",
            )
        )

    # 2. Create pages table.
    op.create_table(
        "pages",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "book_id",
            sa.String(length=32),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("layout", sa.String(length=50), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column(
            "image_asset_id",
            sa.String(length=32),
            sa.ForeignKey("assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("speech_bubble_config", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_pages_book_id_position", "pages", ["book_id", "position"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_pages_book_id_position", table_name="pages")
    op.drop_table("pages")
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("book_type")
