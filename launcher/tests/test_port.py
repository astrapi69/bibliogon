"""Tests for the pure port helpers in ``config`` (issue #518, Problem 3).

Covers the socket-bind freeness check, the next-free-port scan, and the
``.env`` port read/write round-trip. The higher-level port resolution is
exercised through the actions layer (see ``test_actions.py``).
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
