"""PluginForge - Application-independent plugin framework built on pluggy."""

from .base import BasePlugin
from .config import ConfigLoader
from .licensing import LicenseError, LicensePayload, LicenseStore, LicenseValidator
from .manager import PluginManager

__version__ = "0.1.0"
__all__ = [
    "BasePlugin",
    "ConfigLoader",
    "LicenseError",
    "LicensePayload",
    "LicenseStore",
    "LicenseValidator",
    "PluginManager",
]
