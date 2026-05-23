"""Regression test for plugin min_app_version gating.

PLUGIN-VERSION-GATING-ENABLE-01 wires `app_version=__version__` into
the PluginManager ctor at backend/app/main.py:310, enabling
pluginforge's `_check_app_version` enforcement. Without that
kwarg, pluginforge silently short-circuits the check
(pluginforge/manager.py).

This test pins the gating by registering a synthetic plugin
with `min_app_version="99.0.0"` against a fresh manager whose
`app_version` is much lower (the actual host version). The
plugin must be filtered out with `filter_reason =
"incompatible_app_version"` and surface a load error.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pluginforge import BasePlugin, PluginManager

from app import __version__ as APP_VERSION


class _FutureRequiredPlugin(BasePlugin):
    """Synthetic plugin that requires a future Bibliogon version."""

    name = "future-required-test-plugin"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    min_app_version = "99.0.0"
    license_tier = "core"


class _CurrentlyCompatiblePlugin(BasePlugin):
    """Synthetic plugin that satisfies the current host version."""

    name = "currently-compatible-test-plugin"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    min_app_version = "0.0.1"
    license_tier = "core"


@pytest.fixture
def fresh_manager(tmp_path: Path) -> PluginManager:
    """A pluginforge manager with app_version pinned to the host's
    actual __version__. The config_path points at a tmpdir so the
    manager doesn't pull in production plugin enablement."""
    cfg = tmp_path / "app.yaml"
    cfg.write_text("plugins:\n  enabled: []\n  disabled: []\n")
    return PluginManager(
        config_path=str(cfg),
        api_version="1",
        app_id="bibliogon",
        app_version=APP_VERSION,
    )


def test_plugin_with_future_min_app_version_is_filtered(
    fresh_manager: PluginManager,
) -> None:
    """A plugin requiring app_version >= 99.0.0 must NOT activate on
    the current host. The manager records the filter reason for
    operator visibility."""
    plugin = _FutureRequiredPlugin()
    fresh_manager.register_plugin(plugin, plugin_config={})

    active = {p.name for p in fresh_manager.get_active_plugins()}
    assert plugin.name not in active

    errors = fresh_manager.get_load_errors()
    assert plugin.name in errors
    assert "99.0.0" in errors[plugin.name]
    assert APP_VERSION in errors[plugin.name]

    info = fresh_manager.inspect_plugin(plugin.name)
    assert info is not None
    assert info.state.filter_reason == "incompatible_app_version"


def test_plugin_with_compatible_min_app_version_activates(
    fresh_manager: PluginManager,
) -> None:
    """A plugin requiring app_version >= 0.0.1 must activate cleanly
    on any release that ever shipped. This is the positive
    counterpart to the gating test — ensures the gate doesn't
    accidentally reject compatible plugins."""
    plugin = _CurrentlyCompatiblePlugin()
    fresh_manager.register_plugin(plugin, plugin_config={})

    active = {p.name for p in fresh_manager.get_active_plugins()}
    assert plugin.name in active

    errors = fresh_manager.get_load_errors()
    assert plugin.name not in errors


def test_real_plugins_pass_their_declared_min_app_version() -> None:
    """The two first-party plugins that declare min_app_version
    (comics @ 0.35.0, kinderbuch @ 0.9.0) must pass the gate at
    the current host version. If this test ever fails, the host
    has regressed below a plugin's declared floor — investigate
    before shipping."""
    from packaging.version import Version

    host = Version(APP_VERSION)
    assert host >= Version("0.35.0"), (
        f"Host version {APP_VERSION} is below comics plugin's "
        f"min_app_version 0.35.0"
    )
    assert host >= Version("0.9.0"), (
        f"Host version {APP_VERSION} is below kinderbuch plugin's "
        f"min_app_version 0.9.0"
    )
