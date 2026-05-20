"""add comic_panels + comic_bubbles tables (plugin-comics Session 2)

Plugin-comics Session 2 foundation per
docs/explorations/comic-foundation.md (schema lines 282-294) and
the user's GO message decisions (Q1 β = layout config in JSON).

Schema decisions implemented here:

- **Shared pages table**: comic_book pages reuse the existing
  ``pages`` table (Session 1 commitment, README-documented). The
  ``Book.book_type == "comic_book"`` discriminator separates
  picture-book vs comic-book pages in the same table. NO new
  ``comic_pages`` table.
- **Two new plugin-owned tables**: ``comic_panels`` (per-page
  panel hierarchy) + ``comic_bubbles`` (multi-bubble per panel).
- **JSON-as-Text** for ``bounds`` / ``panel_config`` / ``anchor``
  / ``bubble_config`` — matches the existing ``Page.layout_config``
  + ``Book.keywords`` pattern across the codebase.
- **Page-level grid template** (Q1 β): stored in the existing
  ``Page.layout_config`` JSON column under key
  ``comic_grid_template`` (e.g. ``single_panel`` / ``grid_2x2`` /
  ``grid_3x3``). NO schema enum extension; no migration churn.
- **CASCADE delete chain**: deleting a page deletes its panels;
  deleting a panel deletes its bubbles. Predictable cleanup.
- **Composite index** on ``(panel_id, position)`` for the
  N-bubbles-per-panel query (the dominant access pattern).

Plugin-architecture note: per the current Bibliogon convention
(centralised Alembic in ``backend/migrations/versions/``), this
migration lives in the backend tree even though the tables are
plugin-comics-owned semantically. SQLAlchemy models live in
``backend/app/models/__init__.py`` alongside ``Page`` for the same
reason — ``Base.metadata`` must see them at backend startup.
A future "plugin-owned migration history" feature is filed at
docs/explorations/comic-foundation.md (line 258-259) but is not
in current scope.

Out of scope for this migration (Session 3):

- ``z_order`` column on ``comic_bubbles`` (Session 3 drag adds it
  alongside drag-to-front/back controls).
- ``gutter_px`` config on ``comic_panels`` (Session 3 polish).
- ``reading_direction`` on the Book model (Session 3 RTL/LTR).

Revision ID: pd5e6f7a8b9c
Revises: oc4d5e6f7a8b
Create Date: 2026-05-20 09:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "pd5e6f7a8b9c"
down_revision: Union[str, Sequence[str], None] = "oc4d5e6f7a8b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. comic_panels: per-page panel hierarchy. FK -> pages.id
    #    (Session 1 sharing decision: comic_book pages live in the
    #    same ``pages`` table as picture-book pages, discriminated
    #    by Book.book_type).
    op.create_table(
        "comic_panels",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "page_id",
            sa.String(length=32),
            sa.ForeignKey("pages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "image_asset_id",
            sa.String(length=32),
            sa.ForeignKey("assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("bounds", sa.Text(), nullable=False),
        sa.Column("panel_config", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_comic_panels_page_id_position",
        "comic_panels",
        ["page_id", "position"],
        unique=False,
    )

    # 2. comic_bubbles: N bubbles per panel. CASCADE chain reaches
    #    here when a page is deleted: pages -> comic_panels ->
    #    comic_bubbles. Tail fields are SIBLINGS to bubble_config
    #    (per comic-foundation.md:289-291) so SQL can sort/filter on
    #    them without JSON parsing.
    op.create_table(
        "comic_bubbles",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "panel_id",
            sa.String(length=32),
            sa.ForeignKey("comic_panels.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("bubble_type", sa.String(length=32), nullable=False),
        sa.Column("anchor", sa.Text(), nullable=False),
        sa.Column("width_pct", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("height_pct", sa.Integer(), nullable=False, server_default="20"),
        sa.Column(
            "tail_direction",
            sa.String(length=8),
            nullable=False,
            server_default="none",
        ),
        sa.Column(
            "tail_position_pct",
            sa.Integer(),
            nullable=False,
            server_default="50",
        ),
        sa.Column(
            "tail_length_px", sa.Integer(), nullable=False, server_default="16"
        ),
        sa.Column("bubble_config", sa.Text(), nullable=True),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_comic_bubbles_panel_id_position",
        "comic_bubbles",
        ["panel_id", "position"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_comic_bubbles_panel_id_position", table_name="comic_bubbles"
    )
    op.drop_table("comic_bubbles")
    op.drop_index(
        "ix_comic_panels_page_id_position", table_name="comic_panels"
    )
    op.drop_table("comic_panels")
