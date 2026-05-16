"""add Book.categories + Book.bisac_codes columns (Bug 9)

Two new nullable Text columns on the ``books`` table holding
JSON-encoded list[str] payloads. Follows the ``books.keywords``
precedent (Text storage of a JSON-stringified list rather than a
real JSON type, so the diff / backup paths stay simple).

- ``categories``: free-text category names. The KDP plugin's
  ``config/kdp.yaml`` ships 25 canonical suggestions; the column
  itself accepts any string because other retailers (Apple Books,
  Kobo, Ingram) have their own taxonomies.
- ``bisac_codes``: industry-standard 9-char codes (3 letters +
  6 digits, e.g. ``FIC022020``). Format validation lives in the
  Pydantic schema layer + a regex; the DB stores the strings
  verbatim. Per D3, NO bundled BISAC catalogue ships with
  Bibliogon — the BISG licensing terms are incompatible with
  the local-first model. ``BISAC-DATABASE-LOOKUP-01`` (P5) is
  the deferred enhancement path if the licensing landscape
  shifts.

Books-only by design (D9). Articles use ``Article.topic`` (single
enum from ``config/app.yaml``) + ``Article.tags`` (free-text
JSON list) — see the "Intentional asymmetry" lessons-learned
entry. Bibliogon's two domain models have fundamentally
different metadata shapes; forcing the same fields on both would
help neither.

Reversible: downgrade drops both columns cleanly. No data
migration — both columns are born NULL on every existing row.

Revision ID: nb3c4d5e6f7a
Revises: ma2b3c4d5e6f
Create Date: 2026-05-16 18:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "nb3c4d5e6f7a"
down_revision: Union[str, Sequence[str], None] = "ma2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(sa.Column("categories", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("bisac_codes", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("bisac_codes")
        batch_op.drop_column("categories")
