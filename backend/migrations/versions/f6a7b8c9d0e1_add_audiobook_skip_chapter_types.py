"""add audiobook_skip_chapter_types to books

Migrates the former plugin-global ``audiobook.settings.skip_types`` list
to a per-book column. On upgrade, the current YAML value is read once
and used as the seed for every existing book so the export pipeline
keeps skipping the same chapter types it always did. After the
migration the YAML key is removed.

The column stores a JSON-encoded list of chapter type strings, mirroring
how Book.keywords is stored.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-11 16:00:00.000000

"""
import json
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Built-in default that mirrors the former plugin-global YAML value and
# the audiobook generator's hardcoded SKIP_TYPES fallback. Used both as
# the migration seed when the YAML cannot be read and as the default for
# brand-new books created after the migration.
DEFAULT_SKIP_TYPES = ["toc", "imprint", "index", "bibliography", "endnotes"]


def _read_legacy_yaml_default() -> list[str]:
    """Return the former plugin-global skip_types value, or the built-in default.

    Tolerates a missing YAML file (fresh installs, tests) or a missing
    key (re-run on a partially upgraded DB) and falls back to the
    DEFAULT_SKIP_TYPES list silently.
    """
    path = Path("config/plugins/audiobook.yaml")
    if not path.exists():
        return list(DEFAULT_SKIP_TYPES)
    try:
        import yaml
    except ImportError:
        return list(DEFAULT_SKIP_TYPES)
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception:
        return list(DEFAULT_SKIP_TYPES)
    settings = data.get("settings") or {}
    raw = settings.get("skip_types")
    if isinstance(raw, list):
        return [str(s) for s in raw if str(s).strip()]
    return list(DEFAULT_SKIP_TYPES)


def upgrade() -> None:
    seed = _read_legacy_yaml_default()
    seed_json = json.dumps(seed)

    with op.batch_alter_table('books') as batch_op:
        batch_op.add_column(
            sa.Column(
                'audiobook_skip_chapter_types',
                sa.Text(),
                nullable=True,
            )
        )

    op.execute(
        sa.text(
            "UPDATE books SET audiobook_skip_chapter_types = :seed"
        ).bindparams(seed=seed_json)
    )


def downgrade() -> None:
    with op.batch_alter_table('books') as batch_op:
        batch_op.drop_column('audiobook_skip_chapter_types')
