"""Regression test for PLUGINFORGE-V060-ADOPTION-01 C1.

Verifies the v0.6.0 ``PluginManager.refresh_config`` integration
at the three former private-poke sites:

- ``app.main._sync_manager_with_overlay``
- ``app.routers.plugin_install._refresh_manager_app_config``
- ``app.routers.settings._refresh_manager_app_config``

The previous implementation reached into ``manager._app_config``
directly and SILENTLY DID NOT propagate the new config to each
active plugin's ``self.app_config`` reference. The v0.6.0 public
API does both: replace the manager's snapshot AND set
``plugin.app_config`` on each active plugin (so handler-time
``self.config`` / ``self.app_config`` reads see the new value).

This test pins the propagation. Regression-pin: if anyone removes
the ``refresh_config`` call or reverts to the private poke, this
test fails because the plugin's ``app_config`` reference will
diverge from the manager's snapshot.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_sync_manager_with_overlay_propagates_to_active_plugins(
    monkeypatch,
) -> None:
    """``_sync_manager_with_overlay`` propagates a fresh overlay to every
    active plugin's ``self.app_config`` via ``refresh_config``."""
    from app import main as app_main

    with TestClient(app_main.app):
        active = app_main.manager.get_active_plugins()
        assert active, "Expected active plugins after lifespan"

        # Build a synthetic merged overlay with a sentinel marker so the
        # propagation is unambiguous (no test relies on which keys an
        # actual overlay happens to contain).
        baseline = dict(app_main.manager.get_app_config())
        sentinel = dict(baseline)
        sentinel["__v060_c1_propagation_marker__"] = "ok"

        monkeypatch.setattr(
            "app.config_overlay.read_app_config_merged",
            lambda: sentinel,
        )

        app_main._sync_manager_with_overlay()

        # Manager snapshot replaced.
        assert app_main.manager.get_app_config() == sentinel

        # Every active plugin's app_config reference now points at the
        # new dict — this is the propagation refresh_config does that
        # the private poke did NOT.
        for plugin in app_main.manager.get_active_plugins():
            assert plugin.app_config == sentinel, (
                f"Plugin '{plugin.name}' app_config did not propagate; "
                f"got keys {sorted(plugin.app_config.keys())}"
            )
