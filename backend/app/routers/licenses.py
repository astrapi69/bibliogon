"""License management API for premium plugins."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.licensing import LicenseStore, LicenseValidator

router = APIRouter(prefix="/licenses", tags=["licenses"])

_validator: LicenseValidator | None = None
_store: LicenseStore | None = None
_manager: Any = None


def configure(manager: Any, validator: LicenseValidator, store: LicenseStore) -> None:
    global _manager, _validator, _store
    _manager = manager
    _validator = validator
    _store = store


class LicenseActivate(BaseModel):
    plugin_name: str
    license_key: str


@router.get("")
def list_licenses() -> dict[str, Any]:
    """List all stored license keys and their status."""
    if not _store or not _validator:
        raise HTTPException(status_code=500, detail="License system not configured")

    licenses = _store.all()
    result: dict[str, Any] = {}

    for plugin_name, key in licenses.items():
        try:
            payload = _validator.validate_license(key, plugin_name)
            result[plugin_name] = {
                "status": "valid",
                "expires": payload.expires,
                "version": payload.version,
            }
        except Exception as e:
            result[plugin_name] = {
                "status": "invalid",
                "error": str(e),
            }

    return result


@router.post("")
def activate_license(body: LicenseActivate) -> dict[str, Any]:
    """Activate a license key for a plugin."""
    if not _store or not _validator:
        raise HTTPException(status_code=500, detail="License system not configured")

    try:
        payload = _validator.validate_license(body.license_key, body.plugin_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    _store.set(body.plugin_name, body.license_key)

    return {
        "plugin": body.plugin_name,
        "status": "activated",
        "expires": payload.expires,
    }


@router.delete("/{plugin_name}")
def deactivate_license(plugin_name: str) -> dict[str, str]:
    """Remove a license key for a plugin."""
    if not _store:
        raise HTTPException(status_code=500, detail="License system not configured")

    _store.remove(plugin_name)
    return {"plugin": plugin_name, "status": "deactivated"}
