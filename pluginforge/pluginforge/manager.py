"""Plugin manager wrapping pluggy with config, lifecycle, and dependency resolution."""

import logging
from pathlib import Path
from typing import Any

import pluggy

from .base import BasePlugin
from .config import ConfigLoader
from .licensing import LicenseError, LicenseStore, LicenseValidator

logger = logging.getLogger(__name__)


class PluginManager:
    """Manages plugin lifecycle, config, and hook dispatch via pluggy."""

    def __init__(
        self,
        app_config_path: str | Path = "config/app.yaml",
        base_dir: str | Path = ".",
    ) -> None:
        self.base_dir = Path(base_dir)
        self.config_loader = ConfigLoader(base_dir=self.base_dir)
        self.app_config = self.config_loader.load(app_config_path)
        self.plugins: dict[str, BasePlugin] = {}
        self._i18n: dict[str, dict[str, Any]] = {}

        group = self._plugin_settings.get("entry_point_group", "")
        self.pm = pluggy.PluginManager(group) if group else pluggy.PluginManager("pluginforge")

        # Licensing
        license_secret = self.app_config.get("licensing", {}).get("secret_key", "pluginforge-default-key")
        license_file = self.app_config.get("licensing", {}).get("store_path", "config/licenses.json")
        self.license_validator = LicenseValidator(license_secret)
        self.license_store = LicenseStore(self.base_dir / license_file)

    @property
    def hook(self) -> Any:
        """Access pluggy hook caller for calling hooks."""
        return self.pm.hook

    @property
    def _plugin_settings(self) -> dict[str, Any]:
        return self.app_config.get("plugins", {})

    @property
    def _config_dir(self) -> str:
        return self._plugin_settings.get("config_dir", "config/plugins")

    @property
    def _enabled(self) -> set[str]:
        return set(self._plugin_settings.get("enabled", []))

    @property
    def _disabled(self) -> set[str]:
        return set(self._plugin_settings.get("disabled", []))

    def load_hookspecs(self, spec_module: Any) -> None:
        """Register hook specifications from the application."""
        self.pm.add_hookspecs(spec_module)

    def discover(self) -> list[str]:
        """Find all available plugins via entry points without loading them."""
        import importlib.metadata
        group = self._plugin_settings.get("entry_point_group", "")
        if not group:
            return []
        return [ep.name for ep in importlib.metadata.entry_points(group=group)]

    def discover_and_load(self) -> None:
        """Discover, configure, and activate all enabled plugins."""
        group = self._plugin_settings.get("entry_point_group", "")
        if not group:
            logger.warning("No entry_point_group configured, skipping plugin discovery")
            return

        enabled = self._enabled
        disabled = self._disabled
        config_dir = self._config_dir

        self.pm.load_setuptools_entrypoints(group)

        for plugin_obj in list(self.pm.get_plugins()):
            name = self._get_plugin_name(plugin_obj)
            if not name:
                continue

            if name in disabled:
                logger.debug("Plugin '%s' is disabled, skipping", name)
                self.pm.unregister(plugin_obj)
                continue
            if enabled and name not in enabled:
                logger.debug("Plugin '%s' is not in enabled list, skipping", name)
                self.pm.unregister(plugin_obj)
                continue

            # pluggy may register the class itself rather than an instance.
            # If so, unregister the class and re-register a proper instance.
            if isinstance(plugin_obj, type):
                self.pm.unregister(plugin_obj)
                plugin_obj = plugin_obj()
                self.pm.register(plugin_obj, name=name)

            plugin_config = self.config_loader.load_plugin_config(name, config_dir)

            self._check_dependencies(name, plugin_config)
            self._check_license(name, plugin_config)

            if hasattr(plugin_obj, "init"):
                plugin_obj.init(self.app_config, plugin_config)
            if hasattr(plugin_obj, "activate"):
                plugin_obj.activate()

            self.plugins[name] = plugin_obj
            logger.info("Plugin '%s' loaded and activated", name)

    def register_plugin(
        self, plugin: BasePlugin, plugin_config: dict[str, Any] | None = None
    ) -> None:
        """Manually register and activate a plugin instance.

        Useful for testing or programmatic registration without entry points.
        """
        if plugin.name in self.plugins:
            raise ValueError(f"Plugin '{plugin.name}' is already registered")

        config = plugin_config if plugin_config is not None else (
            self.config_loader.load_plugin_config(plugin.name, self._config_dir)
        )

        self._check_dependencies(plugin.name, config)
        self._check_license(plugin.name, config)
        plugin.init(self.app_config, config)
        plugin.activate()
        self.pm.register(plugin, name=plugin.name)
        self.plugins[plugin.name] = plugin
        logger.info("Plugin '%s' v%s registered and activated", plugin.name, plugin.version)

    def unload(self, name: str) -> None:
        """Deactivate and remove a plugin."""
        if name not in self.plugins:
            raise ValueError(f"Plugin '{name}' is not loaded")

        plugin = self.plugins[name]
        if hasattr(plugin, "deactivate"):
            plugin.deactivate()
        self.pm.unregister(plugin)
        del self.plugins[name]
        logger.info("Plugin '%s' unloaded", name)

    def get_all_routes(self) -> list[Any]:
        """Collect FastAPI routers from all active plugins."""
        routes: list[Any] = []
        for plugin in self.plugins.values():
            if hasattr(plugin, "get_routes"):
                routes.extend(plugin.get_routes())
        return routes

    def get_all_frontend_manifests(self) -> dict[str, Any]:
        """Collect frontend UI manifests from all active plugins."""
        manifests: dict[str, Any] = {}
        for name, plugin in self.plugins.items():
            if hasattr(plugin, "get_frontend_manifest"):
                manifest = plugin.get_frontend_manifest()
                if manifest:
                    manifests[name] = manifest
        return manifests

    def load_i18n(self, lang: str) -> dict[str, Any]:
        """Load i18n strings for a language, with caching."""
        if lang in self._i18n:
            return self._i18n[lang]
        i18n_dir = self.app_config.get("app", {}).get("i18n_dir", "config/i18n")
        strings = self.config_loader.load_i18n(lang, i18n_dir)
        self._i18n[lang] = strings
        return strings

    def _check_license(self, name: str, plugin_config: dict[str, Any]) -> None:
        """Check if a premium plugin has a valid license."""
        license_type = plugin_config.get("plugin", {}).get("license", "MIT")
        if license_type.upper() == "MIT" or license_type.lower() == "free":
            return  # free plugin, no license needed

        license_key = self.license_store.get(name)
        if not license_key:
            raise LicenseError(
                f"Plugin '{name}' requires a license. "
                f"Add a license key via the license management API."
            )

        self.license_validator.validate_license(license_key, name)
        logger.info("Plugin '%s' license validated", name)

    def _check_dependencies(self, name: str, plugin_config: dict[str, Any]) -> None:
        """Verify that all declared plugin dependencies are available."""
        depends = plugin_config.get("plugin", {}).get("depends_on", [])
        enabled = self._enabled
        for dep in depends:
            if dep not in enabled and dep not in self.plugins:
                raise RuntimeError(
                    f"Plugin '{name}' requires '{dep}' which is not enabled"
                )

    @staticmethod
    def _get_plugin_name(plugin_obj: Any) -> str | None:
        """Extract plugin name from a plugin object."""
        if hasattr(plugin_obj, "name"):
            return plugin_obj.name
        name = getattr(plugin_obj, "__name__", None)
        if name:
            return name
        return type(plugin_obj).__name__
