"""Tests for the entry-point dispatcher and cross-cutting guards.

The launcher entry point routes CLI-flag invocations to the headless
``cli`` layer and everything else to the single-window ``gui``. These
tests pin that dispatch + the lockfile lifecycle around the GUI, and the
regression guard that no foreign ``adaptive-learner`` identifier leaks
into the launcher or compose files.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from bibliogon_launcher import __main__ as launcher_main


class TestMainDispatch:

    def test_cli_flag_routes_to_cli(self) -> None:
        with patch.object(launcher_main, "_setup_logging"), \
             patch.object(launcher_main.i18n, "init"), \
             patch.object(launcher_main.cli, "run", return_value=0) as cli_run, \
             patch.object(launcher_main, "_run_gui") as run_gui:
            rc = launcher_main.main(["--status"])
        assert rc == 0
        cli_run.assert_called_once_with(["--status"])
        run_gui.assert_not_called()

    def test_no_flags_opens_gui(self) -> None:
        with patch.object(launcher_main, "_setup_logging"), \
             patch.object(launcher_main.i18n, "init"), \
             patch.object(launcher_main.cli, "run") as cli_run, \
             patch.object(launcher_main, "_run_gui", return_value=0) as run_gui:
            rc = launcher_main.main([])
        assert rc == 0
        run_gui.assert_called_once()
        cli_run.assert_not_called()

    def test_debug_alone_opens_gui(self) -> None:
        """--debug is a modifier, not an action: it still opens the GUI."""
        with patch.object(launcher_main, "_setup_logging"), \
             patch.object(launcher_main.i18n, "init"), \
             patch.object(launcher_main.cli, "run") as cli_run, \
             patch.object(launcher_main, "_run_gui", return_value=0) as run_gui:
            launcher_main.main(["--debug"])
        run_gui.assert_called_once()
        cli_run.assert_not_called()

    def test_uninstall_flag_routes_to_cli(self) -> None:
        with patch.object(launcher_main, "_setup_logging"), \
             patch.object(launcher_main.i18n, "init"), \
             patch.object(launcher_main.cli, "run", return_value=0) as cli_run:
            rc = launcher_main.main(["--uninstall"])
        assert rc == 0
        cli_run.assert_called_once_with(["--uninstall"])


class TestRunGui:

    def test_takes_lock_runs_gui_and_clears_lock(self) -> None:
        with patch.object(launcher_main, "_retry_pending_cleanup") as retry, \
             patch.object(launcher_main.lockfile, "another_instance_alive", return_value=False), \
             patch.object(launcher_main.lockfile, "write_lock") as write_lock, \
             patch.object(launcher_main.lockfile, "clear_lock") as clear_lock, \
             patch("bibliogon_launcher.gui.run", return_value=0) as gui_run:
            rc = launcher_main._run_gui()
        assert rc == 0
        retry.assert_called_once()
        write_lock.assert_called_once()
        gui_run.assert_called_once()
        clear_lock.assert_called_once()

    def test_lock_cleared_even_when_gui_raises(self) -> None:
        with patch.object(launcher_main, "_retry_pending_cleanup"), \
             patch.object(launcher_main.lockfile, "another_instance_alive", return_value=False), \
             patch.object(launcher_main.lockfile, "write_lock"), \
             patch.object(launcher_main.lockfile, "clear_lock") as clear_lock, \
             patch("bibliogon_launcher.gui.run", side_effect=RuntimeError("boom")):
            try:
                launcher_main._run_gui()
            except RuntimeError:
                pass
        clear_lock.assert_called_once()

    def test_failed_lock_check_fails_open(self) -> None:
        with patch.object(launcher_main, "_retry_pending_cleanup"), \
             patch.object(launcher_main.lockfile, "another_instance_alive", side_effect=OSError("x")), \
             patch.object(launcher_main.lockfile, "write_lock"), \
             patch.object(launcher_main.lockfile, "clear_lock"), \
             patch("bibliogon_launcher.gui.run", return_value=0) as gui_run:
            rc = launcher_main._run_gui()
        assert rc == 0
        gui_run.assert_called_once()


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
