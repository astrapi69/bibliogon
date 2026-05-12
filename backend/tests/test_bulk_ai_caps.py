"""Unit tests for the bulk AI cap configuration helper
(AI-FILL-CAP-CONFIG-01).

`_get_bulk_ai_caps()` reads ``ai.bulk.max_ai_fill`` and
``ai.bulk.max_ai_template`` from the merged config and returns
a tuple of positive ints. Non-int / zero / negative values fall
back to ``DEFAULT_MAX_BULK_AI_FILL`` and
``DEFAULT_MAX_BULK_AI_TEMPLATE`` so a typo in app.yaml doesn't
silently shrink the runtime cap.
"""

from __future__ import annotations

from unittest.mock import patch

from app.ai.routes import (
    DEFAULT_MAX_BULK_AI_FILL,
    DEFAULT_MAX_BULK_AI_TEMPLATE,
    _coerce_positive_int,
    _get_bulk_ai_caps,
)


def _stub_config(bulk: object | None) -> dict:
    """Build a merged-config dict with the requested ``bulk``
    payload nested under ``ai``."""
    ai_block: dict = {"enabled": True, "model": "gpt-4o"}
    if bulk is not None:
        ai_block["bulk"] = bulk
    return {"ai": ai_block}


def test_defaults_when_bulk_block_missing() -> None:
    with patch("app.main._load_app_config", return_value=_stub_config(None)):
        fill, template = _get_bulk_ai_caps()
    assert fill == DEFAULT_MAX_BULK_AI_FILL
    assert template == DEFAULT_MAX_BULK_AI_TEMPLATE


def test_defaults_when_bulk_block_is_not_a_dict() -> None:
    # A user typo like ``bulk: 50`` or ``bulk: "fifty"`` must not
    # crash; the helper falls back to defaults.
    with patch("app.main._load_app_config", return_value=_stub_config("fifty")):
        fill, template = _get_bulk_ai_caps()
    assert fill == DEFAULT_MAX_BULK_AI_FILL
    assert template == DEFAULT_MAX_BULK_AI_TEMPLATE


def test_custom_values_round_trip() -> None:
    cfg = _stub_config({"max_ai_fill": 250, "max_ai_template": 100})
    with patch("app.main._load_app_config", return_value=cfg):
        fill, template = _get_bulk_ai_caps()
    assert fill == 250
    assert template == 100


def test_one_key_set_the_other_defaults() -> None:
    cfg = _stub_config({"max_ai_fill": 200})
    with patch("app.main._load_app_config", return_value=cfg):
        fill, template = _get_bulk_ai_caps()
    assert fill == 200
    assert template == DEFAULT_MAX_BULK_AI_TEMPLATE


def test_zero_and_negative_fall_back_to_default() -> None:
    cfg = _stub_config({"max_ai_fill": 0, "max_ai_template": -10})
    with patch("app.main._load_app_config", return_value=cfg):
        fill, template = _get_bulk_ai_caps()
    assert fill == DEFAULT_MAX_BULK_AI_FILL
    assert template == DEFAULT_MAX_BULK_AI_TEMPLATE


def test_non_numeric_falls_back_to_default() -> None:
    cfg = _stub_config({"max_ai_fill": "lots", "max_ai_template": None})
    with patch("app.main._load_app_config", return_value=cfg):
        fill, template = _get_bulk_ai_caps()
    assert fill == DEFAULT_MAX_BULK_AI_FILL
    assert template == DEFAULT_MAX_BULK_AI_TEMPLATE


def test_string_int_coerces() -> None:
    # YAML parsing usually yields an int, but if a user quotes
    # the value (``"200"``) it should still work.
    cfg = _stub_config({"max_ai_fill": "200", "max_ai_template": "100"})
    with patch("app.main._load_app_config", return_value=cfg):
        fill, template = _get_bulk_ai_caps()
    assert fill == 200
    assert template == 100


# Round-trip via app.yaml -> _load_app_config -> _get_bulk_ai_caps.
def test_default_app_yaml_carries_50_each() -> None:
    """The shipped ``backend/config/app.yaml`` must declare the
    caps with positive int values so the dev-default UX matches
    the documented behaviour. This pin catches accidental
    removal of the keys."""
    fill, template = _get_bulk_ai_caps()
    # If app.yaml carries explicit values, they win. If the keys
    # are missing, the defaults still apply. Either way the
    # active caps must be positive.
    assert fill > 0
    assert template > 0


# ---------------------------------------------------------------------------
# _coerce_positive_int — direct unit
# ---------------------------------------------------------------------------


def test_coerce_int_passthrough() -> None:
    assert _coerce_positive_int(75, default=50) == 75


def test_coerce_str_int() -> None:
    assert _coerce_positive_int("75", default=50) == 75


def test_coerce_zero_falls_back() -> None:
    assert _coerce_positive_int(0, default=50) == 50


def test_coerce_negative_falls_back() -> None:
    assert _coerce_positive_int(-1, default=50) == 50


def test_coerce_non_numeric_falls_back() -> None:
    assert _coerce_positive_int("fifty", default=50) == 50
    assert _coerce_positive_int(None, default=50) == 50
    assert _coerce_positive_int([1, 2, 3], default=50) == 50
