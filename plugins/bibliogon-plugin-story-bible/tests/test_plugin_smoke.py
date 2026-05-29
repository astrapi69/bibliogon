"""Smoke tests for the Story Bible plugin scaffolding (Session 1).

These pin the plugin's contract at the Session 1 boundary:
- Class attributes (name, version, api_version, license_tier, depends_on)
- ``init`` + ``activate`` lifecycle without configuration crashes
- ``get_routes`` returns the single info router carrying ``/story-bible/info``
- ``get_frontend_manifest`` returns a stable minimal manifest
- entry-point registration shape

Session 2 extends these with entity-CRUD route-presence assertions;
the regression-pin shape is set up here so later sessions cannot
silently regress the contract.
"""

from bibliogon_story_bible.plugin import StoryBiblePlugin


class TestStoryBiblePluginContract:
    """Class-attribute contract (Session 1)."""

    def test_name(self) -> None:
        assert StoryBiblePlugin.name == "story-bible"

    def test_api_version(self) -> None:
        assert StoryBiblePlugin.api_version == "1"

    def test_license_tier(self) -> None:
        # All plugins are core during the current free-development phase.
        assert StoryBiblePlugin.license_tier == "core"

    def test_depends_on_is_empty(self) -> None:
        # The Story Bible has no backend plugin dependency: its CRUD
        # uses only core models. The @-mention feature (Session 4) is
        # a frontend-only concern.
        assert StoryBiblePlugin.depends_on == []


class TestStoryBiblePluginLifecycle:
    """Plugin lifecycle: init -> activate -> get_routes / manifest."""

    def _make_plugin(self, plugin_config: dict | None = None) -> StoryBiblePlugin:
        plugin = StoryBiblePlugin()
        plugin.init(app_config={}, plugin_config=plugin_config or {})
        plugin.activate()
        return plugin

    def test_activate_with_empty_config(self) -> None:
        plugin = self._make_plugin({})
        assert plugin.settings == {}

    def test_activate_with_settings_block(self) -> None:
        plugin = self._make_plugin({"settings": {"default_sort": "name"}})
        assert plugin.settings == {"default_sort": "name"}

    def test_get_routes_exposes_info_endpoint(self) -> None:
        plugin = self._make_plugin()
        routers = plugin.get_routes()
        assert len(routers) == 1
        endpoint_paths = [getattr(r, "path", "") for r in routers[0].routes]
        assert "/story-bible/info" in endpoint_paths

    def test_get_frontend_manifest_is_minimal(self) -> None:
        plugin = self._make_plugin({"settings": {}})
        manifest = plugin.get_frontend_manifest()
        assert manifest is not None
        assert manifest == {"settings": {}}

    def test_get_frontend_manifest_exposes_settings(self) -> None:
        plugin = self._make_plugin({"settings": {"default_sort": "created"}})
        manifest = plugin.get_frontend_manifest()
        assert manifest == {"settings": {"default_sort": "created"}}


class TestStoryBiblePluginEntryPoint:
    """Entry-point registration via importlib.metadata.

    Pins the plugin's registration shape so the backend's plugin
    manager can discover the plugin without an explicit import.
    """

    def test_entry_point_registered(self) -> None:
        from importlib.metadata import entry_points

        entries = [ep for ep in entry_points(group="bibliogon.plugins") if ep.name == "story-bible"]
        assert len(entries) == 1, (
            f"Expected exactly one 'story-bible' entry point, got {[ep.value for ep in entries]}"
        )
        assert entries[0].value == "bibliogon_story_bible.plugin:StoryBiblePlugin"

    def test_entry_point_loads_to_class(self) -> None:
        from importlib.metadata import entry_points

        entries = list(entry_points(group="bibliogon.plugins"))
        story_ep = next(ep for ep in entries if ep.name == "story-bible")
        assert story_ep.load() is StoryBiblePlugin
