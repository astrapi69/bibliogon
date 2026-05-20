"""Smoke tests for the comics plugin scaffolding (Session 1).

These tests pin the plugin's contract at the Session 1 boundary:
- Class attributes (name, version, api_version, license_tier, depends_on)
- ``init`` + ``activate`` lifecycle without configuration crashes
- ``get_routes`` returns an empty list (no routes ship in Session 1)
- ``get_frontend_manifest`` returns a stable minimal manifest

Session 2 will extend these with route-presence + manifest-slot
assertions; the regression-pin shape is set up here so future
sessions cannot silently regress the contract.
"""

from bibliogon_comics.plugin import ComicsPlugin


class TestComicsPluginContract:
    """Class-attribute contract (Session 1)."""

    def test_name(self) -> None:
        assert ComicsPlugin.name == "comics"

    def test_api_version(self) -> None:
        assert ComicsPlugin.api_version == "1"

    def test_license_tier(self) -> None:
        # All plugins are core during the current free-development phase.
        assert ComicsPlugin.license_tier == "core"

    def test_depends_on_export(self) -> None:
        # plugin-comics needs the export pipeline for PDF/EPUB output
        # (Session 2+). The dependency is wired from day one so the
        # plugin manager activates them in the correct order.
        assert ComicsPlugin.depends_on == ["export"]


class TestComicsPluginLifecycle:
    """Plugin lifecycle: init -> activate -> get_routes / get_frontend_manifest."""

    def _make_plugin(self, plugin_config: dict | None = None) -> ComicsPlugin:
        plugin = ComicsPlugin()
        plugin.init(app_config={}, plugin_config=plugin_config or {})
        plugin.activate()
        return plugin

    def test_activate_with_empty_config(self) -> None:
        plugin = self._make_plugin({})
        assert plugin.settings == {}

    def test_activate_with_settings_block(self) -> None:
        plugin = self._make_plugin({"settings": {"reading_direction": "ltr"}})
        assert plugin.settings == {"reading_direction": "ltr"}

    def test_get_routes_is_callable(self) -> None:
        # Session 2: ``get_routes()`` now loads three routers that
        # depend on sqlalchemy + app.models, which the per-plugin
        # isolated venv intentionally does not install. The
        # integration-level "does this actually mount?" assertion
        # lives in the backend pytest tier (test_comic_routes.py)
        # where the full app + DB layer is available. Here we just
        # assert the method exists + the docstring documents the
        # Session 2 expansion, so a future Session-3 refactor that
        # silently removes get_routes is caught.
        plugin = self._make_plugin()
        assert callable(plugin.get_routes)
        assert plugin.get_routes.__doc__ is not None
        # Sanity: importing the info router (no DB deps) still
        # works for the Session-1 contract that was originally
        # pinned here. Session 2 moved the ``/comics`` prefix from
        # the router level onto the individual endpoint path so
        # the same router can host both ``/comics/info`` AND (via
        # include_router) the Session-2 panel + bubble sub-routers
        # that use a different ``/books`` prefix. Single-router
        # registration per plugin keeps lifespan registration
        # depth low (long test sweeps were hitting Python's
        # default recursion limit with 3 routers per plugin).
        from bibliogon_comics.routes import router as info_router

        endpoint_paths = [getattr(r, "path", "") for r in info_router.routes]
        assert "/comics/info" in endpoint_paths

    def test_get_frontend_manifest_is_minimal(self) -> None:
        plugin = self._make_plugin({"settings": {}})
        manifest = plugin.get_frontend_manifest()
        assert manifest is not None
        assert manifest == {"settings": {}}

    def test_get_frontend_manifest_exposes_settings(self) -> None:
        plugin = self._make_plugin({"settings": {"reading_direction": "rtl"}})
        manifest = plugin.get_frontend_manifest()
        assert manifest == {"settings": {"reading_direction": "rtl"}}


class TestComicsPluginEntryPoint:
    """Entry-point registration via importlib.metadata.

    Pins the plugin's registration shape so the backend's plugin
    manager can discover the plugin without an explicit import.
    """

    def test_entry_point_registered(self) -> None:
        from importlib.metadata import entry_points

        comics_entries = [
            ep
            for ep in entry_points(group="bibliogon.plugins")
            if ep.name == "comics"
        ]
        assert len(comics_entries) == 1, (
            f"Expected exactly one 'comics' entry point, got "
            f"{[ep.value for ep in comics_entries]}"
        )
        assert comics_entries[0].value == "bibliogon_comics.plugin:ComicsPlugin"

    def test_entry_point_loads_to_class(self) -> None:
        from importlib.metadata import entry_points

        comics_entries = list(entry_points(group="bibliogon.plugins"))
        comics_ep = next(ep for ep in comics_entries if ep.name == "comics")
        loaded = comics_ep.load()
        assert loaded is ComicsPlugin
