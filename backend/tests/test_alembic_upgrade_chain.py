"""Regression gate: ``alembic upgrade head`` must run clean on a fresh
DB (ALEMBIC-UPGRADE-CHAIN-FIX).

The rest of the suite builds its schema with ``Base.metadata.create_all``
(+ ``stamp head``), which never exercises the incremental migration
path. ``init_db`` DOES run ``command.upgrade(head)`` for an existing DB
that carries an ``alembic_version`` row - i.e. every user upgrading from
a prior release. A migration that only works under ``create_all`` (e.g.
a SQLite batch recreate that trips "Constraint must have a name") passes
every other test yet crashes those upgrades on startup.

This test runs the real ``alembic upgrade head`` against a throwaway
SQLite file in a subprocess and asserts it reaches head. It is the gate
that was missing when a6e7f8a9b0c1 shipped a recreate-forcing FK column.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _clean_env(db_url: str) -> dict[str, str]:
    """Subprocess env that points Alembic at ``db_url``. BIBLIOGON_TEST
    and TEST_DATABASE_URL must be cleared - they take precedence in
    ``app.database`` and would force the in-memory URL, defeating the
    point of upgrading a real file."""
    env = dict(os.environ)
    env["DATABASE_URL"] = db_url
    for key in ("BIBLIOGON_TEST", "TEST_DATABASE_URL", "BIBLIOGON_DB_PATH"):
        env.pop(key, None)
    return env


def _alembic(args: list[str], env: dict[str, str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=_BACKEND_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )


def test_upgrade_head_runs_clean_on_fresh_db(tmp_path: Path):
    db_url = f"sqlite:///{tmp_path / 'chain.db'}"
    env = _clean_env(db_url)

    up = _alembic(["upgrade", "head"], env)
    assert up.returncode == 0, f"alembic upgrade head failed:\n{up.stderr}"

    current = _alembic(["current"], env)
    assert current.returncode == 0, current.stderr
    # ``current`` prints the head revision id followed by " (head)".
    assert "(head)" in current.stdout, f"not at head after upgrade:\n{current.stdout}"
