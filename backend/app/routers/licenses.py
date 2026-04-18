"""License management API for premium plugins.

Currently disabled: all plugins are free during the development phase.
The LICENSING_ENABLED flag in backend/app/licensing.py controls this.
When reactivated, these endpoints manage HMAC-signed license keys.
"""

from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.licensing import LICENSING_ENABLED, LicenseError, LicenseStore, LicenseValidator
from app.yaml_io import read_yaml_roundtrip, write_yaml_roundtrip

router = APIRouter(prefix="/licenses", tags=["licenses"])

_validator: LicenseValidator | None = None
_store: LicenseStore | None = None
_manager: Any = None

_DISABLED_DETAIL = (
    "License management is currently disabled. "
    "All plugins are free during the current development phase."
)


def configure(manager: Any, validator: LicenseValidator, store: LicenseStore) -> None:
    global _manager, _validator, _store
    _manager = manager
    _validator = validator
    _store = store


def _get_author_name() -> str:
    """Read configured author name from app.yaml."""
    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
    if not config_path.exists():
        return ""
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        return config.get("author", {}).get("name", "")
    except Exception:
        return ""


class LicenseActivate(BaseModel):
    plugin_name: str
    license_key: str


@router.get("")
def list_licenses() -> dict[str, Any]:
    """List all stored license keys with status, author, and expiry."""
    if not LICENSING_ENABLED:
        raise HTTPException(status_code=410, detail=_DISABLED_DETAIL)
    if not _store or not _validator:
        raise HTTPException(status_code=500, detail="License system not configured")

    licenses = _store.all()
    author_name = _get_author_name()
    result: dict[str, Any] = {}

    for plugin_name, key in licenses.items():
        try:
            payload, warning = _validator.validate_license(key, plugin_name, author_name)
            result[plugin_name] = {
                "status": "valid",
                "expires": payload.expires,
                "version": payload.version,
                "author": payload.author,
                "key_preview": key[:25] + "..." if len(key) > 25 else key,
                "key_full": key,
                "warning": warning,
            }
        except LicenseError as e:
            result[plugin_name] = {
                "status": "invalid",
                "error": str(e),
                "key_preview": key[:25] + "..." if len(key) > 25 else key,
            }

    return result


@router.post("")
def activate_license(body: LicenseActivate) -> dict[str, Any]:
    """Activate a license key for a plugin."""
    if not LICENSING_ENABLED:
        raise HTTPException(status_code=410, detail=_DISABLED_DETAIL)
    if not _store or not _validator:
        raise HTTPException(status_code=500, detail="License system not configured")

    author_name = _get_author_name()

    try:
        payload, warning = _validator.validate_license(
            body.license_key, body.plugin_name, author_name
        )
    except LicenseError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _store.set(body.plugin_name, body.license_key)

    # Enable the plugin in app.yaml and try to activate it
    plugin_enabled = False
    if _manager:
        try:
            # Add to enabled list in config
            app_config = _manager.get_app_config()
            plugins_cfg = app_config.get("plugins", {})
            enabled_list = list(plugins_cfg.get("enabled", []) or [])
            if body.plugin_name not in enabled_list:
                enabled_list.append(body.plugin_name)
                # Write back to config
                config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
                if config_path.exists():
                    full_config = read_yaml_roundtrip(config_path)
                    full_config.setdefault("plugins", {})["enabled"] = enabled_list
                    write_yaml_roundtrip(config_path, full_config)
                    _manager.reload_config()
            # Try to discover and activate the plugin
            _manager.discover_plugins()
            plugin_enabled = body.plugin_name in {
                p.name for p in _manager.get_active_plugins()
            }
        except Exception:
            pass  # Plugin activation is best-effort

    return {
        "plugin": body.plugin_name,
        "status": "activated",
        "expires": payload.expires,
        "author": payload.author,
        "warning": warning,
        "plugin_enabled": plugin_enabled,
    }


@router.delete("/{plugin_name}")
def deactivate_license(plugin_name: str) -> dict[str, str]:
    """Remove a license key for a plugin."""
    if not LICENSING_ENABLED:
        raise HTTPException(status_code=410, detail=_DISABLED_DETAIL)
    if not _store:
        raise HTTPException(status_code=500, detail="License system not configured")

    _store.remove(plugin_name)
    return {"plugin": plugin_name, "status": "deactivated"}
