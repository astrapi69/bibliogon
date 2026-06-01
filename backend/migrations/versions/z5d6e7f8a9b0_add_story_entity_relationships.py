"""add StoryEntity.relationships JSON column (STORY-BIBLE C10)

One nullable Text column on ``story_entities`` holding a JSON-encoded
list of ``{target_entity_id, relationship_type, description}`` objects
(same JSON-as-Text storage convention as ``entity_metadata``). Powers
the Arc View relationship lines + the entity-detail relationship
editor.

Target ids reference other ``story_entities`` rows in the same book;
the reference lives inside the JSON blob (validated at the route layer)
rather than a DB FK, so no constraint is added here.

Reversible: downgrade drops the column. No data migration — every
existing row is born NULL.

Revision ID: z5d6e7f8a9b0
Revises: y4c5d6e7f8a9
Create Date: 2026-06-01 09:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "y4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("story_entities") as batch_op:
        batch_op.add_column(sa.Column("relationships", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("story_entities") as batch_op:
        batch_op.drop_column("relationships")
