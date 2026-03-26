"""Tests for BasePlugin."""

from pluginforge.base import BasePlugin


class SamplePlugin(BasePlugin):
    name = "sample"
    version = "1.0.0"
    api_version = "1"

    def __init__(self) -> None:
        super().__init__()
        self.activated = False
        self.deactivated = False

    def activate(self) -> None:
        self.activated = True

    def deactivate(self) -> None:
        self.deactivated = True

    def get_routes(self) -> list:
        return ["/sample-route"]

    def get_frontend_manifest(self) -> dict:
        return {"component": "SamplePanel"}


class TestBasePlugin:

    def test_init_sets_config(self) -> None:
        plugin = SamplePlugin()
        app_cfg = {"app": {"name": "TestApp"}}
        plugin_cfg = {"setting": "value"}

        plugin.init(app_cfg, plugin_cfg)

        assert plugin.app_config == app_cfg
        assert plugin.config == plugin_cfg

    def test_lifecycle(self) -> None:
        plugin = SamplePlugin()
        assert not plugin.activated
        assert not plugin.deactivated

        plugin.activate()
        assert plugin.activated

        plugin.deactivate()
        assert plugin.deactivated

    def test_get_routes(self) -> None:
        plugin = SamplePlugin()
        assert plugin.get_routes() == ["/sample-route"]

    def test_get_frontend_manifest(self) -> None:
        plugin = SamplePlugin()
        assert plugin.get_frontend_manifest() == {"component": "SamplePanel"}

    def test_get_migrations_dir_default_none(self) -> None:
        plugin = SamplePlugin()
        assert plugin.get_migrations_dir() is None

    def test_default_methods_return_empty(self) -> None:
        class MinimalPlugin(BasePlugin):
            name = "minimal"

        plugin = MinimalPlugin()
        assert plugin.get_routes() == []
        assert plugin.get_frontend_manifest() is None
        assert plugin.get_migrations_dir() is None
