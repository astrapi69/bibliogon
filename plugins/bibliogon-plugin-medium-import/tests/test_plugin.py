"""Smoke tests for the Medium-import plugin entry point."""

from __future__ import annotations

from bibliogon_medium_import.plugin import MediumImportPlugin
from bibliogon_medium_import.routes import router


def _make_plugin(plugin_config: dict | None = None) -> MediumImportPlugin:
    """Construct + init a MediumImportPlugin the way PluginForge does.

    BasePlugin uses ``init(app_config, plugin_config)`` to populate
    ``self.config``; the constructor takes no args.
    """
    plugin = MediumImportPlugin()
    plugin.init({}, plugin_config or {})
    return plugin


def test_plugin_metadata() -> None:
    plugin = _make_plugin()
    assert plugin.name == "medium-import"
    assert plugin.version == "1.0.0"
    assert plugin.api_version == "1"
    assert plugin.license_tier == "core"
    assert plugin.depends_on == []


def test_plugin_activate_initializes_settings() -> None:
    plugin = _make_plugin({"settings": {"download_images": False}})
    plugin.activate()
    assert plugin._settings == {"download_images": False}


def test_plugin_get_routes_returns_router() -> None:
    plugin = _make_plugin()
    plugin.activate()
    routes = plugin.get_routes()
    assert routes == [router]


def test_plugin_frontend_manifest_has_settings_section() -> None:
    plugin = _make_plugin()
    plugin.activate()
    manifest = plugin.get_frontend_manifest()
    assert manifest is not None
    assert manifest["settings_section"]["id"] == "medium-import"
    assert "de" in manifest["settings_section"]["label"]
    assert "en" in manifest["settings_section"]["label"]


def test_health_endpoint_signature() -> None:
    """The health route should be registered under /medium-import."""
    paths = [route.path for route in router.routes]
    assert "/medium-import/health" in paths
