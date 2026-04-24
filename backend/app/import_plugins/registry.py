"""Runtime registry of import format handlers.

Handlers register themselves at import time (core handlers) or via
pluggy discovery (external plugins). The dispatch loop asks each
registered handler in priority order whether it can handle the
input; the first ``True`` wins.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol, runtime_checkable

from app.import_plugins.protocol import ImportPlugin

_registry: list[ImportPlugin] = []


@runtime_checkable
class RemoteSourceHandler(Protocol):
    """Clones or fetches a remote source (git URL, gist, etc.) into
    the orchestrator's staging directory.

    Separate from :class:`ImportPlugin` because URL inputs do not
    have a filesystem path at detect-time; the handler's job is to
    materialise one. Once staged, the orchestrator dispatches
    through ``find_handler()`` as usual to determine the content
    format (WBT, markdown folder, etc.).

    Phase 1 only ships a git variant (``plugin-git-sync``); the
    protocol is kept generic so a future "plugin-gist-import" or
    equivalent can plug in without a second registry.
    """

    source_kind: str  # e.g. "git"

    def can_handle(self, url: str) -> bool:
        """Return True when this handler recognises the URL shape."""
        ...

    def clone(self, url: str, target_dir: Path) -> Path:
        """Materialise the remote source into ``target_dir`` and
        return the path the orchestrator should dispatch through
        ``find_handler()``. Usually ``target_dir`` itself or a
        single subdirectory inside it."""
        ...


_remote_registry: list[RemoteSourceHandler] = []


def register(plugin: ImportPlugin) -> None:
    """Append a handler to the registry.

    Order of registration defines priority: first-registered wins on
    ambiguity. Core handlers register in ``handlers/__init__.py``;
    the priority config (``backend/config/import-priority.yaml``)
    will re-order registrations in a later phase.
    """
    _registry.append(plugin)


def list_plugins() -> list[ImportPlugin]:
    """Return a snapshot of the current registry."""
    return list(_registry)


def find_handler(input_path: str) -> ImportPlugin | None:
    """Return the first registered plugin that claims the input.

    Returns ``None`` when no plugin matches. Callers turn that into
    a 415 Unsupported Media Type.
    """
    for plugin in _registry:
        if plugin.can_handle(input_path):
            return plugin
    return None


def register_remote_handler(handler: RemoteSourceHandler) -> None:
    """Append a remote-source handler. Called by plugins on activate."""
    _remote_registry.append(handler)


def list_remote_handlers() -> list[RemoteSourceHandler]:
    return list(_remote_registry)


def find_remote_handler(url: str) -> RemoteSourceHandler | None:
    for handler in _remote_registry:
        if handler.can_handle(url):
            return handler
    return None


def _reset_for_tests() -> None:
    """Empty the registry. Test-only; do not call from runtime code."""
    _registry.clear()
    _remote_registry.clear()
