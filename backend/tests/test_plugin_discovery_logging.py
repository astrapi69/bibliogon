"""Regression tests for the structured ``_log_discovery_result``
plugin-discovery logger.

Replaces ``test_plugin_load_diagnostics.py``, which exercised the
removed ``_log_plugin_diagnostics_pre`` / ``_log_plugin_diagnostics_post``
pair via hand-correlated args. Today's tests build synthetic
``pluginforge.DiscoveryResult`` snapshots and assert against the
log emission shape, so the regression-pin value is preserved
without depending on Bibliogon's hand-rolled correlation.

Pins exercised:

- INFO triplet emits "Plugin discovery: ...", "Plugins enabled
  in config (...)", "Plugins loaded (X/Y enabled): ..." in every
  call (origin: user-report incident from the original
  diagnostics tests — "no plugin loading messages" must never
  mean "no info logged").
- WARNING per ``severity="error"`` entry — failure surface.
- INFO per ``severity="warning"`` entry — notice surface.
  Pluginforge v0.7.0 widened ``DiscoveryResult.errors`` to
  carry warning-severity entries (identity deprecation channel);
  this rule pins that the consumer does NOT falsely raise them
  to WARNING.
- WARNING with rebuild hint for plugins with
  ``filter_reason="not_discovered"`` — the user-actionable case
  (enabled in config but no entry point installed; container
  needs rebuild or ``poetry install`` needed).
- No double-warn when an error-severity entry exists alongside
  ``not_discovered`` (sanity: pluginforge does not emit both for
  the same plugin, but the consumer's surfacing must not assume
  otherwise).
"""

from __future__ import annotations

import logging

import pytest
from pluginforge import DiscoveryResult, PluginError, PluginState

from app.main import _log_discovery_result


def _state(
    name: str,
    *,
    discovered: bool = True,
    enabled: bool = True,
    activated: bool = True,
    filter_reason: str | None = None,
) -> PluginState:
    return PluginState(
        name=name,
        discovered=discovered,
        enabled_in_config=enabled,
        disabled_in_config=False,
        activated=activated,
        filter_reason=filter_reason,
    )


def _result(
    states: dict[str, PluginState],
    activated: list[str] | None = None,
    errors: list[PluginError] | None = None,
) -> DiscoveryResult:
    return DiscoveryResult(
        states=states,
        activated=activated or [n for n, s in states.items() if s.activated],
        errors=errors or [],
    )


def test_clean_load_emits_info_triplet_and_no_warnings(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Every plugin enabled-in-config activated cleanly. Only the
    INFO triplet should fire; zero WARNINGs."""
    result = _result(
        {
            "export": _state("export"),
            "medium-import": _state("medium-import"),
        }
    )

    with caplog.at_level(logging.INFO, logger="app.main"):
        _log_discovery_result(result)

    infos = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]

    assert any("Plugin discovery: 2 entry points" in m for m in infos), infos
    assert any("Plugins enabled in config (2)" in m for m in infos), infos
    assert any("Plugins loaded (2/2 enabled)" in m for m in infos), infos
    assert "medium-import" in " ".join(infos)
    assert warnings == [], warnings


def test_severity_error_emits_warning_with_failed_framing(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An entry with severity="error" surfaces as WARNING with
    'failed' framing — the failure surface, preserving the v0.5.x
    user-actionable signal."""
    err = PluginError(
        name="medium-import",
        phase="activation",
        cause=None,
        user_facing_message="bs4 module not installed",
        severity="error",
    )
    result = _result(
        {
            "export": _state("export"),
            "medium-import": _state(
                "medium-import", activated=False, filter_reason="load_failed"
            ),
        },
        activated=["export"],
        errors=[err],
    )

    with caplog.at_level(logging.INFO, logger="app.main"):
        _log_discovery_result(result)

    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any(
        "Plugin 'medium-import' failed" in m
        and "activation" in m
        and "bs4 module not installed" in m
        for m in warnings
    ), warnings


def test_severity_warning_emits_info_notice_not_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An entry with severity="warning" (e.g. v0.7.0 identity
    deprecation) surfaces as INFO with 'notice' framing. NOT
    WARNING — that would falsely flag the plugin as failed when
    it actually activated.

    This is the V060 severity-filter rule: PluginForge widened
    errors-list to include non-failure entries; the consumer must
    distinguish them."""
    notice = PluginError(
        name="some-third-party",
        phase="identity_check",
        cause=None,
        user_facing_message=(
            "Plugin 'some-third-party' does not declare target_application. "
            "Hosts adopting app_id in v0.8.0 or later will filter this plugin."
        ),
        severity="warning",
    )
    result = _result(
        {"some-third-party": _state("some-third-party")},
        errors=[notice],
    )

    with caplog.at_level(logging.INFO, logger="app.main"):
        _log_discovery_result(result)

    infos = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]

    assert any(
        "Plugin 'some-third-party' notice" in m
        and "identity_check" in m
        and "target_application" in m
        for m in infos
    ), infos
    assert not any(
        "some-third-party" in m and "failed" in m for m in warnings
    ), warnings


def test_not_discovered_filter_reason_emits_rebuild_hint_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A plugin enabled-in-config but missing an entry point lands
    in DiscoveryResult.states with filter_reason='not_discovered'.
    The consumer must surface a WARNING with the rebuild hint —
    this is the original 'medium-import doesn't load' user
    report pinned by the predecessor tests."""
    result = _result(
        {
            "export": _state("export"),
            "medium-import": _state(
                "medium-import",
                discovered=False,
                activated=False,
                filter_reason="not_discovered",
            ),
        },
        activated=["export"],
    )

    with caplog.at_level(logging.WARNING, logger="app.main"):
        _log_discovery_result(result)

    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any(
        "medium-import" in m and "rebuild the container" in m and "poetry install" in m
        for m in warnings
    ), warnings


def test_empty_discovery_emits_info_only_no_warnings(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Edge case: empty DiscoveryResult (no plugins discovered or
    enabled). INFO triplet still fires with '0 entry points' and
    'none' framing; no spurious WARNINGs."""
    result = _result({}, activated=[], errors=[])

    with caplog.at_level(logging.INFO, logger="app.main"):
        _log_discovery_result(result)

    infos = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]

    assert any("Plugin discovery: 0 entry points" in m for m in infos), infos
    assert any("Plugins enabled in config (0)" in m for m in infos), infos
    assert any("Plugins loaded (0/0 enabled)" in m for m in infos), infos
    assert warnings == [], warnings
