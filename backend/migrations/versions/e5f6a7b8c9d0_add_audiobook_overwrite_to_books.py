"""add audiobook_overwrite_existing to books

Migrates the former plugin-global ``audiobook.settings.overwrite_existing``
flag to a per-book column. On upgrade, the current YAML value is read once
and used as the seed for every existing book so the behaviour stays
identical for users who had customized the setting.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-11 14:00:00.000000

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _read_legacy_yaml_default() -> bool:
    """Return the former plugin-global overwrite_existing value, or False.

    The YAML file may not exist (fresh installs, tests) or the key may
    already be gone (re-run of the migration on a partially upgraded DB).
    Both cases fall back to False silently.
    """
    path = Path("config/plugins/audiobook.yaml")
    if not path.exists():
        return False
    try:
        import yaml
    except ImportError:
        return False
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception:
        return False
    settings = data.get("settings") or {}
    return bool(settings.get("overwrite_existing", False))


def upgrade() -> None:
    seed_value = _read_legacy_yaml_default()

    with op.batch_alter_table('books') as batch_op:
        batch_op.add_column(
            sa.Column(
                'audiobook_overwrite_existing',
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    if seed_value:
        op.execute("UPDATE books SET audiobook_overwrite_existing = 1")


def downgrade() -> None:
    with op.batch_alter_table('books') as batch_op:
        batch_op.drop_column('audiobook_overwrite_existing')
