"""Tests for port-conflict detection and resolution (issue #518, Problem 3).

Covers the pure socket/.env helpers in ``config`` and the
``_resolve_port`` orchestration in ``__main__`` (which decides between
reuse, switch-to-free-port, and proceed-anyway).
"""

from __future__ import annotations

import socket
from pathlib import Path
from unittest.mock import patch

from bibliogon_launcher import config


def _bind_a_port() -> tuple[socket.socket, int]:
    """Bind an ephemeral port and keep the socket open so it stays busy."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    sock.listen(1)
    return sock, sock.getsockname()[1]


class TestIsPortFree:

    def test_free_port_is_free(self) -> None:
        sock, port = _bind_a_port()
        sock.close()  # release it
        assert config.is_port_free(port) is True

    def test_bound_port_is_not_free(self) -> None:
        sock, port = _bind_a_port()
        try:
            assert config.is_port_free(port) is False
        finally:
            sock.close()


class TestFindFreePort:

    def test_returns_start_when_start_is_free(self) -> None:
        sock, port = _bind_a_port()
        sock.close()
        assert config.find_free_port(port) == port

    def test_skips_busy_start_and_returns_next_free(self) -> None:
        sock, busy = _bind_a_port()
        try:
            # Force the first candidate to be the busy port; the scan must
            # move past it to a free one.
            result = config.find_free_port(busy)
            assert result != busy
            assert config.is_port_free(result)
        finally:
            sock.close()

    def test_falls_back_to_start_when_window_exhausted(self) -> None:
        # Every candidate reports busy -> return the original start_port.
        with patch.object(config, "is_port_free", return_value=False):
            assert config.find_free_port(7880, max_tries=5) == 7880


class TestWritePort:

    def test_updates_existing_port_line(self, tmp_path: Path) -> None:
        env = tmp_path / ".env"
        env.write_text("BIBLIOGON_PORT=7880\nOTHER=x\n", encoding="utf-8")
        assert config.write_port(tmp_path, 7881) is True
        assert config.read_port(tmp_path) == 7881
        assert "OTHER=x" in env.read_text(encoding="utf-8")

    def test_rewrites_cors_origin_to_match_new_port(self, tmp_path: Path) -> None:
        env = tmp_path / ".env"
        env.write_text(
            "BIBLIOGON_PORT=7880\n"
            "BIBLIOGON_CORS_ORIGINS=http://localhost:7880\n",
            encoding="utf-8",
        )
        config.write_port(tmp_path, 7882)
        text = env.read_text(encoding="utf-8")
        assert "http://localhost:7882" in text
        assert "localhost:7880" not in text

    def test_appends_when_no_existing_line(self, tmp_path: Path) -> None:
        env = tmp_path / ".env"
        env.write_text("OTHER=x\n", encoding="utf-8")
        assert config.write_port(tmp_path, 9091) is True
        assert config.read_port(tmp_path) == 9091

    def test_returns_false_when_env_missing(self, tmp_path: Path) -> None:
        assert config.write_port(tmp_path, 7881) is False


class TestResolvePort:
    """``__main__._resolve_port`` decides reuse vs switch vs proceed."""

    def _repo_with_port(self, tmp_path: Path, port: int) -> Path:
        (tmp_path / ".env").write_text(f"BIBLIOGON_PORT={port}\n", encoding="utf-8")
        return tmp_path

    def test_returns_configured_when_free(self, tmp_path: Path) -> None:
        from bibliogon_launcher import __main__ as main_mod

        repo = self._repo_with_port(tmp_path, 7880)
        with patch.object(main_mod.config, "is_port_free", return_value=True):
            port, previous = main_mod._resolve_port(repo)
        assert port == 7880
        assert previous is None

    def test_reuses_port_when_own_bibliogon_already_healthy(self, tmp_path: Path) -> None:
        from bibliogon_launcher import __main__ as main_mod

        repo = self._repo_with_port(tmp_path, 7880)
        with (
            patch.object(main_mod.config, "is_port_free", return_value=False),
            patch.object(main_mod.health, "is_healthy", return_value=True),
            patch.object(main_mod.config, "write_port") as write_mock,
        ):
            port, previous = main_mod._resolve_port(repo)
        assert port == 7880
        assert previous is None
        write_mock.assert_not_called()  # never moves our own running instance

    def test_switches_to_free_port_when_foreign_process_holds_it(self, tmp_path: Path) -> None:
        from bibliogon_launcher import __main__ as main_mod

        repo = self._repo_with_port(tmp_path, 7880)
        with (
            patch.object(main_mod.config, "is_port_free", return_value=False),
            patch.object(main_mod.health, "is_healthy", return_value=False),
            patch.object(main_mod.config, "find_free_port", return_value=7881),
            patch.object(main_mod.config, "write_port", return_value=True) as write_mock,
        ):
            port, previous = main_mod._resolve_port(repo)
        assert port == 7881
        assert previous == 7880
        write_mock.assert_called_once_with(repo, 7881)

    def test_proceeds_with_configured_when_no_free_port_found(self, tmp_path: Path) -> None:
        from bibliogon_launcher import __main__ as main_mod

        repo = self._repo_with_port(tmp_path, 7880)
        with (
            patch.object(main_mod.config, "is_port_free", return_value=False),
            patch.object(main_mod.health, "is_healthy", return_value=False),
            patch.object(main_mod.config, "find_free_port", return_value=7880),  # nothing free
        ):
            port, previous = main_mod._resolve_port(repo)
        assert port == 7880
        assert previous is None

    def test_proceeds_with_configured_when_persist_fails(self, tmp_path: Path) -> None:
        from bibliogon_launcher import __main__ as main_mod

        repo = self._repo_with_port(tmp_path, 7880)
        with (
            patch.object(main_mod.config, "is_port_free", return_value=False),
            patch.object(main_mod.health, "is_healthy", return_value=False),
            patch.object(main_mod.config, "find_free_port", return_value=7881),
            patch.object(main_mod.config, "write_port", return_value=False),
        ):
            port, previous = main_mod._resolve_port(repo)
        assert port == 7880
        assert previous is None  # not announced as switched if it could not persist
