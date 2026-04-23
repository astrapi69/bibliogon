"""Runtime registry of import format handlers.

Handlers register themselves at import time (core handlers) or via
pluggy discovery (external plugins). The dispatch loop asks each
registered handler in priority order whether it can handle the
input; the first ``True`` wins.
"""

from __future__ import annotations

from app.import_plugins.protocol import ImportPlugin

_registry: list[ImportPlugin] = []


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


def _reset_for_tests() -> None:
    """Empty the registry. Test-only; do not call from runtime code."""
    _registry.clear()
