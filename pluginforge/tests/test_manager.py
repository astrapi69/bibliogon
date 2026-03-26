"""Tests for PluginManager."""

from pathlib import Path
from typing import Any

import pluggy
import pytest

from pluginforge.base import BasePlugin
from pluginforge.manager import PluginManager


# -- Test plugins --

class GreetPlugin(BasePlugin):
    name = "greet"
    version = "1.0.0"

    def greet_hello(self, name: str = "world") -> str:
        greeting = self.config.get("greeting", "Hello")
        return f"{greeting} {name}"


class MathPlugin(BasePlugin):
    name = "math"
    version = "0.5.0"

    def get_routes(self) -> list:
        return ["math-router"]

    def get_frontend_manifest(self) -> dict:
        return {"component": "Calculator"}


class DependentPlugin(BasePlugin):
    name = "dependent"
    version = "0.1.0"


# -- Helpers --

def _create_app_config(tmp_path: Path, extra: str = "") -> Path:
    config_dir = tmp_path / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "plugins").mkdir(exist_ok=True)
    (config_dir / "i18n").mkdir(exist_ok=True)

    app_yaml = config_dir / "app.yaml"
    app_yaml.write_text(
        "app:\n"
        "  name: TestApp\n"
        "plugins:\n"
        "  entry_point_group: test.plugins\n"
        "  config_dir: config/plugins\n"
        f"{extra}"
    )
    return Path("config/app.yaml")


def _make_manager(tmp_path: Path, extra: str = "") -> PluginManager:
    config_path = _create_app_config(tmp_path, extra)
    return PluginManager(app_config_path=config_path, base_dir=tmp_path)


# -- Tests --

class TestPluginManager:

    def test_register_plugin(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        plugin = GreetPlugin()
        manager.register_plugin(plugin, {"greeting": "Hi"})

        assert "greet" in manager.plugins
        assert manager.plugins["greet"].config == {"greeting": "Hi"}

    def test_register_plugin_activates(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)

        class TrackingPlugin(BasePlugin):
            name = "tracker"
            def __init__(self) -> None:
                super().__init__()
                self.activated = False
            def activate(self) -> None:
                self.activated = True

        plugin = TrackingPlugin()
        manager.register_plugin(plugin, {})
        assert plugin.activated

    def test_register_duplicate_raises(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        manager.register_plugin(GreetPlugin(), {})

        with pytest.raises(ValueError, match="already registered"):
            manager.register_plugin(GreetPlugin(), {})

    def test_unload_plugin(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        plugin = GreetPlugin()
        manager.register_plugin(plugin, {})

        manager.unload("greet")
        assert "greet" not in manager.plugins

    def test_unload_calls_deactivate(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)

        class TrackingPlugin(BasePlugin):
            name = "tracker"
            def __init__(self) -> None:
                super().__init__()
                self.deactivated = False
            def deactivate(self) -> None:
                self.deactivated = True

        plugin = TrackingPlugin()
        manager.register_plugin(plugin, {})
        manager.unload("tracker")
        assert plugin.deactivated

    def test_unload_nonexistent_raises(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        with pytest.raises(ValueError, match="not loaded"):
            manager.unload("nonexistent")

    def test_get_all_routes(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        manager.register_plugin(GreetPlugin(), {})
        manager.register_plugin(MathPlugin(), {})

        routes = manager.get_all_routes()
        assert routes == ["math-router"]

    def test_get_all_frontend_manifests(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        manager.register_plugin(GreetPlugin(), {})
        manager.register_plugin(MathPlugin(), {})

        manifests = manager.get_all_frontend_manifests()
        assert manifests == {"math": {"component": "Calculator"}}

    def test_load_i18n(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        i18n_dir = tmp_path / "config" / "i18n"
        (i18n_dir / "de.yaml").write_text("ui:\n  title: Hallo\n")

        strings = manager.load_i18n("de")
        assert strings["ui"]["title"] == "Hallo"

    def test_load_i18n_caches(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        i18n_dir = tmp_path / "config" / "i18n"
        (i18n_dir / "en.yaml").write_text("ui:\n  title: Hello\n")

        first = manager.load_i18n("en")
        second = manager.load_i18n("en")
        assert first is second

    def test_plugin_reads_yaml_config(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        plugins_dir = tmp_path / "config" / "plugins"
        (plugins_dir / "greet.yaml").write_text("greeting: Bonjour\n")

        plugin = GreetPlugin()
        manager.register_plugin(plugin)
        assert plugin.config == {"greeting": "Bonjour"}

    def test_check_dependencies_raises(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        plugins_dir = tmp_path / "config" / "plugins"
        (plugins_dir / "dependent.yaml").write_text(
            "plugin:\n  name: dependent\n  depends_on:\n    - missing_plugin\n"
        )

        with pytest.raises(RuntimeError, match="requires 'missing_plugin'"):
            manager.register_plugin(DependentPlugin())

    def test_discover_without_group_returns_empty(self, tmp_path: Path) -> None:
        config_dir = tmp_path / "config"
        config_dir.mkdir(parents=True)
        (config_dir / "app.yaml").write_text("app:\n  name: Test\n")

        manager = PluginManager(app_config_path="config/app.yaml", base_dir=tmp_path)
        # discover_and_load should not raise, just skip
        manager.discover_and_load()
        assert len(manager.plugins) == 0

    def test_hook_access(self, tmp_path: Path) -> None:
        manager = _make_manager(tmp_path)
        assert manager.hook is not None
