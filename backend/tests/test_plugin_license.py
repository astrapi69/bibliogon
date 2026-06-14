"""Unit tests for the plugin license logic extracted in God-file split #4.

These exercise the functions in isolation (DI passed as fakes), which is
the point of moving them out of routers/settings.py: no TestClient, no
module globals, just the branching logic.
"""

from app.services.plugin_license import check_plugin_license, resolve_license_tier


class _Store:
    def __init__(self, keys: dict[str, str]):
        self._keys = keys

    def get(self, name: str) -> str | None:
        return self._keys.get(name)


class _Validator:
    def __init__(self, valid: set[tuple[str, str]]):
        self._valid = valid

    def validate_license(self, key: str, name: str) -> None:
        if (key, name) not in self._valid:
            raise ValueError("invalid")


def test_resolve_tier_explicit_wins():
    assert resolve_license_tier({"plugin": {"license_tier": "premium"}}) == "premium"
    assert resolve_license_tier({"plugin": {"license_tier": "core"}}) == "core"


def test_resolve_tier_falls_back_to_license_field():
    assert resolve_license_tier({"plugin": {"license": "MIT"}}) == "core"
    assert resolve_license_tier({"plugin": {"license": "Free"}}) == "core"
    assert resolve_license_tier({"plugin": {"license": "Commercial"}}) == "premium"


def test_resolve_tier_defaults_core_when_meta_missing():
    assert resolve_license_tier({}) == "core"
    assert resolve_license_tier({"plugin": "not-a-dict"}) == "core"


def test_check_license_core_always_true():
    assert check_plugin_license("p", "core", None, None) is True


def test_check_license_premium_without_store_is_false():
    assert check_plugin_license("p", "premium", None, None) is False


def test_check_license_premium_with_valid_key():
    store = _Store({"p": "KEY"})
    validator = _Validator({("KEY", "p")})
    assert check_plugin_license("p", "premium", store, validator) is True


def test_check_license_premium_missing_key_is_false():
    store = _Store({})
    validator = _Validator(set())
    assert check_plugin_license("p", "premium", store, validator) is False


def test_check_license_falls_back_to_wildcard_key():
    store = _Store({"*": "WILD"})
    validator = _Validator({("WILD", "*")})
    assert check_plugin_license("p", "premium", store, validator) is True


def test_check_license_invalid_named_key_no_wildcard_is_false():
    store = _Store({"p": "BAD"})
    validator = _Validator(set())
    assert check_plugin_license("p", "premium", store, validator) is False
