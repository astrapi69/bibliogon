"""Tests for BasePlugin."""

from pluginforge.base import BasePlugin


class SamplePlugin(BasePlugin):
    name = "sample"
    version = "1.0.0"
    description = "A sample plugin for testing"

    def __init__(self) -> None:
        super().__init__()
        self.activated = False
        self.deactivated = False

    def activate(self) -> None:
        self.activated = True

    def deactivate(self) -> None:
        self.deactivated = True

    def get_hooks(self) -> dict:
        return {
            "test.hook": self._handle_test,
        }

    def _handle_test(self, value: str) -> str:
        return f"handled: {value}"


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

    def test_get_hooks(self) -> None:
        plugin = SamplePlugin()
        hooks = plugin.get_hooks()
        assert "test.hook" in hooks
        assert hooks["test.hook"]("hello") == "handled: hello"

    def test_default_get_hooks_is_empty(self) -> None:
        class MinimalPlugin(BasePlugin):
            name = "minimal"

        plugin = MinimalPlugin()
        assert plugin.get_hooks() == {}
