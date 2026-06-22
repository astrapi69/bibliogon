"""Tests for the pure GUI + tray presentation helpers.

The tkinter window (LauncherApp) needs a display and is exercised
manually per launcher/TESTPLAN.md; these tests pin the testable logic
the window consumes (port classification, per-state button sets, the
tray menu spec) plus a module-import smoke check.
"""

from __future__ import annotations

from bibliogon_launcher import actions, gui, tray


class TestButtonsForState:

    def test_not_installed(self) -> None:
        assert gui.buttons_for_state(actions.STATE_NOT_INSTALLED) == ["install"]

    def test_running(self) -> None:
        assert gui.buttons_for_state(actions.STATE_RUNNING) == ["open", "stop", "uninstall"]

    def test_stopped(self) -> None:
        assert gui.buttons_for_state(actions.STATE_STOPPED) == ["start", "uninstall"]

    def test_no_docker(self) -> None:
        assert gui.buttons_for_state(actions.STATE_NO_DOCKER) == ["recheck"]

    def test_unknown_state_defaults_to_recheck(self) -> None:
        assert gui.buttons_for_state("???") == ["recheck"]

    def test_returns_copy_not_shared_list(self) -> None:
        first = gui.buttons_for_state(actions.STATE_RUNNING)
        first.append("mutated")
        assert gui.buttons_for_state(actions.STATE_RUNNING) == ["open", "stop", "uninstall"]


class TestClassifyPort:

    def test_invalid_non_numeric(self) -> None:
        assert gui.classify_port("abc") == "invalid"

    def test_invalid_below_range(self) -> None:
        assert gui.classify_port("80") == "invalid"

    def test_invalid_above_range(self) -> None:
        assert gui.classify_port("70000") == "invalid"

    def test_running_is_own(self) -> None:
        assert gui.classify_port("7880", running=True) == "own"

    def test_running_overrides_free(self) -> None:
        assert gui.classify_port("7880", free=True, running=True) == "own"

    def test_free(self) -> None:
        assert gui.classify_port("7880", free=True) == "free"

    def test_busy(self) -> None:
        assert gui.classify_port("7880", free=False) == "busy"

    def test_unknown_without_freeness(self) -> None:
        assert gui.classify_port("7880") == "unknown"

    def test_empty_is_invalid(self) -> None:
        assert gui.classify_port("") == "invalid"


class TestPortIndicatorStyle:

    def test_free_is_green(self) -> None:
        style = gui._port_indicator_style("free")
        assert style["foreground"] == gui._OK_COLOR

    def test_own_is_green(self) -> None:
        assert gui._port_indicator_style("own")["foreground"] == gui._OK_COLOR

    def test_busy_is_red(self) -> None:
        assert gui._port_indicator_style("busy")["foreground"] == gui._BUSY_COLOR

    def test_invalid_is_red(self) -> None:
        assert gui._port_indicator_style("invalid")["foreground"] == gui._BUSY_COLOR

    def test_unknown_has_no_text(self) -> None:
        assert gui._port_indicator_style("unknown")["text"] == ""


class TestTray:

    def test_tray_available_returns_bool(self) -> None:
        assert isinstance(tray.tray_available(), bool)

    def test_menu_spec_order_and_keys(self) -> None:
        spec = tray.build_menu_spec(
            open_label="Open",
            open_browser_label="Open browser",
            stop_label="Stop",
            quit_label="Quit",
        )
        assert spec == [
            ("Open", "open"),
            ("Open browser", "open_browser"),
            ("Stop", "stop"),
            ("Quit", "quit"),
        ]

    def test_system_tray_raises_without_pystray(self) -> None:
        if tray.HAS_TRAY:
            return  # only assert the fallback contract when pystray is absent
        try:
            tray.SystemTray(menu_spec=[], callbacks={}, tooltip="x")
            raised = False
        except RuntimeError:
            raised = True
        assert raised


class TestModuleImport:

    def test_gui_run_is_callable(self) -> None:
        assert callable(gui.run)

    def test_launcher_app_is_tk_subclass(self) -> None:
        import tkinter as tk
        assert issubclass(gui.LauncherApp, tk.Tk)
