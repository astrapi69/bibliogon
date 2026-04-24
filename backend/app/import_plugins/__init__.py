"""Plugin-based import system for Bibliogon.

Defines the contract every import format handler implements
(see :mod:`app.import_plugins.protocol`) and a registry for
discovering handlers at runtime
(see :mod:`app.import_plugins.registry`).

Scope: backend foundation only. Handlers for ``.bgb`` and single
Markdown files ship alongside this module; other formats
(write-book-template ZIPs, git URLs, office formats) arrive via
pluggy-discovered plugins in later phases. See
``docs/explorations/core-import-orchestrator.md``.
"""

from app.import_plugins.protocol import (
    DetectedAsset,
    DetectedChapter,
    DetectedProject,
    ImportPlugin,
)
from app.import_plugins.registry import (
    RemoteSourceHandler,
    find_handler,
    find_remote_handler,
    list_plugins,
    list_remote_handlers,
    register,
    register_remote_handler,
)

__all__ = [
    "DetectedAsset",
    "DetectedChapter",
    "DetectedProject",
    "ImportPlugin",
    "RemoteSourceHandler",
    "find_handler",
    "find_remote_handler",
    "list_plugins",
    "list_remote_handlers",
    "register",
    "register_remote_handler",
]
