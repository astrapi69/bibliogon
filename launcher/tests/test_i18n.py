"""Tests for the JSON-backed i18n catalog, OS-locale detection, and the
settings flags the launcher persists.

UI rendering is exercised manually (it needs a display); these tests pin
the catalog lookup, fallback, locale resolution, and the German-umlaut
content rule.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from bibliogon_launcher import i18n, settings


class TestI18n:
    """The catalog ships en/de (+ es/fr/el/pt/tr/ja). Unknown langs fall back."""

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

    def test_format_interpolates_placeholders(self) -> None:
        i18n.set_language("en")
        assert i18n.t("state.running", port=7880) == "Bibliogon is running on port 7880."


class TestLocaleResolution:

    def test_locale_de_resolves_to_de_catalog(self) -> None:
        with patch("bibliogon_launcher.i18n.detect_os_lang", return_value="de"):
            assert i18n._resolve_language(None) == "de"

    def test_locale_en_resolves_to_en_catalog(self) -> None:
        with patch("bibliogon_launcher.i18n.detect_os_lang", return_value="en"):
            assert i18n._resolve_language(None) == "en"

    def test_unknown_locale_falls_back_to_en(self) -> None:
        with patch("bibliogon_launcher.i18n.detect_os_lang", return_value="zh"):
            assert i18n._resolve_language(None) == "en"

    def test_settings_language_overrides_locale(self) -> None:
        with patch("bibliogon_launcher.i18n.detect_os_lang", return_value="en"):
            assert i18n._resolve_language("de") == "de"

    def test_detect_os_lang_matches_prefix(self) -> None:
        with patch("bibliogon_launcher.i18n.locale.getlocale", return_value=("de_DE", "UTF-8")):
            assert i18n.detect_os_lang() == "de"

    def test_detect_os_lang_defaults_en(self) -> None:
        with patch("bibliogon_launcher.i18n.locale.getlocale", return_value=(None, None)), \
             patch("bibliogon_launcher.i18n.locale.getdefaultlocale", return_value=(None, None)):
            assert i18n.detect_os_lang() == "en"


class TestGermanUmlauts:
    """Per the project rule 'German content uses real umlauts', the de
    catalog must not use ASCII transliterations for strings that carry
    an umlaut."""

    def test_de_strings_use_real_umlauts(self) -> None:
        de = i18n._CATALOG["de"]
        assert "läuft" in de["welcome.docker_required"]
        assert "benötigt" in de["docker.missing.heading"]
        assert "Schließen" in de["common.close"]
        assert "öffnen" in de["common.open_browser"]
        assert "läuft" in de["state.running"]


class TestSettingsFlags:

    def _patch_path(self, tmp_path: Path):
        return patch.object(settings, "settings_path", return_value=tmp_path / "settings.json")

    def test_default_language_is_none(self, tmp_path: Path) -> None:
        with self._patch_path(tmp_path):
            assert settings.read_settings()["language"] is None

    def test_update_persists_language(self, tmp_path: Path) -> None:
        with self._patch_path(tmp_path):
            settings.update("language", "de")
            assert settings.read_settings()["language"] == "de"


@pytest.fixture(autouse=True)
def _reset_i18n_state():
    """Each test starts with a fresh catalog + active language."""
    i18n._CATALOG = {}
    i18n.init(None)
    yield
    i18n._CATALOG = {}
