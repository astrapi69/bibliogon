"""Tests for the agent database snapshot tool (#794).

An agent doing schema-touching work must run against its own copy of
the dev database. The live instance is off limits: while #782 was on a
feature branch, the reloading dev server picked up the new model and
applied a branch migration to Aster's database.
"""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO_ROOT / "scripts" / "agent_db_snapshot.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("agent_db_snapshot", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


snapshot = _load_module()


def _make_db(path: Path, rows: int = 3) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute("create table books (id text primary key, title text)")
    connection.executemany(
        "insert into books values (?, ?)",
        [(f"b{index}", f"Buch {index}") for index in range(rows)],
    )
    connection.commit()
    connection.close()


class TestSnapshot:
    def test_copies_every_row_into_the_agent_directory(self, tmp_path: Path) -> None:
        live = tmp_path / "live"
        agent = tmp_path / "agent"
        _make_db(live / "bibliogon.db")

        result = snapshot.snapshot(live, agent)

        copied = sqlite3.connect(result.target_db).execute("select count(*) from books").fetchone()
        assert copied[0] == 3
        assert result.target_db == agent / "bibliogon.db"

    def test_refuses_to_write_onto_the_live_directory(self, tmp_path: Path) -> None:
        """The whole point of the tool - a typo must not overwrite the
        database it is supposed to protect."""
        live = tmp_path / "live"
        _make_db(live / "bibliogon.db")

        with pytest.raises(snapshot.SnapshotError, match="live"):
            snapshot.snapshot(live, live)

    def test_refuses_a_nested_target_inside_the_live_directory(self, tmp_path: Path) -> None:
        live = tmp_path / "live"
        _make_db(live / "bibliogon.db")

        with pytest.raises(snapshot.SnapshotError):
            snapshot.snapshot(live, live / "agent-copy")

    def test_refuses_to_clobber_an_existing_copy(self, tmp_path: Path) -> None:
        live = tmp_path / "live"
        agent = tmp_path / "agent"
        _make_db(live / "bibliogon.db")
        snapshot.snapshot(live, agent)

        with pytest.raises(snapshot.SnapshotError, match="--force"):
            snapshot.snapshot(live, agent)

    def test_force_replaces_the_existing_copy(self, tmp_path: Path) -> None:
        live = tmp_path / "live"
        agent = tmp_path / "agent"
        _make_db(live / "bibliogon.db", rows=1)
        snapshot.snapshot(live, agent)

        _make_db_path = live / "bibliogon.db"
        connection = sqlite3.connect(_make_db_path)
        connection.execute("insert into books values ('b99', 'Nachzuegler')")
        connection.commit()
        connection.close()

        result = snapshot.snapshot(live, agent, force=True)
        rows = sqlite3.connect(result.target_db).execute("select count(*) from books").fetchone()
        assert rows[0] == 2

    def test_a_missing_live_database_is_a_clear_error(self, tmp_path: Path) -> None:
        with pytest.raises(snapshot.SnapshotError, match="no database"):
            snapshot.snapshot(tmp_path / "nowhere", tmp_path / "agent")

    def test_the_copy_survives_an_open_writer_with_a_wal(self, tmp_path: Path) -> None:
        """The live server holds the file open in WAL mode. Copying the
        main file alone would lose committed-but-uncheckpointed rows, so
        the tool uses SQLite's backup API."""
        live = tmp_path / "live"
        agent = tmp_path / "agent"
        _make_db(live / "bibliogon.db")

        writer = sqlite3.connect(live / "bibliogon.db")
        writer.execute("pragma journal_mode=wal")
        writer.execute("insert into books values ('b-wal', 'Im WAL')")
        writer.commit()
        try:
            result = snapshot.snapshot(live, agent)
            titles = {
                row[0]
                for row in sqlite3.connect(result.target_db).execute("select title from books")
            }
        finally:
            writer.close()
        assert "Im WAL" in titles


class TestEnvLine:
    def test_env_line_points_at_the_agent_directory(self, tmp_path: Path) -> None:
        line = snapshot.env_line(tmp_path / "agent")
        assert "BIBLIOGON_DATA_DIR=" in line
        assert str(tmp_path / "agent") in line

    def test_default_agent_dir_is_inside_the_repo_and_gitignored(self) -> None:
        """A copy of the user's library must never become a commit."""
        default = snapshot.default_agent_dir()
        assert default.is_relative_to(REPO_ROOT)
        gitignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
        assert default.name in gitignore or f"{default.name}/" in gitignore
