"""Tests for launcher.lockfile."""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

from bibliogon_launcher import lockfile


class TestReadWriteClear:

    def test_write_and_read_roundtrip(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.lock"
        lockfile.write_lock(path, pid=4242)
        assert lockfile.read_lock(path) == 4242

    def test_read_returns_none_when_missing(self, tmp_path: Path) -> None:
        assert lockfile.read_lock(tmp_path / "does-not-exist.lock") is None

    def test_read_returns_none_on_garbage(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.lock"
        path.write_text("not-a-number", encoding="utf-8")
        assert lockfile.read_lock(path) is None

    def test_clear_removes_the_file(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.lock"
        path.write_text("1234", encoding="utf-8")
        lockfile.clear_lock(path)
        assert not path.exists()

    def test_clear_is_noop_when_file_missing(self, tmp_path: Path) -> None:
        lockfile.clear_lock(tmp_path / "does-not-exist.lock")  # must not raise

    def test_write_creates_parent_dir(self, tmp_path: Path) -> None:
        path = tmp_path / "nested" / "dir" / "launcher.lock"
        lockfile.write_lock(path, pid=1)
        assert path.is_file()


class TestAnotherInstanceAlive:

    def test_false_when_no_lockfile(self, tmp_path: Path) -> None:
        assert lockfile.another_instance_alive(tmp_path / "launcher.lock") is False

    def test_false_when_lockfile_has_own_pid(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.lock"
        lockfile.write_lock(path, pid=os.getpid())
        assert lockfile.another_instance_alive(path) is False

    def test_true_when_other_pid_is_alive(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.lock"
        lockfile.write_lock(path, pid=99999)
        with patch("bibliogon_launcher.lockfile.pid_is_alive", return_value=True):
            assert lockfile.another_instance_alive(path) is True

    def test_false_when_other_pid_is_dead(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.lock"
        lockfile.write_lock(path, pid=99999)
        with patch("bibliogon_launcher.lockfile.pid_is_alive", return_value=False):
            assert lockfile.another_instance_alive(path) is False
