"""Tests for the JSON-backed i18n catalog, welcome-flag handling, and
the Docker-missing dispatch added to ``__main__._run_launcher``.

UI primitives (``ui.welcome_dialog``, ``ui.three_button_dialog``,
``ui.error_dialog``) are not exercised end-to-end - they require a
display. Instead we patch them at the module level and assert on
arguments / dispatch.
"""

from __future__ import annotations

from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

import pytest

from bibliogon_launcher import i18n, settings


# --- i18n -----------------------------------------------------------


class TestI18n:
    """The catalog ships ``en`` and ``de``. Other resolvers fall back."""

    def setup_method(self) -> None:
        i18n._CATALOG = {}  # force reload
        i18n.init(None)

    def test_returns_english_when_active_lang_is_en(self) -> None:
        i18n.set_language("en")
        assert i18n.t("welcome.title") == "Welcome to Bibliogon"

    def test_returns_german_when_active_lang_is_de(self) -> None:
        i18n.set_language("de")
        assert i18n.t("welcome.title") == "Willkommen bei Bibliogon"

    def test_falls_back_to_english_when_key_missing_from_de(self) -> None:
        i18n.set_language("de")
        i18n._CATALOG["de"].pop("welcome.title", None)
        assert i18n.t("welcome.title") == "Welcome to Bibliogon"

    def test_returns_key_itself_when_missing_from_both(self) -> None:
        i18n.set_language("en")
        assert i18n.t("definitely.unknown.key") == "definitely.unknown.key"

    def test_set_language_ignores_unknown_codes(self) -> None:
        i18n.set_language("en")
        i18n.set_language("klingon")
        assert i18n.active_language() == "en"

    def test_locale_de_resolves_to_de_catalog(self) -> None:
        with patch("bibliogon_launcher.ui._current_lang", return_value="de"):
            assert i18n._resolve_language(None) == "de"

    def test_locale_en_resolves_to_en_catalog(self) -> None:
        with patch("bibliogon_launcher.ui._current_lang", return_value="en"):
            assert i18n._resolve_language(None) == "en"

    def test_unknown_locale_falls_back_to_en(self) -> None:
        # Use "zh" (Chinese) as a placeholder for an unsupported
        # language. JA used to play this role before the JA catalog
        # shipped in v0.30.0.
        with patch("bibliogon_launcher.ui._current_lang", return_value="zh"):
            assert i18n._resolve_language(None) == "en"

    def test_settings_language_overrides_locale(self) -> None:
        with patch("bibliogon_launcher.ui._current_lang", return_value="en"):
            assert i18n._resolve_language("de") == "de"

    def test_german_catalog_uses_real_umlauts(self) -> None:
        """Per project rule lessons-learned 'German content uses real
        umlauts' the de catalog must NOT use ASCII transliterations
        (ae/oe/ue/ss) for any string that should carry an umlaut."""
        de = i18n._CATALOG["de"]
        # Spot-check a few strings with known umlauts/sharp-s.
        # First batch covers the v0.27.0 first-run flow (welcome +
        # Docker-missing); the second batch covers
        # LAUNCHER-I18N-EXTRACT-01 strings extracted in v0.28.x.
        assert "läuft" in de["welcome.docker_required"]
        assert "lädt" in de["welcome.first_run_size"]
        assert "benötigt" in de["docker.missing.heading"]
        assert "heißt" in de["docker.missing.explanation"]
        # New (extraction-pass) strings:
        assert "läuft" in de["docker.daemon.title"]
        assert "Schließen" in de["common.close"]
        assert "öffnen" in de["common.open_browser"]
        assert "verfügbar" in de["update.message"]
        assert "Bücher" in de["uninstall.message"]
        assert "fortfahren" in de["stale.continue_old"]
        assert "möglicherweise" in de["cleanup.message"]
        assert "Wiederholen" in de["common.retry"]


# --- welcome flag ---------------------------------------------------


class TestWelcomedFlag:
    """settings.welcomed defaults False and flips True after first
    welcome dialog. The flag itself just lives in settings; the
    write happens in ``__main__._run_launcher``. Cover both."""

    def _patch_path(self, tmp_path: Path):
        return patch.object(
            settings, "settings_path", return_value=tmp_path / "settings.json"
        )

    def test_default_welcomed_is_false(self, tmp_path: Path) -> None:
        with self._patch_path(tmp_path):
            assert settings.read_settings()["welcomed"] is False

    def test_update_persists_welcomed_true(self, tmp_path: Path) -> None:
        with self._patch_path(tmp_path):
            settings.update("welcomed", True)
            assert settings.read_settings()["welcomed"] is True

    def test_default_language_is_none(self, tmp_path: Path) -> None:
        with self._patch_path(tmp_path):
            assert settings.read_settings()["language"] is None


# --- Docker-missing dialog dispatch --------------------------------


class TestDockerMissingDialog:
    """``_run_launcher`` shows a three-button dialog when Docker is
    not installed. Each button must dispatch to the right URL or to
    ``return 1`` (quit). Heavy patching: docker checks, ui calls,
    webbrowser, settings, retry helpers."""

    def _run(self, choice: str):
        from bibliogon_launcher import __main__ as main_mod

        opens: list[str] = []

        with (
            patch.object(main_mod.docker, "docker_installed", return_value=(False, "no")),
            patch.object(main_mod.config, "get_show_details_default", return_value=False),
            patch.object(main_mod, "_retry_pending_cleanup"),
            patch.object(main_mod.settings, "get", return_value=True),  # already welcomed
            patch.object(main_mod.ui, "three_button_dialog", return_value=choice) as dlg,
            patch.object(main_mod.webbrowser, "open", side_effect=opens.append),
        ):
            rc = main_mod._run_launcher()
        return rc, opens, dlg

    def test_install_button_opens_docker_download_page(self) -> None:
        from bibliogon_launcher import __main__ as main_mod

        rc, opens, _ = self._run("primary")
        assert rc == 1
        assert opens == [main_mod.DOCKER_INSTALL_URL]

    def test_guide_button_opens_bibliogon_docker_guide(self) -> None:
        rc, opens, _ = self._run("secondary")
        assert rc == 1
        assert len(opens) == 1
        assert "docs/help" in opens[0] and "docker-desktop.md" in opens[0]

    def test_quit_button_returns_without_opening_browser(self) -> None:
        rc, opens, _ = self._run("cancel")
        assert rc == 1
        assert opens == []


# --- docker-check-then-welcome ordering (Problem 1) ----------------


class TestDockerCheckBeforeWelcome:
    """Docker readiness is the FIRST interactive step (issue #518,
    Problem 1). The welcome dialog only fires once Docker is confirmed
    installed AND running, and only when ``welcomed`` is still False.
    Previously the welcome dialog ran before the Docker check; this
    class pins the reversed order so it cannot regress."""

    def _stop_after_welcome(self, main_mod, tmp_path: Path):
        """Patches that let the flow reach (and stop just after) the
        welcome step with Docker reported ready, without touching the
        real install path."""
        return (
            patch.object(main_mod.config, "get_show_details_default", return_value=False),
            patch.object(main_mod, "_retry_pending_cleanup"),
            patch.object(main_mod.docker, "docker_installed", return_value=(True, "v27")),
            patch.object(main_mod.docker, "docker_daemon_running", return_value=(True, "running")),
            patch.object(main_mod.manifest, "read_manifest", return_value=None),
            patch.object(main_mod.config, "is_valid_repo", return_value=False),
            patch.object(
                main_mod.config,
                "launcher_config_path",
                return_value=tmp_path / "launcher.json",
            ),
            patch.object(main_mod, "_install_or_welcome", return_value=None),
        )

    def test_docker_check_runs_before_welcome_when_docker_missing(self) -> None:
        """Docker missing + not yet welcomed: the Docker-missing dialog
        fires and the welcome dialog is NEVER reached."""
        from bibliogon_launcher import __main__ as main_mod

        with (
            patch.object(main_mod.settings, "get", side_effect=lambda k: False if k == "welcomed" else None),
            patch.object(main_mod.docker, "docker_installed", return_value=(False, "no")),
            patch.object(main_mod.config, "get_show_details_default", return_value=False),
            patch.object(main_mod, "_retry_pending_cleanup"),
            patch.object(main_mod.ui, "welcome_dialog") as welcome_mock,
            patch.object(main_mod.ui, "three_button_dialog", return_value="cancel") as docker_dlg,
            patch.object(main_mod.webbrowser, "open"),
        ):
            rc = main_mod._run_launcher()
        assert rc == 1
        docker_dlg.assert_called_once()
        welcome_mock.assert_not_called()

    def test_docker_not_running_dialog_before_welcome(self) -> None:
        """Docker installed but daemon down + not yet welcomed: the
        daemon dialog fires (with a Re-check button) and welcome is
        never reached."""
        from bibliogon_launcher import __main__ as main_mod

        with (
            patch.object(main_mod.settings, "get", side_effect=lambda k: False if k == "welcomed" else None),
            patch.object(main_mod.docker, "docker_installed", return_value=(True, "v27")),
            patch.object(main_mod.docker, "docker_daemon_running", return_value=(False, "down")),
            patch.object(main_mod.config, "get_show_details_default", return_value=False),
            patch.object(main_mod, "_retry_pending_cleanup"),
            patch.object(main_mod.ui, "welcome_dialog") as welcome_mock,
            patch.object(main_mod.ui, "error_dialog", return_value="cancel") as daemon_dlg,
        ):
            rc = main_mod._run_launcher()
        assert rc == 1
        daemon_dlg.assert_called_once()
        welcome_mock.assert_not_called()

    def test_welcome_fires_after_docker_ready_when_welcomed_false(self, tmp_path: Path) -> None:
        from bibliogon_launcher import __main__ as main_mod

        seen: dict[str, object] = {}

        def fake_welcome(**kwargs: object) -> None:
            seen.update(kwargs)
            seen["called"] = True

        with ExitStack() as stack:
            for cm in self._stop_after_welcome(main_mod, tmp_path):
                stack.enter_context(cm)
            stack.enter_context(
                patch.object(main_mod.settings, "get", side_effect=lambda k: False if k == "welcomed" else None)
            )
            update_mock = stack.enter_context(patch.object(main_mod.settings, "update"))
            stack.enter_context(patch.object(main_mod.ui, "welcome_dialog", side_effect=fake_welcome))
            main_mod._run_launcher()
        assert seen.get("called") is True
        update_mock.assert_any_call("welcomed", True)

    def test_welcome_skipped_when_welcomed_true(self, tmp_path: Path) -> None:
        from bibliogon_launcher import __main__ as main_mod

        with ExitStack() as stack:
            for cm in self._stop_after_welcome(main_mod, tmp_path):
                stack.enter_context(cm)
            stack.enter_context(patch.object(main_mod.settings, "get", return_value=True))
            welcome_mock = stack.enter_context(patch.object(main_mod.ui, "welcome_dialog"))
            main_mod._run_launcher()
        welcome_mock.assert_not_called()


@pytest.fixture(autouse=True)
def _reset_i18n_state() -> None:
    """Each test starts with a fresh catalog + active language."""
    i18n._CATALOG = {}
    i18n.init(None)
    yield
    i18n._CATALOG = {}
