"""Tests for the launcher CLI layer. The actions boundary is mocked."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from bibliogon_launcher import cli


class TestIsCliInvocation:

    def test_detects_known_flag(self) -> None:
        assert cli.is_cli_invocation(["--status"]) is True
        assert cli.is_cli_invocation(["--port", "7880"]) is True
        assert cli.is_cli_invocation(["--port=7880"]) is True

    def test_empty_is_not_cli(self) -> None:
        assert cli.is_cli_invocation([]) is False

    def test_unknown_arg_is_not_cli(self) -> None:
        assert cli.is_cli_invocation(["--frobnicate"]) is False

    def test_debug_alone_is_not_cli(self) -> None:
        # --debug is a modifier, not an action, so it must NOT force CLI.
        assert cli.is_cli_invocation(["--debug"]) is False


class TestVersion:

    def test_prints_version(self, capsys: pytest.CaptureFixture[str]) -> None:
        with patch("bibliogon_launcher.actions.get_version", return_value="9.9.9"):
            rc = cli.run(["--version"])
        assert rc == 0
        assert capsys.readouterr().out.strip() == "9.9.9"


class TestCheck:

    def test_ok(self, capsys: pytest.CaptureFixture[str]) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(True, "running")):
            rc = cli.run(["--check"])
        assert rc == 0
        assert "ready" in capsys.readouterr().out

    def test_fail(self, capsys: pytest.CaptureFixture[str]) -> None:
        with patch("bibliogon_launcher.actions.check_docker", return_value=(False, "no docker")):
            rc = cli.run(["--check"])
        assert rc == 1
        assert "no docker" in capsys.readouterr().out


class TestStatus:

    def test_prints_state(self, capsys: pytest.CaptureFixture[str]) -> None:
        with patch("bibliogon_launcher.actions.get_state", return_value="running"):
            rc = cli.run(["--status"])
        assert rc == 0
        assert capsys.readouterr().out.strip() == "running"


class TestOpen:

    def test_opens_effective_port(self) -> None:
        with patch("bibliogon_launcher.cli._effective_port", return_value=7880), \
             patch("bibliogon_launcher.actions.open_browser") as opener:
            rc = cli.run(["--open"])
        assert rc == 0
        opener.assert_called_once_with(7880, "/")


class TestStop:

    def test_success(self, capsys: pytest.CaptureFixture[str]) -> None:
        with patch("bibliogon_launcher.cli._effective_port", return_value=7880), \
             patch("bibliogon_launcher.actions.stop", return_value=(True, "stopped")):
            rc = cli.run(["--stop"])
        assert rc == 0
        assert "stopped" in capsys.readouterr().out

    def test_failure(self) -> None:
        with patch("bibliogon_launcher.cli._effective_port", return_value=7880), \
             patch("bibliogon_launcher.actions.stop", return_value=(False, "boom")):
            rc = cli.run(["--stop"])
        assert rc == 1


class TestUninstall:

    def test_full_success(self) -> None:
        with patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=Path("/x")), \
             patch("bibliogon_launcher.cleanup.uninstall_bibliogon",
                   return_value={s: True for s in cli.manifest.CLEANUP_STEPS}):
            rc = cli.run(["--uninstall"])
        assert rc == 0

    def test_incomplete(self) -> None:
        partial = {s: True for s in cli.manifest.CLEANUP_STEPS}
        partial["rmtree"] = False
        with patch("bibliogon_launcher.manifest.install_dir_from_manifest", return_value=Path("/x")), \
             patch("bibliogon_launcher.cleanup.uninstall_bibliogon", return_value=partial):
            rc = cli.run(["--uninstall"])
        assert rc == 1


class TestInstall:

    def test_uses_local_compose(self, tmp_path: Path) -> None:
        compose = tmp_path / "docker-compose.prod.yml"
        compose.write_text("services: {}\n")
        with patch("bibliogon_launcher.cli._effective_port", return_value=7880), \
             patch("bibliogon_launcher.actions.resolve_compose_file", return_value=compose), \
             patch("bibliogon_launcher.actions.install", return_value=(True, "installed")) as inst:
            rc = cli.run(["--install"])
        assert rc == 0
        inst.assert_called_once_with(str(compose), cli.PROJECT_NAME, 7880)

    def test_downloads_when_no_local_compose(self, tmp_path: Path) -> None:
        compose = tmp_path / "docker-compose.prod.yml"
        compose.write_text("services: {}\n")
        with patch("bibliogon_launcher.cli._effective_port", return_value=7880), \
             patch("bibliogon_launcher.actions.resolve_compose_file", return_value=None), \
             patch("bibliogon_launcher.config.default_repo_path", return_value=tmp_path), \
             patch("bibliogon_launcher.installer.download_release", return_value=(True, "ok")), \
             patch("bibliogon_launcher.installer.create_env_file", return_value=(True, "created")), \
             patch("bibliogon_launcher.manifest.write_manifest"), \
             patch("bibliogon_launcher.actions.install", return_value=(True, "installed")) as inst:
            rc = cli.run(["--install"])
        assert rc == 0
        inst.assert_called_once()

    def test_download_failure_aborts(self, capsys: pytest.CaptureFixture[str]) -> None:
        with patch("bibliogon_launcher.cli._effective_port", return_value=7880), \
             patch("bibliogon_launcher.actions.resolve_compose_file", return_value=None), \
             patch("bibliogon_launcher.installer.download_release", return_value=(False, "net down")):
            rc = cli.run(["--install"])
        assert rc == 1
        assert "net down" in capsys.readouterr().out


class TestStart:

    def test_no_compose(self, capsys: pytest.CaptureFixture[str]) -> None:
        with patch("bibliogon_launcher.cli._effective_port", return_value=7880), \
             patch("bibliogon_launcher.actions.resolve_compose_file", return_value=None):
            rc = cli.run(["--start"])
        assert rc == 1
        assert "not installed" in capsys.readouterr().out

    def test_success(self, tmp_path: Path) -> None:
        compose = tmp_path / "docker-compose.prod.yml"
        compose.write_text("services: {}\n")
        with patch("bibliogon_launcher.cli._effective_port", return_value=7880), \
             patch("bibliogon_launcher.actions.resolve_compose_file", return_value=compose), \
             patch("bibliogon_launcher.actions.set_repo_port", return_value=(True, "7880")), \
             patch("bibliogon_launcher.actions.start", return_value=(True, "started")):
            rc = cli.run(["--start"])
        assert rc == 0


class TestPortFlag:

    def test_standalone_port_persists(self) -> None:
        with patch("bibliogon_launcher.actions.set_port", return_value=(True, "8001")) as sp, \
             patch("bibliogon_launcher.actions.resolve_compose_file", return_value=None):
            rc = cli.run(["--port", "8001"])
        assert rc == 0
        sp.assert_called_once()

    def test_invalid_port(self, capsys: pytest.CaptureFixture[str]) -> None:
        rc = cli.run(["--port", "22"])
        assert rc == 1
        assert "between" in capsys.readouterr().out

    def test_port_combines_with_install(self, tmp_path: Path) -> None:
        compose = tmp_path / "docker-compose.prod.yml"
        compose.write_text("services: {}\n")
        with patch("bibliogon_launcher.actions.resolve_compose_file", return_value=compose), \
             patch("bibliogon_launcher.actions.install", return_value=(True, "installed")) as inst:
            rc = cli.run(["--install", "--port", "8123"])
        assert rc == 0
        inst.assert_called_once_with(str(compose), cli.PROJECT_NAME, 8123)


class TestNoAction:

    def test_prints_help_and_returns_2(self, capsys: pytest.CaptureFixture[str]) -> None:
        rc = cli.run([])
        assert rc == 2
        assert "usage" in capsys.readouterr().out.lower()


class TestEffectivePort:

    def test_explicit_flag_wins(self) -> None:
        args = cli.build_parser().parse_args(["--port", "9001"])
        assert cli._effective_port(args) == 9001

    def test_from_launcher_json(self) -> None:
        args = cli.build_parser().parse_args(["--status"])
        with patch("bibliogon_launcher.config.load_launcher_config", return_value={"port": 8500}):
            assert cli._effective_port(args) == 8500

    def test_from_env_when_no_stored(self, tmp_path: Path) -> None:
        compose = tmp_path / "docker-compose.prod.yml"
        compose.write_text("services: {}\n")
        args = cli.build_parser().parse_args(["--status"])
        with patch("bibliogon_launcher.config.load_launcher_config", return_value={}), \
             patch("bibliogon_launcher.actions.resolve_compose_file", return_value=compose), \
             patch("bibliogon_launcher.config.read_port", return_value=7333):
            assert cli._effective_port(args) == 7333

    def test_default_when_nothing(self) -> None:
        args = cli.build_parser().parse_args(["--status"])
        with patch("bibliogon_launcher.config.load_launcher_config", return_value={}), \
             patch("bibliogon_launcher.actions.resolve_compose_file", return_value=None):
            assert cli._effective_port(args) == cli.config.DEFAULT_PORT
