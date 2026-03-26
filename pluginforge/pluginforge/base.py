"""Base plugin class for all PluginForge plugins."""

from abc import ABC
from typing import Any


class BasePlugin(ABC):
    """Base class that all plugins must extend.

    Plugins follow a lifecycle: init -> activate -> deactivate.
    They provide hook implementations, optional FastAPI routes,
    optional DB migrations, and optional frontend manifests.
    """

    name: str
    version: str = "0.1.0"
    api_version: str = "1"

    def __init__(self) -> None:
        self.app_config: dict[str, Any] = {}
        self.config: dict[str, Any] = {}

    def init(self, app_config: dict[str, Any], plugin_config: dict[str, Any]) -> None:
        """Called when the plugin is loaded. Receives app and plugin config."""
        self.app_config = app_config
        self.config = plugin_config

    def activate(self) -> None:
        """Called when the plugin is enabled. Override to set up resources."""

    def deactivate(self) -> None:
        """Called when the plugin is disabled. Override to clean up resources."""

    def get_routes(self) -> list[Any]:
        """Return FastAPI routers to mount. Optional."""
        return []

    def get_migrations_dir(self) -> str | None:
        """Return path to Alembic migration scripts. Optional."""
        return None

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        """Return manifest for frontend UI components. Optional."""
        return None
