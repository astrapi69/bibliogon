"""add Book.book_idea + Book.expose columns (EXPOSE-BUCHIDEE-METADATA-01)

Two new nullable Text columns on the ``books`` table for author-
design metadata distinct from the existing ``description``
(short blurb / store summary):

- ``book_idea``: short 1-2 sentence premise / elevator pitch.
  The seed concept before any plot work.
- ``expose``: long-form Exposé (Plot + Characters + Setting +
  Tone document). Standard German-publishing-domain term used
  by authors to pitch books to publishers OR as the author's
  own outline / reference document.

Books-only; all 3 book_type values (prose, picture_book,
comic_book) get both columns automatically — adding to the
shared ``books`` table requires no per-type branching. Same
``Text nullable=True`` storage as ``description``.

Reversible: downgrade drops both columns cleanly. No data
migration — both columns are born NULL on every existing row.

Revision ID: qe6f7a8b9cd0
Revises: pd5e6f7a8b9c
Create Date: 2026-05-23 19:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "qe6f7a8b9cd0"
down_revision: Union[str, Sequence[str], None] = "pd5e6f7a8b9c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(sa.Column("book_idea", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("expose", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_column("expose")
        batch_op.drop_column("book_idea")
