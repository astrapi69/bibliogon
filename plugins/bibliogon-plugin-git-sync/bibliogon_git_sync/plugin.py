"""Plugin entry point for bibliogon-plugin-git-sync.

Registers a GitImportHandler with the core import orchestrator
so the wizard's git-URL input has a handler to dispatch to.
"""

from typing import Any

from pluginforge import BasePlugin


class GitSyncPlugin(BasePlugin):
    name = "git-sync"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"
    description = "Import books from write-book-template git repositories."

    def activate(self) -> None:
        # Import lazily so pytest collection does not force a
        # pluginforge->bibliogon-backend import chain when the
        # plugin module is loaded in isolation.
        from bibliogon_git_sync.handlers.git_handler import GitImportHandler

        from .registration import register_git_handler

        register_git_handler(GitImportHandler())

    def get_routes(self) -> list[Any]:
        from .routes import router

        return [router]
