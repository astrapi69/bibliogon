"""Tests for the launcher actions layer.

The docker + filesystem boundary is mocked; these tests assert the
verification logic and the (ok, detail) contract of every action.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from bibliogon_launcher import actions


def _compose(tmp_path: Path) -> Path:
    """Create a throwaway compose file so .is_file() checks pass."""
    repo = tmp_path / "repo"
    repo.mkdir()
    compose = repo / "docker-compose.prod.yml"
    compose.write_text("services: {}\n", encoding="utf-8")
    (repo / ".env").write_text("BIBLIOGON_PORT=7880\n", encoding="utf-8")
    return compose


class TestCheckDocker:

    def test_ok_when_installed_and_running(self) -> None:
        with patch("bibliogon_launcher.docker.docker_installed", return_value=(True, "v27")), \
             patch("bibliogon_launcher.docker.docker_daemon_running", return_value=(True, "running")):
            ok, detail = actions.check_docker()
        assert ok is True
        assert detail == "running"

    def test_fails_when_not_installed(self) -> None:
        with patch("bibliogon_launcher.docker.docker_installed", return_value=(False, "no docker on PATH")):
            ok, detail = actions.check_docker()
        assert ok is False
        assert "PATH" in detail

    def test_fails_when_daemon_down(self) -> None:
        with patch("bibliogon_launcher.docker.docker_installed", return_value=(True, "v27")), \
             patch("bibliogon_launcher.docker.docker_daemon_running", return_value=(False, "daemon down")):
            ok, detail = actions.check_docker()
        assert ok is False
        assert detail == "daemon down"

    def test_does_not_check_daemon_when_not_installed(self) -> None:
        with patch("bibliogon_launcher.docker.docker_installed", return_value=(False, "x")), \
             patch("bibliogon_launcher.docker.docker_daemon_running") as daemon:
            actions.check_docker()
        daemon.assert_not_called()


class TestGetState:

    def test_no_docker(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(False, "x")):
            assert actions.get_state("bibliogon") == actions.STATE_NO_DOCKER

    def test_running_when_container_up(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "running")), \
             patch("bibliogon_launcher.docker.project_container_ids", return_value=["abc"]):
            assert actions.get_state("bibliogon") == actions.STATE_RUNNING

    def test_stopped_when_only_stopped_containers(self) -> None:
        def ids(_project: str, *, all_states: bool = False) -> list[str]:
            return ["abc"] if all_states else []

        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "running")), \
             patch("bibliogon_launcher.docker.project_container_ids", side_effect=ids):
            assert actions.get_state("bibliogon") == actions.STATE_STOPPED

    def test_stopped_when_manifest_present(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "running")), \
             patch("bibliogon_launcher.docker.project_container_ids", return_value=[]), \
             patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=Path("/x")):
            assert actions.get_state("bibliogon") == actions.STATE_STOPPED

    def test_not_installed(self) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "running")), \
             patch("bibliogon_launcher.docker.project_container_ids", return_value=[]), \
             patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=None):
            assert actions.get_state("bibliogon") == actions.STATE_NOT_INSTALLED


class TestCheckPort:

    def test_free(self) -> None:
        with patch("bibliogon_launcher.config.is_port_free", return_value=True):
            ok, detail = actions.check_port(7880)
        assert ok is True
        assert detail == "free"

    def test_in_use(self) -> None:
        with patch("bibliogon_launcher.config.is_port_free", return_value=False):
            ok, detail = actions.check_port(7880)
        assert ok is False
        assert detail == "in use"

    def test_rejects_below_range(self) -> None:
        ok, detail = actions.check_port(80)
        assert ok is False
        assert "1024" in detail

    def test_rejects_above_range(self) -> None:
        ok, _ = actions.check_port(70000)
        assert ok is False

    def test_rejects_non_int(self) -> None:
        ok, _ = actions.check_port("7880")  # type: ignore[arg-type]
        assert ok is False


class TestFindFreePort:

    def test_returns_same_when_free(self) -> None:
        with patch("bibliogon_launcher.config.find_free_port", return_value=7880), \
             patch("bibliogon_launcher.config.is_port_free", return_value=True):
            ok, port, detail = actions.find_free_port(7880)
        assert ok is True
        assert port == 7880
        assert detail == "free"

    def test_returns_later_port(self) -> None:
        with patch("bibliogon_launcher.config.find_free_port", return_value=7883), \
             patch("bibliogon_launcher.config.is_port_free", return_value=True):
            ok, port, _ = actions.find_free_port(7880)
        assert ok is True
        assert port == 7883

    def test_exhausted_when_candidate_still_taken(self) -> None:
        with patch("bibliogon_launcher.config.find_free_port", return_value=7880), \
             patch("bibliogon_launcher.config.is_port_free", return_value=False):
            ok, port, detail = actions.find_free_port(7880)
        assert ok is False
        assert port == 7880
        assert "no free port" in detail

    def test_invalid_start(self) -> None:
        ok, _, detail = actions.find_free_port(0)
        assert ok is False
        assert "invalid" in detail


class TestInstall:

    def test_missing_compose_file(self, tmp_path: Path) -> None:
        ok, detail = actions.install(str(tmp_path / "nope.yml"))
        assert ok is False
        assert "not found" in detail

    def test_invalid_port(self, tmp_path: Path) -> None:
        compose = _compose(tmp_path)
        ok, detail = actions.install(str(compose), port=80)
        assert ok is False
        assert "1024" in detail

    def test_build_failure(self, tmp_path: Path) -> None:
        compose = _compose(tmp_path)
        with patch("bibliogon_launcher.actions.set_repo_port", return_value=(True, "7880")), \
             patch("bibliogon_launcher.docker.project_up_build", return_value=(False, "build boom")):
            ok, detail = actions.install(str(compose))
        assert ok is False
        assert "boom" in detail

    def test_build_ok_but_no_container(self, tmp_path: Path) -> None:
        compose = _compose(tmp_path)
        with patch("bibliogon_launcher.actions.set_repo_port", return_value=(True, "7880")), \
             patch("bibliogon_launcher.docker.project_up_build", return_value=(True, "started")), \
             patch("bibliogon_launcher.docker.project_container_ids", return_value=[]):
            ok, detail = actions.install(str(compose))
        assert ok is False
        assert "no container" in detail

    def test_success_writes_port_and_verifies(self, tmp_path: Path) -> None:
        compose = _compose(tmp_path)
        with patch("bibliogon_launcher.actions.set_repo_port", return_value=(True, "7900")) as set_port, \
             patch("bibliogon_launcher.docker.project_up_build", return_value=(True, "started")), \
             patch("bibliogon_launcher.docker.project_container_ids", return_value=["abc"]):
            ok, detail = actions.install(str(compose), port=7900)
        assert ok is True
        assert detail == "installed"
        set_port.assert_called_once_with(compose.parent, 7900)


class TestStart:

    def test_missing_compose_file(self, tmp_path: Path) -> None:
        ok, detail = actions.start(str(tmp_path / "nope.yml"))
        assert ok is False
        assert "not found" in detail

    def test_up_failure(self, tmp_path: Path) -> None:
        compose = _compose(tmp_path)
        with patch("bibliogon_launcher.docker.project_up", return_value=(False, "up boom")):
            ok, detail = actions.start(str(compose))
        assert ok is False
        assert "boom" in detail

    def test_up_ok_but_no_container(self, tmp_path: Path) -> None:
        compose = _compose(tmp_path)
        with patch("bibliogon_launcher.docker.project_up", return_value=(True, "started")), \
             patch("bibliogon_launcher.docker.project_container_ids", return_value=[]):
            ok, detail = actions.start(str(compose))
        assert ok is False
        assert "no container" in detail

    def test_success(self, tmp_path: Path) -> None:
        compose = _compose(tmp_path)
        with patch("bibliogon_launcher.docker.project_up", return_value=(True, "started")), \
             patch("bibliogon_launcher.docker.project_container_ids", return_value=["abc"]):
            ok, detail = actions.start(str(compose))
        assert ok is True
        assert detail == "started"


class TestStop:

    def test_down_failure(self) -> None:
        with patch("bibliogon_launcher.docker.project_down", return_value=(False, "down boom")):
            ok, detail = actions.stop("bibliogon")
        assert ok is False
        assert "boom" in detail

    def test_down_ok_but_still_running(self) -> None:
        with patch("bibliogon_launcher.docker.project_down", return_value=(True, "stopped")), \
             patch("bibliogon_launcher.docker.project_container_ids", return_value=["abc"]):
            ok, detail = actions.stop("bibliogon")
        assert ok is False
        assert "still running" in detail

    def test_success(self) -> None:
        with patch("bibliogon_launcher.docker.project_down", return_value=(True, "stopped")), \
             patch("bibliogon_launcher.docker.project_container_ids", return_value=[]):
            ok, detail = actions.stop("bibliogon")
        assert ok is True
        assert detail == "stopped"


class TestUninstall:

    def test_all_steps_succeed(self) -> None:
        results = {"compose_down": True, "remove_volumes": True}
        with patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=Path("/x")), \
             patch("bibliogon_launcher.cleanup.uninstall_bibliogon", return_value=results):
            ok, detail = actions.uninstall("bibliogon")
        assert ok is True
        assert detail == "uninstalled"

    def test_reports_failed_steps(self) -> None:
        results = {"compose_down": True, "remove_volumes": False, "remove_images": False}
        with patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=Path("/x")), \
             patch("bibliogon_launcher.cleanup.uninstall_bibliogon", return_value=results):
            ok, detail = actions.uninstall("bibliogon")
        assert ok is False
        assert "remove_volumes" in detail
        assert "remove_images" in detail

    def test_falls_back_to_resolved_repo(self) -> None:
        with patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=None), \
             patch("bibliogon_launcher.config.resolve_repo_path", return_value=Path("/repo")) as resolve, \
             patch("bibliogon_launcher.cleanup.uninstall_bibliogon", return_value={}) as un:
            actions.uninstall("bibliogon")
        resolve.assert_called_once()
        un.assert_called_once()


class TestHealthCheck:

    def test_healthy_via_wait(self) -> None:
        with patch("bibliogon_launcher.health.wait_for_healthy", return_value=True):
            ok, detail = actions.health_check(7880)
        assert ok is True
        assert detail == "healthy"

    def test_healthy_via_oneshot_fallback(self) -> None:
        with patch("bibliogon_launcher.health.wait_for_healthy", return_value=False), \
             patch("bibliogon_launcher.health.is_healthy", return_value=True):
            ok, _ = actions.health_check(7880, path="/api/health", timeout=1)
        assert ok is True

    def test_not_healthy(self) -> None:
        with patch("bibliogon_launcher.health.wait_for_healthy", return_value=False), \
             patch("bibliogon_launcher.health.is_healthy", return_value=False):
            ok, detail = actions.health_check(7880, timeout=3)
        assert ok is False
        assert "3s" in detail


class TestOpenBrowser:

    def test_opens_expected_url(self) -> None:
        with patch("bibliogon_launcher.actions.webbrowser.open") as opener:
            actions.open_browser(7880, "/")
        opener.assert_called_once_with("http://localhost:7880/")

    def test_default_path_root(self) -> None:
        with patch("bibliogon_launcher.actions.webbrowser.open") as opener:
            actions.open_browser(9000)
        opener.assert_called_once_with("http://localhost:9000/")


class TestVersion:

    def test_returns_package_version(self) -> None:
        from bibliogon_launcher import __version__
        assert actions.get_version() == __version__


class TestConfig:

    def test_roundtrip(self, tmp_path: Path) -> None:
        path = tmp_path / "sub" / "launcher.json"
        actions.save_config(path, {"port": 7880, "x": 1})
        assert actions.load_config(path) == {"port": 7880, "x": 1}

    def test_load_missing_returns_empty(self, tmp_path: Path) -> None:
        assert actions.load_config(tmp_path / "absent.json") == {}

    def test_load_corrupt_returns_empty(self, tmp_path: Path) -> None:
        path = tmp_path / "bad.json"
        path.write_text("{not json", encoding="utf-8")
        assert actions.load_config(path) == {}


class TestSetPort:

    def test_persists_valid_port(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.json"
        ok, detail = actions.set_port(path, 7900)
        assert ok is True
        assert detail == "7900"
        assert json.loads(path.read_text())["port"] == 7900

    def test_rejects_invalid(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.json"
        ok, _ = actions.set_port(path, 22)
        assert ok is False
        assert not path.exists()

    def test_preserves_other_keys(self, tmp_path: Path) -> None:
        path = tmp_path / "launcher.json"
        actions.save_config(path, {"repo_path": "/x", "port": 7880})
        actions.set_port(path, 8001)
        data = json.loads(path.read_text())
        assert data["repo_path"] == "/x"
        assert data["port"] == 8001


class TestResolveComposeFile:

    def test_prefers_source_checkout(self, tmp_path: Path) -> None:
        compose = tmp_path / "docker-compose.prod.yml"
        with patch("bibliogon_launcher.actions.source_checkout_repo", return_value=tmp_path):
            result = actions.resolve_compose_file()
        assert result == compose

    def test_falls_back_to_manifest(self, tmp_path: Path) -> None:
        compose = tmp_path / "docker-compose.prod.yml"
        compose.write_text("services: {}\n")
        with patch("bibliogon_launcher.actions.source_checkout_repo", return_value=None), \
             patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=tmp_path):
            assert actions.resolve_compose_file() == compose

    def test_falls_back_to_configured_repo(self, tmp_path: Path) -> None:
        compose = tmp_path / "docker-compose.prod.yml"
        compose.write_text("services: {}\n")
        with patch("bibliogon_launcher.actions.source_checkout_repo", return_value=None), \
             patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=None), \
             patch("bibliogon_launcher.config.resolve_repo_path", return_value=tmp_path):
            assert actions.resolve_compose_file() == compose

    def test_none_when_nothing_found(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.actions.source_checkout_repo", return_value=None), \
             patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=None), \
             patch("bibliogon_launcher.config.resolve_repo_path", return_value=tmp_path / "absent"):
            assert actions.resolve_compose_file() is None


class TestSetRepoPort:

    def test_writes_env(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.config.write_port", return_value=True) as wp:
            ok, detail = actions.set_repo_port(tmp_path, 7900)
        assert ok is True
        assert detail == "7900"
        wp.assert_called_once_with(tmp_path, 7900)

    def test_rejects_invalid(self, tmp_path: Path) -> None:
        ok, _ = actions.set_repo_port(tmp_path, 1)
        assert ok is False

    def test_write_failure(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.config.write_port", return_value=False):
            ok, detail = actions.set_repo_port(tmp_path, 7900)
        assert ok is False
        assert ".env" in detail
