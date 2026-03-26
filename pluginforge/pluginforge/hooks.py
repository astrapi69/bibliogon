"""Central hook registry for plugin communication."""

from typing import Any, Callable


class HookRegistry:
    """Central registry for all hooks.

    Supports three calling patterns:
    - call: invoke all handlers, collect results
    - call_first: invoke handlers until one returns a non-None result
    - call_pipeline: pass a value through handlers in sequence
    """

    def __init__(self) -> None:
        self._hooks: dict[str, list[Callable[..., Any]]] = {}

    def register(self, hook_name: str, handler: Callable[..., Any]) -> None:
        """Register a handler for a hook."""
        self._hooks.setdefault(hook_name, []).append(handler)

    def unregister(self, hook_name: str, handler: Callable[..., Any]) -> None:
        """Remove a handler from a hook."""
        if hook_name in self._hooks:
            try:
                self._hooks[hook_name].remove(handler)
            except ValueError:
                pass
            if not self._hooks[hook_name]:
                del self._hooks[hook_name]

    def has_handlers(self, hook_name: str) -> bool:
        """Check if a hook has any registered handlers."""
        return bool(self._hooks.get(hook_name))

    def get_hook_names(self) -> list[str]:
        """Return all hook names that have registered handlers."""
        return list(self._hooks.keys())

    def call(self, hook_name: str, **kwargs: Any) -> list[Any]:
        """Call all handlers for a hook, return list of non-None results."""
        results: list[Any] = []
        for handler in self._hooks.get(hook_name, []):
            result = handler(**kwargs)
            if result is not None:
                results.append(result)
        return results

    def call_first(self, hook_name: str, **kwargs: Any) -> Any | None:
        """Call handlers until one returns a non-None result."""
        for handler in self._hooks.get(hook_name, []):
            result = handler(**kwargs)
            if result is not None:
                return result
        return None

    def call_pipeline(self, hook_name: str, value: Any, **kwargs: Any) -> Any:
        """Pass value through handlers in sequence (each transforms it)."""
        for handler in self._hooks.get(hook_name, []):
            value = handler(value=value, **kwargs)
        return value
