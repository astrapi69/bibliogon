"""Tests for launcher.docker. The subprocess surface is mocked."""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from bibliogon_launcher import docker


def _run_result(returncode: int = 0, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


class TestDockerInstalled:

    def test_true_on_success(self) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(stdout="Docker version 27.1")):
            ok, detail = docker.docker_installed()
        assert ok is True
        assert "Docker version" in detail

    def test_false_when_binary_missing(self) -> None:
        with patch("bibliogon_launcher.docker._run", side_effect=FileNotFoundError):
            ok, detail = docker.docker_installed()
        assert ok is False
        assert "PATH" in detail

    def test_false_on_nonzero_exit(self) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(returncode=1, stderr="boom")):
            ok, detail = docker.docker_installed()
        assert ok is False
        assert "boom" in detail


class TestDockerDaemonRunning:

    def test_true_when_info_succeeds(self) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(stdout="Server: ...")):
            ok, _ = docker.docker_daemon_running()
        assert ok is True

    def test_false_when_info_fails(self) -> None:
        stderr = "Cannot connect to the Docker daemon\nadditional noise"
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(returncode=1, stderr=stderr)):
            ok, detail = docker.docker_daemon_running()
        assert ok is False
        assert detail == "Cannot connect to the Docker daemon"

    def test_timeout_surfaces_as_user_message(self) -> None:
        with patch("bibliogon_launcher.docker._run", side_effect=subprocess.TimeoutExpired(cmd="docker info", timeout=15)):
            ok, detail = docker.docker_daemon_running()
        assert ok is False
        assert "starting" in detail.lower()


class TestComposeUpDown:

    def test_compose_up_success(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(stdout="done")) as mock_run:
            ok, _ = docker.compose_up(tmp_path, "docker-compose.prod.yml")
        assert ok is True
        args = mock_run.call_args[0][0]
        assert args == ["docker", "compose", "-f", "docker-compose.prod.yml", "up", "-d"]

    def test_compose_up_failure_returns_tail(self, tmp_path: Path) -> None:
        stderr = "\n".join(f"line {i}" for i in range(20))
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(returncode=1, stderr=stderr)):
            ok, detail = docker.compose_up(tmp_path, "docker-compose.prod.yml")
        assert ok is False
        assert "line 19" in detail
        assert "line 0" not in detail  # only tail

    def test_compose_down_success(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result()):
            ok, _ = docker.compose_down(tmp_path, "docker-compose.prod.yml")
        assert ok is True


class TestComposeLogsTail:

    def test_returns_stdout_by_default(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(stdout="log lines\n")):
            assert docker.compose_logs_tail(tmp_path, "docker-compose.prod.yml") == "log lines"

    def test_falls_back_to_stderr_when_stdout_empty(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(stderr="warning text")):
            assert docker.compose_logs_tail(tmp_path, "docker-compose.prod.yml") == "warning text"

    def test_tolerates_missing_docker(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.docker._run", side_effect=FileNotFoundError):
            assert docker.compose_logs_tail(tmp_path, "docker-compose.prod.yml") == "(logs unavailable)"


class TestRemoveVolumes:

    def test_removes_found_volumes(self) -> None:
        ls_result = _run_result(stdout="bibliogon_data\nbibliogon_cache\n")
        rm_result = _run_result()
        with patch("bibliogon_launcher.docker._run", side_effect=[ls_result, rm_result]):
            ok, detail = docker.remove_volumes()
        assert ok
        assert "2 volume" in detail

    def test_noop_when_no_volumes(self) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(stdout="")):
            ok, detail = docker.remove_volumes()
        assert ok
        assert "no volumes" in detail

    def test_tolerates_missing_docker(self) -> None:
        with patch("bibliogon_launcher.docker._run", side_effect=FileNotFoundError):
            ok, _ = docker.remove_volumes()
        assert ok  # skips gracefully


class TestRemoveImages:

    def test_removes_found_images(self) -> None:
        ls_result = _run_result(stdout="abc123\ndef456\n")
        rm_result = _run_result()
        with patch("bibliogon_launcher.docker._run", side_effect=[ls_result, rm_result]):
            ok, detail = docker.remove_images()
        assert ok
        assert "2 image" in detail

    def test_noop_when_no_images(self) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result(stdout="")):
            ok, detail = docker.remove_images()
        assert ok
        assert "no images" in detail


class TestComposeBuild:

    def test_success(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.docker._run", return_value=_run_result()):
            ok, _ = docker.compose_build(tmp_path, "docker-compose.prod.yml")
        assert ok

    def test_failure_returns_detail(self, tmp_path: Path) -> None:
        with patch("bibliogon_launcher.docker._run",
                   return_value=_run_result(returncode=1, stderr="build error")):
            ok, detail = docker.compose_build(tmp_path, "docker-compose.prod.yml")
        assert not ok
        assert "build error" in detail
