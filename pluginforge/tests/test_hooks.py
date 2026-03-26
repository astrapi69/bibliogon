"""Tests for HookRegistry."""

from pluginforge.hooks import HookRegistry


class TestHookRegistry:

    def test_register_and_call(self) -> None:
        registry = HookRegistry()

        def handler(name: str) -> str:
            return f"hello {name}"

        registry.register("greet", handler)
        results = registry.call("greet", name="world")
        assert results == ["hello world"]

    def test_call_multiple_handlers(self) -> None:
        registry = HookRegistry()
        registry.register("hook", lambda: "a")
        registry.register("hook", lambda: "b")

        results = registry.call("hook")
        assert results == ["a", "b"]

    def test_call_skips_none_results(self) -> None:
        registry = HookRegistry()
        registry.register("hook", lambda: None)
        registry.register("hook", lambda: "value")

        results = registry.call("hook")
        assert results == ["value"]

    def test_call_unknown_hook_returns_empty(self) -> None:
        registry = HookRegistry()
        assert registry.call("nonexistent") == []

    def test_call_first(self) -> None:
        registry = HookRegistry()
        registry.register("hook", lambda: None)
        registry.register("hook", lambda: "first")
        registry.register("hook", lambda: "second")

        result = registry.call_first("hook")
        assert result == "first"

    def test_call_first_all_none(self) -> None:
        registry = HookRegistry()
        registry.register("hook", lambda: None)
        assert registry.call_first("hook") is None

    def test_call_pipeline(self) -> None:
        registry = HookRegistry()
        registry.register("transform", lambda value: value + 1)
        registry.register("transform", lambda value: value * 2)

        result = registry.call_pipeline("transform", value=5)
        assert result == 12  # (5 + 1) * 2

    def test_call_pipeline_with_kwargs(self) -> None:
        registry = HookRegistry()
        registry.register("transform", lambda value, prefix: f"{prefix}_{value}")

        result = registry.call_pipeline("transform", value="data", prefix="pre")
        assert result == "pre_data"

    def test_unregister(self) -> None:
        registry = HookRegistry()

        def handler() -> str:
            return "value"

        registry.register("hook", handler)
        assert registry.has_handlers("hook")

        registry.unregister("hook", handler)
        assert not registry.has_handlers("hook")

    def test_unregister_nonexistent_handler(self) -> None:
        registry = HookRegistry()
        registry.register("hook", lambda: "a")
        registry.unregister("hook", lambda: "b")  # different lambda, no error
        assert registry.has_handlers("hook")

    def test_has_handlers(self) -> None:
        registry = HookRegistry()
        assert not registry.has_handlers("hook")
        registry.register("hook", lambda: None)
        assert registry.has_handlers("hook")

    def test_get_hook_names(self) -> None:
        registry = HookRegistry()
        registry.register("a", lambda: None)
        registry.register("b", lambda: None)
        assert sorted(registry.get_hook_names()) == ["a", "b"]
