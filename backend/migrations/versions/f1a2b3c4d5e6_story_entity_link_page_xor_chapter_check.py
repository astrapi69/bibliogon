"""story_entity_page_links: CHECK exactly-one-of(page_id, chapter_id) (QA L4)

The page/chapter XOR invariant on ``story_entity_page_links`` was previously
enforced only at the Pydantic/route layer. Add the equivalent DB-level CHECK
constraint so a raw-SQL insert can't create a both-set or neither-set link.

``(page_id IS NULL) <> (chapter_id IS NULL)`` is true iff exactly one of the
two FKs is NULL. SQLite cannot ``ALTER TABLE ... ADD CONSTRAINT`` for a CHECK,
so this goes through ``batch_alter_table`` (table recreate); the recreate
reflects + preserves the existing FKs (all ``ON DELETE CASCADE``) and indexes.
On a clean DB (the alembic-chain gate) the table is empty, so the recreate is
trivially safe; existing installs already satisfy the invariant via the route
guard.

Revision ID: f1a2b3c4d5e6
Revises: e0c1d2e3f4a5
Create Date: 2026-06-02 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e0c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CK_NAME = "ck_story_entity_link_page_xor_chapter"


def upgrade() -> None:
    with op.batch_alter_table("story_entity_page_links", recreate="always") as batch_op:
        batch_op.create_check_constraint(
            _CK_NAME,
            "(page_id IS NULL) <> (chapter_id IS NULL)",
        )


def downgrade() -> None:
    with op.batch_alter_table("story_entity_page_links", recreate="always") as batch_op:
        batch_op.drop_constraint(_CK_NAME, type_="check")
