"""add AI-template columns to articles and books

Session 1 of UNIVERSAL-AI-TEMPLATE-01. Adds four columns that
back the AI-fillable image-prompt and chapter-summary fields
exported / imported through the ``.biblio.yaml`` template
format.

Columns:

- ``articles.featured_image_prompt`` (TEXT, nullable):
  Stable-Diffusion-style prompt for the article's hero image.
  NULL when the user has not yet generated one. Free-form text;
  no length cap because prompts can include detailed style
  hints.

- ``articles.inline_image_prompts`` (TEXT NOT NULL DEFAULT
  ``'[]'``): JSON-encoded list of objects with shape
  ``[{section_hint, prompt}]``. Empty list when the user has
  not yet generated section-level prompts. Same
  JSON-list-stored-as-text precedent as ``articles.tags`` and
  ``books.keywords`` — Bibliogon stores typed lists as JSON
  strings rather than using the SQLAlchemy JSON type so the
  diff/version-history paths and the bgb-backup serializer
  treat them identically.

- ``books.cover_image_prompt`` (TEXT, nullable): book-cover
  equivalent of the article hero prompt.

- ``books.chapter_summaries`` (TEXT NOT NULL DEFAULT
  ``'[]'``): JSON-encoded list of objects with shape
  ``[{chapter_id, title, summary}]``. Empty list when no
  summaries exist. Same JSON-list-stored-as-text precedent
  as above. Reconciliation rules on template import live in
  the AI-template service (match-by-chapter_id with
  whitespace-normalized case-insensitive title fallback).

NOTE FOR REVIEWERS / CONTRIBUTORS: after pulling this
migration, delete ``backend/bibliogon.db`` before running
``make test``. The conftest fixture calls
``Base.metadata.create_all`` with the new schema while the
on-disk DB still pins ``alembic_version`` to the previous
revision; the lifespan ``init_db()`` then tries to re-add
the columns via ALTER TABLE and crashes with ``duplicate
column name``. See ``.claude/rules/lessons-learned.md``
section "Alembic migration + fresh test DB" for the full
explanation.

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-05-11 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, Sequence[str], None] = "d8e9f0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    article_columns = {c["name"] for c in inspector.get_columns("articles")}
    with op.batch_alter_table("articles") as batch:
        if "featured_image_prompt" not in article_columns:
            batch.add_column(
                sa.Column("featured_image_prompt", sa.Text(), nullable=True)
            )
        if "inline_image_prompts" not in article_columns:
            batch.add_column(
                sa.Column(
                    "inline_image_prompts",
                    sa.Text(),
                    nullable=False,
                    server_default=sa.text("'[]'"),
                )
            )

    book_columns = {c["name"] for c in inspector.get_columns("books")}
    with op.batch_alter_table("books") as batch:
        if "cover_image_prompt" not in book_columns:
            batch.add_column(
                sa.Column("cover_image_prompt", sa.Text(), nullable=True)
            )
        if "chapter_summaries" not in book_columns:
            batch.add_column(
                sa.Column(
                    "chapter_summaries",
                    sa.Text(),
                    nullable=False,
                    server_default=sa.text("'[]'"),
                )
            )


def downgrade() -> None:
    with op.batch_alter_table("books") as batch:
        batch.drop_column("chapter_summaries")
        batch.drop_column("cover_image_prompt")
    with op.batch_alter_table("articles") as batch:
        batch.drop_column("inline_image_prompts")
        batch.drop_column("featured_image_prompt")
