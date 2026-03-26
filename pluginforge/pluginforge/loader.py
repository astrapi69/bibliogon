"""Plugin discovery and loading via Python entry points."""

import importlib.metadata
import logging
from pathlib import Path
from typing import Any

from .base import BasePlugin
from .config import ConfigLoader
from .hooks import HookRegistry

logger = logging.getLogger(__name__)


class PluginLoader:
    """Discovers, loads, and manages plugins.

    Plugins are discovered via Python entry points and configured through YAML files.
    """

    def __init__(
        self,
        app_config_path: str | Path = "config/app.yaml",
        base_dir: str | Path = ".",
    ) -> None:
        self.base_dir = Path(base_dir)
        self.config_loader = ConfigLoader(base_dir=self.base_dir)
        self.app_config = self.config_loader.load(app_config_path)
        self.registry = HookRegistry()
        self.plugins: dict[str, BasePlugin] = {}

    @property
    def _plugin_settings(self) -> dict[str, Any]:
        """Get the plugins section from app config."""
        return self.app_config.get("plugins", {})

    @property
    def _entry_point_group(self) -> str:
        """Get the entry point group name."""
        return self._plugin_settings.get("entry_point_group", "")

    @property
    def _config_dir(self) -> str:
        """Get the plugin config directory."""
        return self._plugin_settings.get("config_dir", "config/plugins")

    @property
    def _enabled(self) -> set[str]:
        """Get explicitly enabled plugin names."""
        return set(self._plugin_settings.get("enabled", []))

    @property
    def _disabled(self) -> set[str]:
        """Get explicitly disabled plugin names."""
        return set(self._plugin_settings.get("disabled", []))

    def discover(self) -> list[str]:
        """Find all available plugins via entry points."""
        group = self._entry_point_group
        if not group:
            return []
        return [ep.name for ep in importlib.metadata.entry_points(group=group)]

    def load_all(self) -> None:
        """Load and activate all enabled plugins."""
        group = self._entry_point_group
        if not group:
            logger.warning("No entry_point_group configured, skipping plugin discovery")
            return

        enabled = self._enabled
        disabled = self._disabled

        for ep in importlib.metadata.entry_points(group=group):
            if ep.name in disabled:
                logger.debug("Plugin '%s' is disabled, skipping", ep.name)
                continue
            if enabled and ep.name not in enabled:
                logger.debug("Plugin '%s' is not in enabled list, skipping", ep.name)
                continue

            try:
                self._load_plugin(ep)
            except Exception:
                logger.exception("Failed to load plugin '%s'", ep.name)

    def load_plugin(self, name: str) -> None:
        """Load a single plugin by name from entry points."""
        group = self._entry_point_group
        for ep in importlib.metadata.entry_points(group=group):
            if ep.name == name:
                self._load_plugin(ep)
                return
        raise ValueError(f"Plugin '{name}' not found in entry point group '{group}'")

    def register_plugin(self, plugin: BasePlugin, plugin_config: dict[str, Any] | None = None) -> None:
        """Manually register and activate a plugin instance.

        Useful for testing or programmatic plugin registration without entry points.
        """
        if plugin.name in self.plugins:
            raise ValueError(f"Plugin '{plugin.name}' is already registered")

        config = plugin_config or self.config_loader.load_plugin_config(
            plugin.name, self._config_dir
        )
        plugin.init(self.app_config, config)
        plugin.activate()

        for hook_name, handler in plugin.get_hooks().items():
            self.registry.register(hook_name, handler)

        self.plugins[plugin.name] = plugin
        logger.info("Plugin '%s' v%s registered and activated", plugin.name, plugin.version)

    def unload(self, name: str) -> None:
        """Deactivate and remove a plugin."""
        if name not in self.plugins:
            raise ValueError(f"Plugin '{name}' is not loaded")

        plugin = self.plugins[name]
        for hook_name, handler in plugin.get_hooks().items():
            self.registry.unregister(hook_name, handler)
        plugin.deactivate()
        del self.plugins[name]
        logger.info("Plugin '%s' unloaded", name)

    def _load_plugin(self, ep: importlib.metadata.EntryPoint) -> None:
        """Load, initialize, and activate a plugin from an entry point."""
        plugin_class = ep.load()
        if not (isinstance(plugin_class, type) and issubclass(plugin_class, BasePlugin)):
            raise TypeError(
                f"Entry point '{ep.name}' does not point to a BasePlugin subclass"
            )

        plugin = plugin_class()
        plugin_config = self.config_loader.load_plugin_config(plugin.name, self._config_dir)
        plugin.init(self.app_config, plugin_config)
        plugin.activate()

        for hook_name, handler in plugin.get_hooks().items():
            self.registry.register(hook_name, handler)

        self.plugins[ep.name] = plugin
        logger.info("Plugin '%s' v%s loaded and activated", plugin.name, plugin.version)
