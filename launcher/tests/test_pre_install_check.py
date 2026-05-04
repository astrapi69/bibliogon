"""Tests for the pre-install stale-target safeguard.

The safeguard lives in ``__main__._check_launcher_target_stale``.
It runs at the top of ``_install_or_welcome`` (before the welcome
dialog) on a fresh machine. If GitHub reports a Bibliogon release
newer than the launcher's embedded ``BIBLIOGON_TARGET_VERSION``,
a 3-button dialog is shown:

- "Open download page" (primary): browser opens, install aborts
- "Continue with older version" (secondary): install proceeds
- "Cancel" (cancel): install aborts

Network failure (`fetch_latest_version` returns None) is
fail-open: install proceeds with the embedded TARGET.

Tests mock ``update_check.fetch_latest_version`` and
``ui.three_button_dialog`` so no network or UI is touched.
"""

from __future__ import annotations

from unittest.mock import patch

from bibliogon_launcher import __main__ as launcher_main
from bibliogon_launcher import installer


def _patch_target(monkeypatch, target: str) -> None:
    """Pin BIBLIOGON_TARGET_VERSION for the duration of the test."""
    monkeypatch.setattr(installer, "BIBLIOGON_TARGET_VERSION", target)


class TestCheckLauncherTargetStale:
    def test_latest_newer_than_target_open_download_aborts(
        self, monkeypatch
    ) -> None:
        """Newer release exists; user clicks Open download page.

        Expected: webbrowser opens the release URL, helper returns
        False (install aborts).
        """
        _patch_target(monkeypatch, "0.17.0")
        with patch(
            "bibliogon_launcher.update_check.fetch_latest_version",
            return_value=("v0.25.0", "https://example/release/v0.25.0"),
        ), patch(
            "bibliogon_launcher.ui.three_button_dialog",
            return_value="primary",
        ), patch(
            "webbrowser.open"
        ) as mock_open:
            result = launcher_main._check_launcher_target_stale()
        assert result is False
        mock_open.assert_called_once_with(
            "https://example/release/v0.25.0"
        )

    def test_latest_newer_continue_with_older_proceeds(
        self, monkeypatch
    ) -> None:
        """Newer release; user clicks Continue with older version.

        Expected: helper returns True, install proceeds, browser is
        not opened.
        """
        _patch_target(monkeypatch, "0.17.0")
        with patch(
            "bibliogon_launcher.update_check.fetch_latest_version",
            return_value=("v0.25.0", "https://example/release/v0.25.0"),
        ), patch(
            "bibliogon_launcher.ui.three_button_dialog",
            return_value="secondary",
        ), patch(
            "webbrowser.open"
        ) as mock_open:
            result = launcher_main._check_launcher_target_stale()
        assert result is True
        mock_open.assert_not_called()

    def test_latest_newer_cancel_aborts(self, monkeypatch) -> None:
        """Newer release; user clicks Cancel.

        Expected: helper returns False (install aborts), browser is
        not opened.
        """
        _patch_target(monkeypatch, "0.17.0")
        with patch(
            "bibliogon_launcher.update_check.fetch_latest_version",
            return_value=("v0.25.0", "https://example/release/v0.25.0"),
        ), patch(
            "bibliogon_launcher.ui.three_button_dialog",
            return_value="cancel",
        ), patch(
            "webbrowser.open"
        ) as mock_open:
            result = launcher_main._check_launcher_target_stale()
        assert result is False
        mock_open.assert_not_called()

    def test_target_equals_latest_no_dialog(self, monkeypatch) -> None:
        """TARGET matches latest release.

        Expected: helper returns True, dialog is never shown.
        """
        _patch_target(monkeypatch, "0.25.0")
        with patch(
            "bibliogon_launcher.update_check.fetch_latest_version",
            return_value=("v0.25.0", "https://example/release/v0.25.0"),
        ), patch(
            "bibliogon_launcher.ui.three_button_dialog",
        ) as mock_dialog:
            result = launcher_main._check_launcher_target_stale()
        assert result is True
        mock_dialog.assert_not_called()

    def test_network_failure_fails_open(self, monkeypatch) -> None:
        """fetch_latest_version returns None (network error).

        Expected: helper returns True (install proceeds with
        embedded TARGET), dialog is never shown.
        """
        _patch_target(monkeypatch, "0.17.0")
        with patch(
            "bibliogon_launcher.update_check.fetch_latest_version",
            return_value=None,
        ), patch(
            "bibliogon_launcher.ui.three_button_dialog",
        ) as mock_dialog:
            result = launcher_main._check_launcher_target_stale()
        assert result is True
        mock_dialog.assert_not_called()
