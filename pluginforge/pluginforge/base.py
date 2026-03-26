"""Base plugin class for all PluginForge plugins."""

from abc import ABC
from typing import Any, Callable


class BasePlugin(ABC):
    """Base class that all plugins must extend.

    Plugins follow a lifecycle: init -> activate -> deactivate.
    They register hook handlers to extend application behavior.
    """

    name: str
    version: str = "0.1.0"
    description: str = ""
    author: str = ""
    license: str = "MIT"

    def __init__(self) -> None:
        self.app_config: dict[str, Any] = {}
        self.config: dict[str, Any] = {}

    def init(self, app_config: dict[str, Any], plugin_config: dict[str, Any]) -> None:
        """Called when the plugin is loaded. Receives app and plugin config."""
        self.app_config = app_config
        self.config = plugin_config

    def activate(self) -> None:
        """Called when the plugin is activated. Override to set up resources."""

    def deactivate(self) -> None:
        """Called when the plugin is deactivated. Override to clean up resources."""

    def get_hooks(self) -> dict[str, Callable[..., Any]]:
        """Return a mapping of hook names to handler functions.

        Override this to register handlers for application hooks.
        """
        return {}
