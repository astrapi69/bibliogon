"""add story_entities table (plugin-story-bible Session 2)

STORY-BIBLE-PLUGIN-01 Session 2 (2026-05-30). A per-book database of
fiction-writing entities (character / setting / plot_point / item /
lore) for the Story Bible plugin.

Schema decisions (per docs/audits/story-bible-pre-inspection-2026-05-30.md):

- **Single table + discriminator**: one ``story_entities`` table with
  an ``entity_type`` column (validated at the Pydantic layer via the
  StoryEntityType Literal, NOT at the DB layer) + a per-type
  ``entity_metadata`` JSON-as-Text column. Mirrors
  Article.content_type / article_metadata.
- **Per-book scope (v1)**: ``book_id`` FK with CASCADE delete. Cross-
  book / series-spanning is deferred.
- **JSON-as-Text** for ``entity_metadata`` (same pattern as
  Page.layout_config / ComicPanel.bounds). ``description`` holds the
  TipTap JSON document as text (same as Chapter.content).
- **image_asset_id** FK SET NULL so deleting an asset does not destroy
  the entity (mirrors Page.image_asset_id).
- **Composite index** on ``(book_id, entity_type, position)`` for the
  dominant "list a book's entities of one type, ordered" query.

Plugin-architecture note: per Bibliogon's centralised Alembic
convention, this migration lives in the backend tree even though the
table is plugin-story-bible-owned semantically. The SQLAlchemy model
lives in ``backend/app/models/__init__.py`` for the same reason
(``Base.metadata`` must see it at backend startup).

Revision ID: w2a3b4c5d6e7
Revises: v1f2345678abc
Create Date: 2026-05-30 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "v1f2345678abc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "story_entities",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "book_id",
            sa.String(length=32),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("entity_metadata", sa.Text(), nullable=True),
        sa.Column(
            "image_asset_id",
            sa.String(length=32),
            sa.ForeignKey("assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_story_entities_book_type_position",
        "story_entities",
        ["book_id", "entity_type", "position"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_story_entities_book_type_position", table_name="story_entities"
    )
    op.drop_table("story_entities")
