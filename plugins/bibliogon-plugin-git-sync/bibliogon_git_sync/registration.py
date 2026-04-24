"""Wire the plugin's handlers into the core import registry.

Kept in a dedicated module so ``plugin.py`` stays small and the
registration path is easy to spot when reading the plugin. The
import of ``app.import_plugins`` is deferred to call time so the
plugin module can be imported during tests that do not load the
full Bibliogon backend.
"""

from __future__ import annotations


def register_git_handler(handler: object) -> None:
    from app.import_plugins import register_remote_handler

    register_remote_handler(handler)  # type: ignore[arg-type]
