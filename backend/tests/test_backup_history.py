"""Tests for BackupHistory (CW-10).

Covers initialization, add/list/clear operations, entry limits,
and defensive loading of corrupt or unexpected JSON data.
"""

import json

import pytest

from app.backup_history import BackupHistory


@pytest.fixture()
def history(tmp_path):
    """BackupHistory pointing at a temporary file."""
    return BackupHistory(path=tmp_path / "history.json")


def test_empty_history_returns_empty_list(history):
    """A fresh BackupHistory with no file on disk returns an empty list."""
    assert history.list() == []


def test_add_inserts_at_front(history):
    """Entries are inserted newest-first: the second add is at index 0."""
    history.add(action="backup", filename="first.bgb")
    history.add(action="restore", filename="second.bgb")

    entries = history.list()
    assert len(entries) == 2
    assert entries[0]["filename"] == "second.bgb"
    assert entries[1]["filename"] == "first.bgb"


def test_add_returns_entry_with_fields(history):
    """The dict returned by add() contains all expected metadata fields."""
    entry = history.add(
        action="backup",
        book_count=3,
        chapter_count=12,
        file_size_bytes=4096,
        filename="archive.bgb",
        details="full backup",
    )

    assert entry["action"] == "backup"
    assert entry["book_count"] == 3
    assert entry["chapter_count"] == 12
    assert entry["file_size_bytes"] == 4096
    assert entry["filename"] == "archive.bgb"
    assert entry["details"] == "full backup"
    assert "timestamp" in entry


def test_list_respects_limit(history):
    """list(limit=N) returns at most N entries."""
    for i in range(5):
        history.add(action="backup", filename=f"file-{i}.bgb")

    entries = history.list(limit=3)
    assert len(entries) == 3


def test_clear_empties_entries(history):
    """After clear(), the history is empty."""
    history.add(action="backup", filename="a.bgb")
    history.add(action="restore", filename="b.bgb")
    history.clear()

    assert history.list() == []


def test_max_100_entries(history):
    """The history never stores more than 100 entries."""
    for i in range(105):
        history.add(action="backup", filename=f"file-{i}.bgb")

    entries = history.list(limit=200)
    assert len(entries) == 100


def test_load_handles_corrupt_json(tmp_path):
    """Corrupt JSON on disk does not crash; the history starts empty."""
    history_path = tmp_path / "history.json"
    history_path.write_text("NOT VALID JSON {{{", encoding="utf-8")

    history = BackupHistory(path=history_path)
    assert history.list() == []


def test_load_handles_dict_shaped_data(tmp_path):
    """A dict instead of a list on disk does not crash; the history starts empty."""
    history_path = tmp_path / "history.json"
    history_path.write_text(json.dumps({}), encoding="utf-8")

    history = BackupHistory(path=history_path)
    assert history.list() == []
