"""add story_entity_page_links table

STORY-BIBLE-STORYBOARD-INTEGRATION-01 Session B C4 (2026-05-30). Join
table linking a Story Bible entity to a specific page (picture/comic
books) or chapter (prose books) — "Character X appears on page Y", the
core Storyboard <-> Story Bible connection.

Schema decisions:

- ``entity_id`` FK CASCADE: deleting the entity removes its links.
- ``page_id`` / ``chapter_id`` both nullable FK CASCADE: a link
  references EITHER a page OR a chapter (exactly one is set, enforced
  at the route layer, not the DB layer — same convention as the rest
  of the schema). Deleting the page/chapter removes the link.
- ``role`` (optional free-text: protagonist / mentioned / appears /
  location) + ``notes`` (optional short context).
- Indexes on entity_id / page_id / chapter_id for the two dominant
  query directions ("where does this entity appear?" + "which entities
  appear here?").

Revision ID: x3b4c5d6e7f8
Revises: w2a3b4c5d6e7
Create Date: 2026-05-30 17:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "x3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "w2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "story_entity_page_links",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "entity_id",
            sa.String(length=32),
            sa.ForeignKey("story_entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "page_id",
            sa.String(length=32),
            sa.ForeignKey("pages.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "chapter_id",
            sa.String(length=32),
            sa.ForeignKey("chapters.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("role", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_story_entity_links_entity", "story_entity_page_links", ["entity_id"])
    op.create_index("ix_story_entity_links_page", "story_entity_page_links", ["page_id"])
    op.create_index("ix_story_entity_links_chapter", "story_entity_page_links", ["chapter_id"])


def downgrade() -> None:
    op.drop_index("ix_story_entity_links_chapter", table_name="story_entity_page_links")
    op.drop_index("ix_story_entity_links_page", table_name="story_entity_page_links")
    op.drop_index("ix_story_entity_links_entity", table_name="story_entity_page_links")
    op.drop_table("story_entity_page_links")
