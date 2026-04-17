"""Tests for launcher settings module and update check guard integration."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from bibliogon_launcher import settings, update_check


def _patch_path(tmp_path: Path):
    """Redirect settings.settings_path() to tmp_path/settings.json."""
    return patch.object(settings, "settings_path", return_value=tmp_path / "settings.json")


class TestReadSettings:

    def test_returns_defaults_when_missing(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            data = settings.read_settings()
        assert data == settings.DEFAULTS
        assert data is not settings.DEFAULTS  # must be a copy

    def test_returns_defaults_on_corrupt_json(self, tmp_path: Path) -> None:
        (tmp_path / "settings.json").write_text("not json", encoding="utf-8")
        with _patch_path(tmp_path):
            data = settings.read_settings()
        assert data == settings.DEFAULTS

    def test_returns_defaults_on_non_utf8(self, tmp_path: Path) -> None:
        (tmp_path / "settings.json").write_bytes(b"\xff\xfe\x00")
        with _patch_path(tmp_path):
            data = settings.read_settings()
        assert data == settings.DEFAULTS

    def test_returns_defaults_when_file_is_list(self, tmp_path: Path) -> None:
        """A JSON list is not a settings dict - fall back to defaults."""
        (tmp_path / "settings.json").write_text("[1, 2, 3]", encoding="utf-8")
        with _patch_path(tmp_path):
            data = settings.read_settings()
        assert data == settings.DEFAULTS

    def test_file_values_override_defaults(self, tmp_path: Path) -> None:
        (tmp_path / "settings.json").write_text(
            json.dumps({"auto_update_check": False}), encoding="utf-8",
        )
        with _patch_path(tmp_path):
            data = settings.read_settings()
        assert data["auto_update_check"] is False

    def test_unknown_keys_preserved(self, tmp_path: Path) -> None:
        """Forward-compat: unknown keys written by a newer launcher
        version pass through unchanged."""
        (tmp_path / "settings.json").write_text(
            json.dumps({"auto_update_check": True, "future_key": "value"}),
            encoding="utf-8",
        )
        with _patch_path(tmp_path):
            data = settings.read_settings()
        assert data["future_key"] == "value"

    def test_missing_defaults_keys_restored(self, tmp_path: Path) -> None:
        """Existing file with older schema gets defaults merged in."""
        (tmp_path / "settings.json").write_text(
            json.dumps({"future_key": "value"}),  # no auto_update_check
            encoding="utf-8",
        )
        with _patch_path(tmp_path):
            data = settings.read_settings()
        assert data["auto_update_check"] is True  # default restored
        assert data["future_key"] == "value"


class TestWriteSettings:

    def test_creates_parent_dirs(self, tmp_path: Path) -> None:
        target = tmp_path / "nested" / "dir" / "settings.json"
        with patch.object(settings, "settings_path", return_value=target):
            settings.write_settings({"auto_update_check": False})
        assert target.is_file()
        data = json.loads(target.read_text(encoding="utf-8"))
        assert data["auto_update_check"] is False

    def test_roundtrip(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            settings.write_settings({"auto_update_check": False, "future_key": "x"})
            data = settings.read_settings()
        assert data["auto_update_check"] is False
        assert data["future_key"] == "x"

    def test_write_error_is_swallowed(self, tmp_path: Path) -> None:
        """A non-writable target must not propagate OSError."""
        with patch.object(settings, "settings_path", return_value=Path("/dev/null/cannot")):
            settings.write_settings({"auto_update_check": False})  # no exception


class TestGetUpdate:

    def test_get_default(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            assert settings.get("auto_update_check") is True

    def test_get_after_update(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            settings.update("auto_update_check", False)
            assert settings.get("auto_update_check") is False

    def test_get_unknown_key_returns_none(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            assert settings.get("definitely_not_a_setting") is None

    def test_update_preserves_other_keys(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            settings.write_settings({"auto_update_check": True, "future_key": "keep"})
            settings.update("auto_update_check", False)
            data = settings.read_settings()
        assert data["auto_update_check"] is False
        assert data["future_key"] == "keep"


class TestUpdateCheckGuardIntegration:
    """Verify the update check respects the auto_update_check setting.

    This tests the integration point at the call site (update_check
    module itself is setting-agnostic; the guard lives in __main__).
    We test the guard's observable behavior: get("auto_update_check")
    must reflect the persisted value.
    """

    def test_guard_reads_stored_false(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            settings.update("auto_update_check", False)
            # This is the exact check _schedule_update_check uses
            assert bool(settings.get("auto_update_check")) is False

    def test_guard_reads_default_true(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            assert bool(settings.get("auto_update_check")) is True

    def test_guard_survives_corrupt_file(self, tmp_path: Path) -> None:
        """A broken settings.json must fall back to default True so the
        check still runs and the user gets update notifications."""
        (tmp_path / "settings.json").write_text("{broken", encoding="utf-8")
        with _patch_path(tmp_path):
            assert bool(settings.get("auto_update_check")) is True
