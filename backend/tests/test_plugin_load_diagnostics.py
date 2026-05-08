"""Regression tests for the plugin-load diagnostic logging.

Background: a user reported "the medium-import plugin doesn't load
at runtime" with the symptom "backend logs show no plugin loading
messages". Root cause was almost certainly a stale container image
(restart vs. rebuild), but the deeper problem was that the old
logging only reported successes; a plugin enabled in ``app.yaml``
but missing from the installed set produced ZERO log evidence.

These tests pin the diagnostic logging shape so the next time this
question comes up, the answer is in the startup log:

  * INFO  "Plugin discovery: <N> entry points found ..."
  * INFO  "Plugins enabled in config (<N>): ..."
  * INFO  "Plugins loaded (<active>/<enabled>): ..."
  * WARN  "Plugin '<x>' failed to load: ..."           (only on errors)
  * WARN  "Plugins enabled in config but not loaded ... rebuild the
           container ..."                              (only on diff)

The tests call the diagnostic helpers directly so they don't have
to re-fire the FastAPI lifespan (pluginforge does not tolerate a
second discover_plugins() on the same manager instance, see
pluggy ValueError on duplicate registration).
"""

from __future__ import annotations

import logging

import pytest

from app.main import (
    _discovered_entry_points,
    _enabled_plugins_from_config,
    _log_plugin_diagnostics_post,
    _log_plugin_diagnostics_pre,
)


def test_discovered_entry_points_includes_medium_import() -> None:
    """The plugin must be in the entry-point set, otherwise the
    bug isn't 'logging' - it's 'plugin not installed'."""
    discovered = _discovered_entry_points()
    assert "medium-import" in discovered, (
        "medium-import not in entry-point set; if this fails in "
        "production, run `poetry install` in backend/ or rebuild "
        "the container."
    )


def test_enabled_plugins_list_includes_medium_import() -> None:
    """Sanity: backend/config/app.yaml.example has medium-import in
    plugins.enabled. A failure here means the YAML lost the entry."""
    enabled = _enabled_plugins_from_config()
    assert "medium-import" in enabled


def test_pre_log_emits_discovery_and_enabled_lines(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO, logger="app.main"):
        _log_plugin_diagnostics_pre(enabled_in_config=["export", "medium-import"])

    messages = [r.getMessage() for r in caplog.records]
    discovery_lines = [m for m in messages if m.startswith("Plugin discovery:")]
    enabled_lines = [m for m in messages if m.startswith("Plugins enabled in config")]

    assert discovery_lines, "expected a 'Plugin discovery:' line"
    assert "entry points found via 'bibliogon.plugins' group" in discovery_lines[0]

    assert enabled_lines, "expected a 'Plugins enabled in config' line"
    assert "(2)" in enabled_lines[0]
    assert "medium-import" in enabled_lines[0]


def test_post_log_emits_loaded_count_and_no_warnings_on_clean_load(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """When everything loaded that was enabled, the post-log emits
    only the INFO loaded line. No warnings."""
    with caplog.at_level(logging.INFO, logger="app.main"):
        _log_plugin_diagnostics_post(
            active=["export", "medium-import"],
            load_errors={},
            enabled_in_config=["export", "medium-import"],
        )

    info = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]

    assert any("Plugins loaded (2/2 enabled)" in m for m in info), info
    assert warnings == []


def test_post_log_warns_on_load_error(caplog: pytest.LogCaptureFixture) -> None:
    """Pluginforge surfaces a load failure via get_load_errors().
    The diagnostic logger MUST raise it to WARNING so it shows up
    without debug logging."""
    with caplog.at_level(logging.WARNING, logger="app.main"):
        _log_plugin_diagnostics_post(
            active=["export"],
            load_errors={"medium-import": "ImportError: bs4 not found"},
            enabled_in_config=["export", "medium-import"],
        )

    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any(
        "Plugin 'medium-import' failed to load" in m and "ImportError: bs4 not found" in m
        for m in warnings
    ), warnings


def test_post_log_warns_on_enabled_but_not_loaded(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The 'enabled in config but no entry point' diff must produce
    an actionable WARN with the rebuild hint - this is the exact
    scenario the user hit when the container wasn't rebuilt."""
    with caplog.at_level(logging.WARNING, logger="app.main"):
        _log_plugin_diagnostics_post(
            active=["export"],
            load_errors={},
            enabled_in_config=["export", "medium-import"],
        )

    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any(
        "medium-import" in m and "rebuild the container" in m and "poetry install" in m
        for m in warnings
    ), warnings


def test_post_log_does_not_double_warn_when_error_is_recorded(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A plugin in load_errors should NOT also appear in the
    'enabled but not loaded' diff - that would be a double warning
    for the same plugin and confuse the diagnosis."""
    with caplog.at_level(logging.WARNING, logger="app.main"):
        _log_plugin_diagnostics_post(
            active=["export"],
            load_errors={"medium-import": "boom"},
            enabled_in_config=["export", "medium-import"],
        )

    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    rebuild_hints = [m for m in warnings if "rebuild the container" in m]
    assert rebuild_hints == [], (
        f"expected no rebuild-hint when plugin is in load_errors, got: {rebuild_hints}"
    )
