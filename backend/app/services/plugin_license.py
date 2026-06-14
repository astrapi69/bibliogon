"""Plugin license-tier resolution and validation.

Extracted from ``routers/settings.py`` (God-file split #4, 2026-06-14).
The DI state (license store + validator) is passed in by the caller so
these functions stay free of module-level globals and unit-testable in
isolation. Licensing is dormant project-wide (all plugins are ``core``),
so ``check_plugin_license`` returns True for the common path.
"""

from typing import Any


def resolve_license_tier(cfg: dict[str, Any]) -> str:
    """Resolve the license tier from a plugin's merged config dict.

    Explicit ``plugin.license_tier`` (``"core"`` / ``"premium"``) wins;
    otherwise fall back to ``plugin.license`` (``MIT``, ``Free`` ->
    ``core``; anything else -> ``premium``).
    """
    meta = cfg.get("plugin", {}) if isinstance(cfg.get("plugin"), dict) else {}
    explicit = meta.get("license_tier", "")
    if explicit in ("core", "premium"):
        return str(explicit)
    license_type = meta.get("license", "MIT")
    return "premium" if license_type not in ("MIT", "free", "Free") else "core"


def check_plugin_license(name: str, tier: str, license_store: Any, license_validator: Any) -> bool:
    """Check whether a plugin has a valid license (``core`` always True).

    Args:
        name: Plugin slug.
        tier: Resolved license tier (``"core"`` / ``"premium"``).
        license_store: Store exposing ``get(name)`` -> key-or-None.
        license_validator: Validator exposing ``validate_license(key, name)``.
    """
    if tier == "core":
        return True
    if not license_store or not license_validator:
        return False
    key = license_store.get(name) or license_store.get("*")
    if not key:
        return False
    try:
        license_validator.validate_license(key, name)
        return True
    except Exception:
        wildcard = license_store.get("*")
        if wildcard:
            try:
                license_validator.validate_license(wildcard, "*")
                return True
            except Exception:
                pass
    return False
