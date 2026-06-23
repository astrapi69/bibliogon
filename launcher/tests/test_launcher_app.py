"""Tests for the pure helpers in ``bibliogon_launcher.launcher_app``.

These cover the display-free logic (state -> editable / buttons / tray
decisions, action dispatch routing, localized labels). The ``LauncherApp``
Tk window itself is not constructed here - it needs a display - its
behaviour is composed entirely from these helpers.
"""

from __future__ import annotations

from unittest.mock import patch

from bibliogon_launcher import i18n, launcher_app


class TestPortEditable:

    def test_editable_before_running(self) -> None:
        assert launcher_app.port_editable("not_installed") is True
        assert launcher_app.port_editable("stopped") is True

    def test_locked_while_running_or_no_docker(self) -> None:
        assert launcher_app.port_editable("running") is False
        assert launcher_app.port_editable("no_docker") is False


class TestButtonsForState:

    def test_no_docker_offers_recheck(self) -> None:
        assert launcher_app.buttons_for_state("no_docker") == [("recheck", "common.retry")]

    def test_not_installed_offers_install(self) -> None:
        ids = [aid for aid, _ in launcher_app.buttons_for_state("not_installed")]
        assert ids == ["install"]

    def test_stopped_offers_start_and_uninstall(self) -> None:
        ids = [aid for aid, _ in launcher_app.buttons_for_state("stopped")]
        assert ids == ["start", "uninstall"]

    def test_running_offers_open_stop_uninstall(self) -> None:
        ids = [aid for aid, _ in launcher_app.buttons_for_state("running")]
        assert ids == ["open", "stop", "uninstall"]

    def test_unknown_state_has_no_buttons(self) -> None:
        assert launcher_app.buttons_for_state("???") == []


class TestDispatchAction:

    def test_install_routes_to_actions_install(self) -> None:
        with patch("bibliogon_launcher.actions.install", return_value=(True, "done")) as m:
            result = launcher_app.dispatch_action(
                "install", compose_file="/c.yml", project="bibliogon", port=7880)
        assert result == (True, "done")
        m.assert_called_once()

    def test_start_routes_to_actions_start(self) -> None:
        with patch("bibliogon_launcher.actions.start", return_value=(True, "up")) as m:
            result = launcher_app.dispatch_action(
                "start", compose_file="/c.yml", project="bibliogon", port=7880)
        assert result == (True, "up")
        m.assert_called_once()

    def test_stop_routes_to_actions_stop(self) -> None:
        with patch("bibliogon_launcher.actions.stop", return_value=(True, "stopped")) as m:
            result = launcher_app.dispatch_action(
                "stop", compose_file="/c.yml", project="bibliogon", port=7880)
        assert result == (True, "stopped")
        m.assert_called_once_with("bibliogon")

    def test_uninstall_routes_to_actions_uninstall(self) -> None:
        with patch("bibliogon_launcher.actions.uninstall", return_value=(True, "gone")) as m:
            result = launcher_app.dispatch_action(
                "uninstall", compose_file="/c.yml", project="bibliogon", port=7880)
        assert result == (True, "gone")
        m.assert_called_once_with("bibliogon")

    def test_open_calls_browser_and_returns_none(self) -> None:
        with patch("bibliogon_launcher.actions.open_browser") as m:
            result = launcher_app.dispatch_action(
                "open", compose_file="/c.yml", project="bibliogon", port=7880)
        assert result is None
        m.assert_called_once_with(7880)

    def test_recheck_is_a_noop_returning_none(self) -> None:
        result = launcher_app.dispatch_action(
            "recheck", compose_file="/c.yml", project="bibliogon", port=7880)
        assert result is None

    def test_unknown_action_returns_none(self) -> None:
        result = launcher_app.dispatch_action(
            "fly", compose_file="/c.yml", project="bibliogon", port=7880)
        assert result is None


class TestShouldMinimizeToTray:

    def test_running_with_tray_minimizes(self) -> None:
        assert launcher_app.should_minimize_to_tray("running", tray_available=True) is True

    def test_running_without_tray_closes(self) -> None:
        assert launcher_app.should_minimize_to_tray("running", tray_available=False) is False

    def test_stopped_never_minimizes(self) -> None:
        assert launcher_app.should_minimize_to_tray("stopped", tray_available=True) is False


class TestLocalizedLabels:
    """i18n-backed helpers resolve to real strings, not the raw key."""

    def test_state_label_is_localized(self) -> None:
        i18n.init(None)
        label = launcher_app.state_label("running")
        assert label and not label.startswith("window.state.")

    def test_tray_menu_labels_cover_every_action(self) -> None:
        i18n.init(None)
        labels = launcher_app.tray_menu_labels()
        assert set(labels) == {"open", "open_browser", "stop", "quit"}
        assert all(value and not value.startswith("tray.") for value in labels.values())
