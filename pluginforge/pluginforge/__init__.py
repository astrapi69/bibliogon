"""PluginForge - Application-independent plugin framework for Python."""

from .base import BasePlugin
from .config import ConfigLoader
from .hooks import HookRegistry
from .loader import PluginLoader

__version__ = "0.1.0"
__all__ = ["BasePlugin", "ConfigLoader", "HookRegistry", "PluginLoader"]
