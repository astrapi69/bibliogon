"""License management API for premium plugins."""

import yaml
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.licensing import LicenseError, LicenseStore, LicenseValidator

router = APIRouter(prefix="/licenses", tags=["licenses"])

_validator: LicenseValidator | None = None
_store: LicenseStore | None = None
_manager: Any = None


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

    return {
        "plugin": body.plugin_name,
        "status": "activated",
        "expires": payload.expires,
        "author": payload.author,
        "warning": warning,
    }


@router.delete("/{plugin_name}")
def deactivate_license(plugin_name: str) -> dict[str, str]:
    """Remove a license key for a plugin."""
    if not _store:
        raise HTTPException(status_code=500, detail="License system not configured")

    _store.remove(plugin_name)
    return {"plugin": plugin_name, "status": "deactivated"}
