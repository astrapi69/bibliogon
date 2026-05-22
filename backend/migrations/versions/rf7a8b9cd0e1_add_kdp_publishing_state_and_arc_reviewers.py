"""add book_publishing_state + arc_reviewers tables (KDP Phase 2 C4)

KDP-PUBLISHING-WIZARD-01-PHASE-2 Session 1 C4 per
``docs/audits/kdp-publishing-wizard-phase-2-pre-inspection-2026-05-22.md``
Track 2 + Track 4.

Schema decisions implemented here:

- **book_publishing_state** (1:1 with books via UNIQUE(book_id))
  stores per-book commercial / launch state for the KDP
  publishing wizard. One row per Book; created on first wizard
  save by the upsert endpoint in C5.
- **arc_reviewers** (N:1 via publishing_state_id) stores ARC
  (Advance Reader Copy) reviewer-tracking rows. Linked to the
  publishing-state row, NOT to the book directly, per A20: ARC
  reviewers exist only in the context of a launch workflow.
- **JSON-as-Text** for ``prices`` + ``launch_checklist_state``
  per the existing Bibliogon convention
  (``Page.layout_config``, ``Book.keywords``, etc.).
- **CASCADE chain**: Book delete → publishing_state delete →
  arc_reviewers delete. Soft-delete (``Book.deleted_at``) does
  NOT trigger; CASCADE fires only on hard delete (empty trash).
- **UNIQUE constraint** on ``book_publishing_state.book_id``
  enforces the 1:1 at the DB layer (A13).
- **Composite index** on ``(publishing_state_id, review_status)``
  for the reviewer-list-by-status query (dashboard view).

Plugin-architecture note: per Bibliogon's centralised Alembic
convention (matching ``ComicPanel`` + ``ComicBubble``), this
migration lives in the backend tree even though the tables are
plugin-kdp-owned semantically.

No data migration: every existing Book gets NULL state on next
read. First wizard save creates the row via the upsert endpoint.

Revision ID: rf7a8b9cd0e1
Revises: qe6f7a8b9cd0
Create Date: 2026-05-22 13:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "rf7a8b9cd0e1"
down_revision: Union[str, Sequence[str], None] = "qe6f7a8b9cd0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. book_publishing_state: 1:1 with books via UNIQUE(book_id).
    op.create_table(
        "book_publishing_state",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "book_id",
            sa.String(length=32),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("royalty_plan", sa.String(length=8), nullable=True),
        sa.Column(
            "kdp_select_enrolled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "kdp_select_enrollment_date",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "expanded_distribution",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "prices", sa.Text(), nullable=False, server_default="{}"
        ),
        sa.Column(
            "launch_checklist_state",
            sa.Text(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "publication_target_date",
            sa.String(length=20),
            nullable=True,
        ),
        sa.Column(
            "last_kdp_upload_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_book_publishing_state_book_id",
        "book_publishing_state",
        ["book_id"],
        unique=True,
    )

    # 2. arc_reviewers: N:1 with book_publishing_state via
    #    publishing_state_id. CASCADE chain reaches here when a
    #    book is hard-deleted: books → book_publishing_state →
    #    arc_reviewers.
    op.create_table(
        "arc_reviewers",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "publishing_state_id",
            sa.String(length=32),
            sa.ForeignKey(
                "book_publishing_state.id", ondelete="CASCADE"
            ),
            nullable=False,
        ),
        sa.Column("reviewer_name", sa.String(length=300), nullable=False),
        sa.Column("reviewer_email", sa.String(length=320), nullable=True),
        sa.Column(
            "review_status",
            sa.String(length=32),
            nullable=False,
            server_default="invited",
        ),
        sa.Column("copy_version", sa.String(length=50), nullable=True),
        sa.Column(
            "review_permalink", sa.String(length=2000), nullable=True
        ),
        sa.Column("review_text_excerpt", sa.Text(), nullable=True),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_arc_reviewers_publishing_state_id_status",
        "arc_reviewers",
        ["publishing_state_id", "review_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_arc_reviewers_publishing_state_id_status",
        table_name="arc_reviewers",
    )
    op.drop_table("arc_reviewers")
    op.drop_index(
        "ix_book_publishing_state_book_id",
        table_name="book_publishing_state",
    )
    op.drop_table("book_publishing_state")
