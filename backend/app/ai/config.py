"""AI configuration readers (merged app.yaml + override + env).

Extracted from ``ai/routes.py`` (God-file split #14, 2026-06-14).
"""

from typing import Any


def _get_ai_config() -> dict[str, Any]:
    """Read merged AI config (project app.yaml + user override file +
    env-vars).

    Routes through ``app.main._load_app_config`` so the three-layer
    chain (T-XX secrets refactor) reaches the AI client. Reading
    ``app.yaml`` directly here was the bug surfaced when
    ai.api_key was emptied from the project file and moved to
    ~/.config/bibliogon/secrets.yaml: the AI client kept reading
    the empty project value and failed every connection. Lazy
    import to avoid the circular ai/routes.py <-> app.main cycle.
    """
    from app.main import _load_app_config

    ai_config = _load_app_config().get("ai", {})
    return ai_config if isinstance(ai_config, dict) else {}


# Default per-batch caps for bulk AI operations
# (AI-FILL-CAP-CONFIG-01). Overridable via ``ai.bulk.max_ai_fill``
# and ``ai.bulk.max_ai_template`` in app.yaml. The constants are
# the documented defaults and also the fallback when YAML
# carries an invalid value (non-int, zero, negative).
DEFAULT_MAX_BULK_AI_FILL = 50
DEFAULT_MAX_BULK_AI_TEMPLATE = 50


def _coerce_positive_int(value: Any, default: int) -> int:
    """Return ``int(value)`` when it is a positive integer, else
    fall back to ``default``. Used for cap values where 0 / a
    negative number / a typo (``"fifty"``) must not silently
    shrink the runtime cap to something surprising."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return n if n > 0 else default


def _get_bulk_ai_caps() -> tuple[int, int]:
    """Return ``(max_ai_fill, max_ai_template)`` from the merged
    AI config. Both default to ``50`` when the keys are missing,
    or when the YAML value cannot be coerced to a positive int.

    Reads fresh on every call so users editing ``app.yaml``
    don't have to restart the backend. The merged-config read
    is cheap (small files, no network)."""
    cfg = _get_ai_config()
    bulk_raw = cfg.get("bulk", {})
    bulk = bulk_raw if isinstance(bulk_raw, dict) else {}
    return (
        _coerce_positive_int(bulk.get("max_ai_fill"), DEFAULT_MAX_BULK_AI_FILL),
        _coerce_positive_int(bulk.get("max_ai_template"), DEFAULT_MAX_BULK_AI_TEMPLATE),
    )


def _is_ai_enabled() -> bool:
    """Check if AI features are enabled in config."""
    cfg = _get_ai_config()
    return bool(cfg.get("enabled", False))
