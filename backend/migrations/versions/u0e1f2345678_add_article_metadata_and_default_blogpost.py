"""rename Article.content_type values + add article_metadata column

ARTICLE-TYPES-SSOT-01 (2026-05-29). The reserved
``Article.content_type`` column (default ``"article"``) is
repurposed as the article-type discriminator per the model
docstring's stated intent: "exists so a future Blogpost / Tweet
differentiation can land without a schema change".

Two changes:

1. **Backfill ``content_type``**: every row carrying the legacy
   default ``"article"`` is rewritten to ``"blogpost"``. The new
   article-types registry (article-types.yaml) ships
   blogpost as the canonical default; rows with non-default
   values (none expected pre-migration, but the migration is
   defensive) are left alone.

2. **Add ``article_metadata`` JSON-text column** (nullable). Per-
   type extra fields (tutorial difficulty_level, review rating,
   newsletter issue_number, etc.) live here as a JSON object,
   keyed by the schema entries in article-types.yaml.

Schema-Foundation per the C1 Pre-Inspection: column ships in C1
so the C5+ frontend type-specific fields can write to it without
a second migration round-trip.

Reversible: downgrade reverts ``"blogpost"`` rows back to
``"article"`` and drops the metadata column. Note that any rows
that were originally ``"tutorial"`` / ``"review"`` / ``"essay"``
/ ``"newsletter"`` survive downgrade unchanged — only the
canonical-default mapping is reversed.

Revision ID: u0e1f2345678
Revises: t9d0e1f23456
Create Date: 2026-05-29 10:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u0e1f2345678"
down_revision: Union[str, Sequence[str], None] = "t9d0e1f23456"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("articles") as batch_op:
        batch_op.add_column(sa.Column("article_metadata", sa.Text(), nullable=True))

    op.execute(
        "UPDATE articles SET content_type = 'blogpost' "
        "WHERE content_type = 'article'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE articles SET content_type = 'article' "
        "WHERE content_type = 'blogpost'"
    )

    with op.batch_alter_table("articles") as batch_op:
        batch_op.drop_column("article_metadata")
