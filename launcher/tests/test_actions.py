"""Tests for the pure business-logic layer ``bibliogon_launcher.actions``.

No real Docker is invoked: the subprocess surface (``actions._run`` /
``actions._project_container_ids`` / ``actions.check_docker``) and the
health HTTP probe are mocked. The socket helpers bind real ephemeral
ports (cheap, deterministic).
"""

from __future__ import annotations

import socket
import subprocess
from unittest.mock import patch

from bibliogon_launcher import actions


def _run_result(returncode: int = 0, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


def _bind_a_port() -> tuple[socket.socket, int]:
    """Bind an ephemeral port and keep the socket open so it stays busy."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("", 0))
    sock.listen(1)
    return sock, sock.getsockname()[1]


class TestValidatePort:

    def test_in_range_ok(self) -> None:
        ok, _ = actions._validate_port(7880)
        assert ok is True

    def test_below_range_rejected(self) -> None:
        ok, reason = actions._validate_port(80)
        assert ok is False
        assert "between" in reason

    def test_above_range_rejected(self) -> None:
        ok, _ = actions._validate_port(70000)
        assert ok is False

    def test_non_int_rejected(self) -> None:
        ok, _ = actions._validate_port("7880")  # type: ignore[arg-type]
        assert ok is False


class TestCheckPort:

    def test_free_port_is_free(self) -> None:
        sock, port = _bind_a_port()
        sock.close()  # release it
        free, _ = actions.check_port(port)
        assert free is True

    def test_bound_port_is_not_free(self) -> None:
        sock, port = _bind_a_port()
        try:
            free, msg = actions.check_port(port)
            assert free is False
            assert "in use" in msg
        finally:
            sock.close()

    def test_invalid_port_rejected(self) -> None:
        free, _ = actions.check_port(80)
        assert free is False


class TestFindFreePort:

    def test_returns_free_start_port(self) -> None:
        sock, port = _bind_a_port()
        sock.close()
        found, chosen, _ = actions.find_free_port(port)
        assert found is True
        assert chosen == port

    def test_invalid_start_returns_false(self) -> None:
        found, chosen, msg = actions.find_free_port(0)
        assert found is False
        assert chosen == 0
        assert "Invalid" in msg


class TestGetState:

    def test_no_docker_when_daemon_down(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(False, "down")):
            assert actions.get_state() == "no_docker"

    def test_running_when_container_running(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "ok")), \
             patch("bibliogon_launcher.actions._project_container_ids", return_value=["abc"]):
            assert actions.get_state() == "running"

    def test_stopped_when_present_but_not_running(self) -> None:
        def ids(*, running_only: bool) -> list[str]:
            return [] if running_only else ["abc"]

        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "ok")), \
             patch("bibliogon_launcher.actions._project_container_ids", side_effect=ids):
            assert actions.get_state() == "stopped"

    def test_not_installed_when_no_containers(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "ok")), \
             patch("bibliogon_launcher.actions._project_container_ids", return_value=[]):
            assert actions.get_state() == "not_installed"


class TestConfigRoundTrip:

    def test_set_and_load_port(self, tmp_path) -> None:
        path = tmp_path / "launcher.json"
        ok, _ = actions.set_port(path, 8123)
        assert ok is True
        assert actions.load_config(path)["port"] == 8123

    def test_set_port_rejects_invalid(self, tmp_path) -> None:
        path = tmp_path / "launcher.json"
        ok, _ = actions.set_port(path, 1)
        assert ok is False
        assert not path.exists()

    def test_load_missing_returns_empty(self, tmp_path) -> None:
        assert actions.load_config(tmp_path / "nope.json") == {}


class _FakeResponse:
    def __init__(self, status: int, body: str) -> None:
        self.status = status
        self._body = body

    def read(self) -> bytes:
        return self._body.encode("utf-8")

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *exc) -> None:
        return None


class TestHealthProbe:

    def test_healthy_on_200_status_ok(self) -> None:
        with patch("urllib.request.urlopen", return_value=_FakeResponse(200, '{"status": "ok"}')):
            assert actions.is_healthy(7880) is True

    def test_unhealthy_on_200_wrong_status(self) -> None:
        with patch("urllib.request.urlopen", return_value=_FakeResponse(200, '{"status": "starting"}')):
            ok, msg = actions._health_probe(7880)
        assert ok is False
        assert "status != ok" in msg

    def test_unhealthy_on_5xx(self) -> None:
        with patch("urllib.request.urlopen", return_value=_FakeResponse(503, "")):
            ok, msg = actions._health_probe(7880)
        assert ok is False
        assert "Server error" in msg

    def test_unhealthy_on_connection_error(self) -> None:
        with patch("urllib.request.urlopen", side_effect=OSError("refused")):
            assert actions.is_healthy(7880) is False


class TestLifecycleGuards:
    """Guard clauses that short-circuit before any real docker work."""

    def test_install_blocks_when_docker_down(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(False, "down")):
            ok, msg = actions.install("/x/docker-compose.prod.yml")
        assert ok is False
        assert msg == actions._DOCKER_UNAVAILABLE

    def test_install_rejects_invalid_port(self) -> None:
        ok, _ = actions.install("/x/compose.yml", port=1)
        assert ok is False

    def test_start_blocks_when_docker_down(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(False, "down")):
            ok, msg = actions.start("/x/compose.yml")
        assert ok is False
        assert msg == actions._DOCKER_UNAVAILABLE

    def test_stop_when_not_installed(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "ok")), \
             patch("bibliogon_launcher.actions.get_state", return_value="not_installed"):
            ok, msg = actions.stop()
        assert ok is False
        assert "not installed" in msg

    def test_stop_when_already_stopped(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "ok")), \
             patch("bibliogon_launcher.actions.get_state", return_value="stopped"):
            ok, msg = actions.stop()
        assert ok is True
        assert "already stopped" in msg

    def test_uninstall_nothing_to_do(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "ok")), \
             patch("bibliogon_launcher.actions._project_container_ids", return_value=[]):
            ok, msg = actions.uninstall()
        assert ok is True
        assert "Nothing to uninstall" in msg


class TestOpenBrowser:

    def test_never_raises_on_oserror(self) -> None:
        with patch("webbrowser.open", side_effect=OSError("no display")):
            actions.open_browser(7880)  # must not raise
