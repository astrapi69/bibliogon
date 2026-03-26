"""Tests for PluginLoader."""

from pathlib import Path
from typing import Any, Callable

from pluginforge.base import BasePlugin
from pluginforge.loader import PluginLoader


class GreetPlugin(BasePlugin):
    name = "greet"
    version = "1.0.0"

    def get_hooks(self) -> dict[str, Callable[..., Any]]:
        return {
            "greet.hello": self._hello,
            "greet.formats": self._formats,
        }

    def _hello(self, name: str = "world") -> str:
        return f"Hello {name} from {self.config.get('greeting', 'GreetPlugin')}"

    def _formats(self) -> list[str]:
        return self.config.get("formats", ["text"])


class MathPlugin(BasePlugin):
    name = "math"
    version = "0.5.0"

    def get_hooks(self) -> dict[str, Callable[..., Any]]:
        return {
            "math.transform": self._transform,
        }

    def _transform(self, value: int = 0) -> int:
        factor = self.config.get("settings", {}).get("factor", 2)
        return value * factor


class TestPluginLoader:

    def _create_loader(self, tmp_path: Path) -> PluginLoader:
        """Create a loader with minimal app config."""
        config_dir = tmp_path / "config"
        config_dir.mkdir(parents=True, exist_ok=True)
        plugins_dir = config_dir / "plugins"
        plugins_dir.mkdir(exist_ok=True)

        app_yaml = config_dir / "app.yaml"
        app_yaml.write_text(
            "app:\n"
            "  name: TestApp\n"
            "plugins:\n"
            "  entry_point_group: test.plugins\n"
            "  config_dir: config/plugins\n"
        )

        return PluginLoader(
            app_config_path="config/app.yaml",
            base_dir=tmp_path,
        )

    def test_register_plugin(self, tmp_path: Path) -> None:
        loader = self._create_loader(tmp_path)
        plugin = GreetPlugin()

        loader.register_plugin(plugin, {"greeting": "TestGreeting"})

        assert "greet" in loader.plugins
        assert loader.plugins["greet"].config == {"greeting": "TestGreeting"}

    def test_register_plugin_hooks_work(self, tmp_path: Path) -> None:
        loader = self._create_loader(tmp_path)
        plugin = GreetPlugin()
        loader.register_plugin(plugin, {"greeting": "Custom"})

        results = loader.registry.call("greet.hello", name="Alice")
        assert results == ["Hello Alice from Custom"]

    def test_register_multiple_plugins(self, tmp_path: Path) -> None:
        loader = self._create_loader(tmp_path)

        loader.register_plugin(GreetPlugin(), {"greeting": "Hi"})
        loader.register_plugin(MathPlugin(), {"settings": {"factor": 3}})

        assert len(loader.plugins) == 2

        greet_results = loader.registry.call("greet.hello", name="Bob")
        assert greet_results == ["Hello Bob from Hi"]

        math_result = loader.registry.call_first("math.transform", value=5)
        assert math_result == 15

    def test_unload_plugin(self, tmp_path: Path) -> None:
        loader = self._create_loader(tmp_path)
        plugin = GreetPlugin()
        loader.register_plugin(plugin, {})

        loader.unload("greet")

        assert "greet" not in loader.plugins
        assert not loader.registry.has_handlers("greet.hello")

    def test_unload_nonexistent_raises(self, tmp_path: Path) -> None:
        loader = self._create_loader(tmp_path)
        try:
            loader.unload("nonexistent")
            assert False, "Should have raised ValueError"
        except ValueError:
            pass

    def test_register_duplicate_raises(self, tmp_path: Path) -> None:
        loader = self._create_loader(tmp_path)
        loader.register_plugin(GreetPlugin(), {})
        try:
            loader.register_plugin(GreetPlugin(), {})
            assert False, "Should have raised ValueError"
        except ValueError:
            pass

    def test_pipeline_through_plugin_hooks(self, tmp_path: Path) -> None:
        loader = self._create_loader(tmp_path)
        loader.register_plugin(MathPlugin(), {"settings": {"factor": 10}})

        result = loader.registry.call_pipeline("math.transform", value=3)
        assert result == 30

    def test_plugin_reads_yaml_config(self, tmp_path: Path) -> None:
        """Test that plugins can load config from YAML files."""
        loader = self._create_loader(tmp_path)

        plugins_dir = tmp_path / "config" / "plugins"
        (plugins_dir / "greet.yaml").write_text(
            "greeting: FromYAML\nformats:\n  - html\n  - pdf\n"
        )

        plugin = GreetPlugin()
        loader.register_plugin(plugin)

        results = loader.registry.call("greet.hello", name="Test")
        assert results == ["Hello Test from FromYAML"]

        formats = loader.registry.call("greet.formats")
        assert formats == [["html", "pdf"]]

    def test_discover_returns_empty_without_group(self, tmp_path: Path) -> None:
        config_dir = tmp_path / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "app.yaml").write_text("app:\n  name: Test\n")

        loader = PluginLoader(app_config_path="config/app.yaml", base_dir=tmp_path)
        assert loader.discover() == []
