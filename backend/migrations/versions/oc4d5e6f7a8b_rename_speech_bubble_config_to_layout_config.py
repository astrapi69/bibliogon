"""rename pages.speech_bubble_config -> pages.layout_config (PB-PHASE4 Session 4b/4c)

The column was added in PB-PHASE4 Session 2 (revision
``kb1a2b3c4d5e``) under the name ``speech_bubble_config`` because
its initial use case was the speech-bubble layout's anchor
position. Session 4b/4c generalizes the column to hold any
per-page layout configuration:

- ``speech_bubble``: ``{anchor_position, opacity}``
- ``image_top_text_bottom``: ``{image_position, image_fit}``
- ``image_left_text_right``: ``{split_ratio, image_fit}``
- ``image_full_text_overlay``: ``{text_position,
  text_backdrop_opacity}``
- ``text_only``: ``{}`` (no config keys)

The field name now reflects content semantic. Future
``plugin-comics`` will use the same column for comic-specific
layout configs (panel-positions, bubble-anchors) without
schema fragmentation. Schema-level "use what already exists".

Mechanical column-rename. The JSON-as-Text shape is unchanged;
existing rows' dict payloads deserialize unchanged into the
renamed column. Zero data corruption risk; no backfill.

Reversible: downgrade renames back to ``speech_bubble_config``.
Existing rows survive a round-trip cleanly.

Revision ID: oc4d5e6f7a8b
Revises: nb3c4d5e6f7a
Create Date: 2026-05-17 18:30:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "oc4d5e6f7a8b"
down_revision: Union[str, Sequence[str], None] = "nb3c4d5e6f7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("pages") as batch_op:
        batch_op.alter_column(
            "speech_bubble_config",
            new_column_name="layout_config",
        )


def downgrade() -> None:
    with op.batch_alter_table("pages") as batch_op:
        batch_op.alter_column(
            "layout_config",
            new_column_name="speech_bubble_config",
        )
