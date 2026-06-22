"""Tests for the already-running management flow and the CLI uninstall.

The four-button management dialog itself is tkinter UI (not unit-tested
per the launcher's convention); these tests pin the *dispatch* logic in
``_run_management`` and the headless ``_cli_uninstall`` path by mocking
the UI + docker + cleanup boundaries.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from bibliogon_launcher import __main__ as launcher_main
from bibliogon_launcher import i18n


def setup_module(_module: object) -> None:
    # Resolve i18n so info-box strings render without a live settings file.
    i18n.init("en")


class TestRunManagement:
    def test_open_then_close_leaves_container_running(self) -> None:
        repo = Path("/tmp/bibliogon")
        with patch.object(
            launcher_main.ui, "management_dialog", side_effect=["open", "close"]
        ), patch.object(launcher_main.webbrowser, "open") as wopen, patch.object(
            launcher_main.docker, "compose_down"
        ) as down:
            rc = launcher_main._run_management(repo, 7880)
        assert rc == 0
        wopen.assert_called_once_with("http://localhost:7880")
        # "close" must NOT stop the container.
        down.assert_not_called()

    def test_stop_runs_compose_down(self) -> None:
        repo = Path("/tmp/bibliogon")
        with patch.object(
            launcher_main.ui, "management_dialog", return_value="stop"
        ), patch.object(
            launcher_main.docker, "compose_down", return_value=(True, "stopped")
        ) as down, patch.object(launcher_main.ui, "info_box"):
            rc = launcher_main._run_management(repo, 7880)
        assert rc == 0
        down.assert_called_once_with(repo, launcher_main.config.COMPOSE_FILENAME)

    def test_uninstall_invokes_uninstall_flow(self) -> None:
        repo = Path("/tmp/bibliogon")
        with patch.object(
            launcher_main.ui, "management_dialog", return_value="uninstall"
        ), patch.object(launcher_main, "_run_uninstall_flow", return_value=True) as flow:
            rc = launcher_main._run_management(repo, 7880)
        assert rc == 0
        flow.assert_called_once_with(repo)

    def test_close_is_non_destructive(self) -> None:
        repo = Path("/tmp/bibliogon")
        with patch.object(
            launcher_main.ui, "management_dialog", return_value="close"
        ), patch.object(launcher_main.docker, "compose_down") as down, patch.object(
            launcher_main, "_run_uninstall_flow"
        ) as flow:
            rc = launcher_main._run_management(repo, 7880)
        assert rc == 0
        down.assert_not_called()
        flow.assert_not_called()


class TestStartupDetectsRunning:
    def test_already_running_via_lockfile_opens_management(self) -> None:
        """When the install resolves, the lockfile path shows the
        management dialog (not just the info box)."""
        repo = Path("/tmp/bibliogon")
        with patch.object(launcher_main.config, "resolve_repo_path", return_value=repo), patch.object(
            launcher_main.config, "is_valid_repo", return_value=True
        ), patch.object(launcher_main.config, "read_port", return_value=7880), patch.object(
            launcher_main, "_run_management", return_value=0
        ) as manage, patch.object(launcher_main.ui, "info_box") as info:
            launcher_main._handle_already_running()
        manage.assert_called_once_with(repo, 7880)
        info.assert_not_called()

    def test_already_running_without_install_falls_back_to_info_box(self) -> None:
        with patch.object(
            launcher_main.config, "resolve_repo_path", return_value=Path("/nope")
        ), patch.object(launcher_main.config, "is_valid_repo", return_value=False), patch.object(
            launcher_main.ui, "info_box"
        ) as info, patch.object(launcher_main.webbrowser, "open"), patch.object(
            launcher_main, "_run_management"
        ) as manage:
            launcher_main._handle_already_running()
        info.assert_called_once()
        manage.assert_not_called()


class TestCliUninstall:
    def test_cli_uninstall_runs_cleanup_and_returns_zero(self) -> None:
        with patch.object(
            launcher_main.manifest, "install_dir_from_manifest", return_value=Path("/tmp/bibliogon")
        ), patch.object(
            launcher_main.cleanup,
            "uninstall_bibliogon",
            return_value={s: True for s in launcher_main.manifest.CLEANUP_STEPS},
        ) as un:
            rc = launcher_main._cli_uninstall()
        assert rc == 0
        un.assert_called_once()

    def test_cli_uninstall_returns_one_on_incomplete(self) -> None:
        partial = {s: True for s in launcher_main.manifest.CLEANUP_STEPS}
        partial["rmtree"] = False
        with patch.object(
            launcher_main.manifest, "install_dir_from_manifest", return_value=Path("/tmp/bibliogon")
        ), patch.object(
            launcher_main.cleanup, "uninstall_bibliogon", return_value=partial
        ):
            rc = launcher_main._cli_uninstall()
        assert rc == 1

class TestNoForeignProjectReference:
    """Regression guard: no copied ``adaptive-learner`` identifier leaks
    into the launcher or the compose files (issue #520 diagnosis)."""

    def test_no_adaptive_learner_reference(self) -> None:
        repo_root = Path(__file__).resolve().parent.parent.parent
        targets = [repo_root / "docker-compose.yml", repo_root / "docker-compose.prod.yml"]
        targets += list((repo_root / "launcher" / "bibliogon_launcher").glob("*.py"))
        for path in targets:
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8").lower()
            assert "adaptive-learner" not in text and "adaptive_learner" not in text, (
                f"{path} contains an adaptive-learner reference"
            )


class TestMainRouting:
    def test_main_routes_uninstall_flag(self) -> None:
        with patch.object(launcher_main.sys, "argv", ["bibliogon-launcher", "--uninstall"]), patch.object(
            launcher_main, "_cli_uninstall", return_value=0
        ) as cli, patch.object(launcher_main, "_setup_logging"), patch.object(
            launcher_main.i18n, "init"
        ):
            rc = launcher_main.main()
        assert rc == 0
        cli.assert_called_once()
