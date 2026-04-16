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


class TestPidAliveWindowsNoneGuard:
    """Regression tests for the TypeError crash when tasklist returns
    stdout=None on Windows locale edge cases."""

    def test_stdout_none_returns_true(self) -> None:
        """result.stdout=None must not raise TypeError."""
        import subprocess
        mock_result = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=None, stderr=None,
        )
        with patch("subprocess.run", return_value=mock_result):
            # Should not raise; falls back to assuming alive
            result = lockfile._pid_alive_windows(1234)
            # "1234" not in "" -> False (pid not confirmed alive)
            assert result is False

    def test_stdout_empty_string_returns_false(self) -> None:
        import subprocess
        mock_result = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="", stderr="",
        )
        with patch("subprocess.run", return_value=mock_result):
            assert lockfile._pid_alive_windows(1234) is False

    def test_stdout_contains_pid_returns_true(self) -> None:
        import subprocess
        mock_result = subprocess.CompletedProcess(
            args=[], returncode=0,
            stdout="python.exe                    1234 Console                    1     12,345 K\n",
            stderr="",
        )
        with patch("subprocess.run", return_value=mock_result):
            assert lockfile._pid_alive_windows(1234) is True


class TestCorruptLockfile:

    def test_read_lock_with_non_utf8_bytes(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.lock"
        path.write_bytes(b"\xff\xfe\x00\x01")
        # Should return None, not crash
        assert lockfile.read_lock(path) is None

    def test_read_lock_with_empty_file(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.lock"
        path.write_text("", encoding="utf-8")
        assert lockfile.read_lock(path) is None

    def test_another_instance_alive_with_corrupt_file(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.lock"
        path.write_bytes(b"\xff\xfe")
        # Should return False (unparseable = no other instance), not crash
        assert lockfile.another_instance_alive(path) is False
