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


# ---------------------------------------------------------------------------
# MEDIUM-COMMENTS-IMPORT-01 commit 3+4: settings normalization
# ---------------------------------------------------------------------------


from bibliogon_medium_import.routes import (  # noqa: E402
    _normalize_comments_mode,
    _normalize_orphan_handling,
    _settings_kwargs,
    set_config,
)


def test_normalize_comments_mode_accepts_each_valid_value() -> None:
    assert _normalize_comments_mode("as_comments") == "as_comments"
    assert _normalize_comments_mode("as_articles") == "as_articles"
    assert _normalize_comments_mode("skip") == "skip"


def test_normalize_comments_mode_falls_back_to_default() -> None:
    """Unknown values / typos / wrong types fall back to the
    default ``as_comments`` rather than crashing or silently
    inheriting whatever YAML carried."""
    assert _normalize_comments_mode("invalid") == "as_comments"
    assert _normalize_comments_mode(None) == "as_comments"
    assert _normalize_comments_mode(42) == "as_comments"
    assert _normalize_comments_mode("") == "as_comments"


def test_normalize_orphan_handling_accepts_each_valid_value() -> None:
    assert _normalize_orphan_handling("store") == "store"
    assert _normalize_orphan_handling("skip") == "skip"


def test_normalize_orphan_handling_falls_back_to_default() -> None:
    assert _normalize_orphan_handling("invalid") == "store"
    assert _normalize_orphan_handling(None) == "store"
    assert _normalize_orphan_handling(True) == "store"


def test_settings_kwargs_threads_comment_kwargs_through() -> None:
    """The two new comment settings must reach ``_settings_kwargs``'
    output so ``import_zip`` receives them. Default missing-key
    behaviour returns the canonical defaults."""
    set_config({})
    kw = _settings_kwargs()
    assert kw["import_comments_mode"] == "as_comments"
    assert kw["orphan_comment_handling"] == "store"


def test_settings_kwargs_passes_custom_values_through() -> None:
    set_config(
        {
            "settings": {
                "import_comments_mode": "skip",
                "orphan_comment_handling": "skip",
            }
        }
    )
    kw = _settings_kwargs()
    assert kw["import_comments_mode"] == "skip"
    assert kw["orphan_comment_handling"] == "skip"
    set_config({})  # Reset the module-level state for sibling tests.
