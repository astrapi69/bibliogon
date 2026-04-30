"""Settings API for reading and writing app and plugin configurations."""

import logging
import os
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.yaml_io import read_yaml_roundtrip, write_yaml_roundtrip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])

# Dotted paths into the AppSettingsUpdate body that name secrets.
# When an override file exists OR an env-var is set for that secret,
# the field is stripped from PATCH bodies before write so the UI
# cannot accidentally clobber the externally-managed value.
# Initial scope mirrors _ENV_SECRET_OVERRIDES in app.main: ai.api_key.
_SECRET_FIELDS: tuple[tuple[str, str], ...] = (("ai", "api_key"),)


def _secrets_managed_externally() -> bool:
    """True when the user has migrated secrets to the override file
    OR set the BIBLIOGON_AI_API_KEY env-var. Frontend reads this
    flag to hide the API-key input; backend uses it to defensively
    strip the same field from PATCH bodies."""
    from app.main import _get_user_override_path

    if _get_user_override_path().exists():
        return True
    if os.environ.get("BIBLIOGON_AI_API_KEY"):
        return True
    return False


_base_dir: Path = Path(".")
_manager: Any = None
_license_store: Any = None
_license_validator: Any = None


def configure(
    base_dir: Path, manager: Any, license_store: Any = None, license_validator: Any = None
) -> None:
    global _base_dir, _manager, _license_store, _license_validator
    _base_dir = base_dir
    _manager = manager
    _license_store = license_store
    _license_validator = license_validator


def _active_plugin_names() -> set[str]:
    """Get names of currently active plugins."""
    if not _manager:
        return set()
    return {p.name for p in _manager.get_active_plugins()}


# --- App Settings ---


@router.get("/app")
def get_app_settings() -> dict[str, Any]:
    """Get the full app configuration plus the
    ``_secrets_managed_externally`` flag the frontend reads to gate
    secret inputs (Settings tab + AiSetupWizard).

    Underscore prefix on the flag marks it as a meta-field that the
    PATCH endpoint does NOT round-trip back into ``app.yaml``.
    """
    path = _base_dir / "config" / "app.yaml"
    config = _read_yaml(path) if path.exists() else {}
    config["_secrets_managed_externally"] = _secrets_managed_externally()
    return config


class AppSettingsUpdate(BaseModel):
    app: dict[str, Any] | None = None
    ui: dict[str, Any] | None = None
    author: dict[str, Any] | None = None
    plugins: dict[str, Any] | None = None
    ai: dict[str, Any] | None = None
    editor: dict[str, Any] | None = None
    # AR-02 Phase 2.1: settings-managed list of article topics. The
    # ArticleEditor topic dropdown reads from app.yaml topics: [...].
    topics: list[str] | None = None


class AddPenNameRequest(BaseModel):
    name: str


@router.post("/author/pen-name")
def add_pen_name(body: AddPenNameRequest) -> dict[str, Any]:
    """Add a pen name to the user's author profile.

    Used by the import wizard when an imported book references an
    author that is not in Settings: instead of dragging the user
    through a Settings detour mid-import, the wizard offers to add
    the unknown name as a new pen name on the existing profile.

    Behavior:
    - Empty / whitespace-only name -> 400.
    - Name equal to existing author.name -> idempotent, returns
      profile unchanged.
    - Name already in pen_names -> idempotent.
    - Otherwise appended to pen_names (preserves order).
    - When author.name is empty, the new value is set as the real
      name instead of appended (the schema's single-profile model
      treats real-name + pen-names as one identity; bootstrapping
      from zero authors should not leave the profile pen-names-
      only).

    Returns the updated `author:` block ({name, pen_names}).
    """
    cleaned = body.name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="name must be non-empty")

    path = _base_dir / "config" / "app.yaml"
    current = _read_yaml(path) if path.exists() else {}
    author = current.setdefault("author", {})
    name = (author.get("name") or "").strip()
    pen_names_raw = author.get("pen_names") or []
    pen_names = [str(n).strip() for n in pen_names_raw if isinstance(n, str) and str(n).strip()]

    if cleaned == name:
        return {"name": name, "pen_names": pen_names}
    if cleaned in pen_names:
        return {"name": name, "pen_names": pen_names}

    if not name:
        author["name"] = cleaned
    else:
        pen_names.append(cleaned)
        author["pen_names"] = pen_names

    _write_yaml(path, current)
    if _manager:
        _manager.reload_config()

    return {
        "name": author.get("name", "") or "",
        "pen_names": author.get("pen_names", []) or [],
    }


@router.patch("/app")
def update_app_settings(body: AppSettingsUpdate) -> dict[str, Any]:
    """Update app configuration (merges with existing).

    Defense-in-depth: when secrets are managed externally (override
    file or env-var present), strip secret fields from the incoming
    body before writing. The UI is supposed to hide those inputs,
    but a stale tab or misbehaving plugin could still POST them.
    Stripping prevents the project ``app.yaml`` from clobbering an
    externally-managed value.
    """
    path = _base_dir / "config" / "app.yaml"
    current = _read_yaml(path) if path.exists() else {}

    if _secrets_managed_externally():
        for parent_key, child_key in _SECRET_FIELDS:
            section = getattr(body, parent_key, None)
            if isinstance(section, dict) and child_key in section:
                del section[child_key]
                logger.warning(
                    "Stripped %r.%r from Settings PATCH because secrets are "
                    "managed externally (override file or env-var active). "
                    "Frontend should hide this field; check Settings.tsx and "
                    "AiSetupWizard.tsx.",
                    parent_key,
                    child_key,
                )

    if body.app is not None:
        current.setdefault("app", {}).update(body.app)
    if body.ui is not None:
        current.setdefault("ui", {}).update(body.ui)
    if body.author is not None:
        current.setdefault("author", {}).update(body.author)
    if body.plugins is not None:
        current.setdefault("plugins", {}).update(body.plugins)
    if body.ai is not None:
        current.setdefault("ai", {}).update(body.ai)
    if body.editor is not None:
        current.setdefault("editor", {}).update(body.editor)
    if body.topics is not None:
        # Topics is a list - write whole, dedupe, drop empties.
        seen: set[str] = set()
        cleaned: list[str] = []
        for raw in body.topics:
            t = (raw or "").strip()
            if not t or t in seen:
                continue
            seen.add(t)
            cleaned.append(t)
        current["topics"] = cleaned

    _write_yaml(path, current)

    # Reload config in the manager so changes take effect
    if _manager:
        _manager.reload_config()

    # Invalidate the plugin-status cache so the editor sees fresh state
    from app.main import invalidate_plugin_status_cache

    invalidate_plugin_status_cache()

    return current


# --- Plugin Settings ---


@router.get("/plugins")
def list_plugin_configs() -> dict[str, Any]:
    """List all plugin configurations with their settings."""
    plugins_dir = _base_dir / "config" / "plugins"
    result: dict[str, Any] = {}

    if not plugins_dir.exists():
        return result

    for yaml_file in sorted(plugins_dir.glob("*.yaml")):
        plugin_name = yaml_file.stem
        config = _read_yaml(yaml_file)
        result[plugin_name] = config

    return result


@router.get("/plugins/discovered")
def list_discovered_plugins() -> list[dict[str, Any]]:
    """List plugins with configs that are registered (entry point, ZIP, or bundled)."""
    if not _manager:
        return []

    plugins_dir = _base_dir / "config" / "plugins"
    app_config = _manager.get_app_config()
    plugins_cfg = app_config.get("plugins", {})
    enabled = set(plugins_cfg.get("enabled", []) or [])
    disabled = set(plugins_cfg.get("disabled", []) or [])
    active = _active_plugin_names()
    available = _collect_available_plugins(active)

    result = []
    if plugins_dir.exists():
        for yaml_file in sorted(plugins_dir.glob("*.yaml")):
            name = yaml_file.stem
            if name not in available:
                continue
            tier = _read_license_tier(yaml_file)
            has_license = _check_plugin_license(name, tier)
            result.append(
                {
                    "name": name,
                    "has_config": True,
                    "enabled": name in enabled and name not in disabled,
                    "loaded": name in active,
                    "license_tier": tier,
                    "has_license": has_license,
                }
            )
    return result


def _collect_available_plugins(active: set[str]) -> set[str]:
    """Collect all available plugin names from entry points, ZIP installs, and bundled dirs."""
    try:
        available = set(_manager.list_available_plugins())
    except Exception:
        available = set()
    available |= active

    installed_dir = _base_dir / "plugins" / "installed"
    if installed_dir.exists():
        for d in installed_dir.iterdir():
            if d.is_dir() and (d / "plugin.yaml").exists():
                available.add(d.name)

    bundled_dir = _base_dir.parent / "plugins"
    if bundled_dir.exists():
        for d in bundled_dir.iterdir():
            if d.is_dir() and d.name.startswith("bibliogon-plugin-"):
                plugin_name = d.name.replace("bibliogon-plugin-", "")
                pkg_dir = d / f"bibliogon_{plugin_name.replace('-', '_')}"
                if (pkg_dir / "plugin.py").exists():
                    available.add(plugin_name)
    return available


def _read_license_tier(yaml_path: Path) -> str:
    """Read license tier from a plugin YAML config file."""
    try:
        with open(yaml_path, encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        meta = cfg.get("plugin", {})
        explicit = meta.get("license_tier", "")
        if explicit in ("core", "premium"):
            return str(explicit)
        license_type = meta.get("license", "MIT")
        return "premium" if license_type not in ("MIT", "free", "Free") else "core"
    except Exception:
        return "core"


def _check_plugin_license(name: str, tier: str) -> bool:
    """Check if a plugin has a valid license (core always True)."""
    if tier == "core":
        return True
    if not _license_store or not _license_validator:
        return False
    key = _license_store.get(name) or _license_store.get("*")
    if not key:
        return False
    try:
        _license_validator.validate_license(key, name)
        return True
    except Exception:
        wildcard = _license_store.get("*")
        if wildcard:
            try:
                _license_validator.validate_license(wildcard, "*")
                return True
            except Exception:
                pass
    return False


class PluginCreate(BaseModel):
    name: str
    display_name: str = ""
    description: str = ""
    version: str = "1.0.0"
    license: str = "MIT"
    settings: dict[str, Any] = {}


@router.post("/plugins")
def create_plugin_config(body: PluginCreate) -> dict[str, Any]:
    """Create a new plugin configuration file."""
    plugins_dir = _base_dir / "config" / "plugins"
    path = plugins_dir / f"{body.name}.yaml"

    if path.exists():
        raise HTTPException(status_code=409, detail=f"Plugin config '{body.name}' already exists")

    config: dict[str, Any] = {
        "plugin": {
            "name": body.name,
            "display_name": body.display_name or body.name,
            "description": body.description,
            "version": body.version,
            "license": body.license,
            "depends_on": [],
            "api_version": "1",
        },
        "settings": body.settings,
    }

    _write_yaml(path, config)
    return config


@router.delete("/plugins/{plugin_name}")
def delete_plugin_config(plugin_name: str) -> dict[str, str]:
    """Delete a plugin configuration file and disable the plugin."""
    plugins_dir = _base_dir / "config" / "plugins"
    path = plugins_dir / f"{plugin_name}.yaml"

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Plugin config '{plugin_name}' not found")

    # Deactivate if active
    if _manager and plugin_name in _active_plugin_names():
        _manager.deactivate_plugin(plugin_name)

    # Remove from enabled list
    app_path = _base_dir / "config" / "app.yaml"
    if app_path.exists():
        app_config = _read_yaml(app_path)
        enabled = app_config.get("plugins", {}).get("enabled", [])
        if plugin_name in enabled:
            enabled.remove(plugin_name)
            _write_yaml(app_path, app_config)

    path.unlink()
    return {"plugin": plugin_name, "status": "removed"}


@router.get("/plugins/{plugin_name}")
def get_plugin_config(plugin_name: str) -> dict[str, Any]:
    """Get configuration for a specific plugin."""
    path = _base_dir / "config" / "plugins" / f"{plugin_name}.yaml"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Plugin config '{plugin_name}' not found")
    return _read_yaml(path)


class PluginSettingsUpdate(BaseModel):
    settings: dict[str, Any]


@router.patch("/plugins/{plugin_name}")
def update_plugin_settings(plugin_name: str, body: PluginSettingsUpdate) -> dict[str, Any]:
    """Update settings section of a plugin config (merges with existing)."""
    path = _base_dir / "config" / "plugins" / f"{plugin_name}.yaml"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Plugin config '{plugin_name}' not found")

    current = _read_yaml(path)
    current.setdefault("settings", {}).update(body.settings)
    _write_yaml(path, current)

    # Update loaded plugin config if active
    if _manager:
        plugin = _manager.get_plugin(plugin_name)
        if plugin:
            plugin.config = current

    return current


# --- Plugin Enable/Disable ---


@router.post("/plugins/{plugin_name}/enable")
def enable_plugin(plugin_name: str) -> dict[str, str]:
    """Enable a plugin in app config."""
    app_path = _base_dir / "config" / "app.yaml"
    config = _read_yaml(app_path) if app_path.exists() else {}

    enabled = config.setdefault("plugins", {}).setdefault("enabled", [])
    disabled = config["plugins"].setdefault("disabled", [])

    if plugin_name not in enabled:
        enabled.append(plugin_name)
    if plugin_name in disabled:
        disabled.remove(plugin_name)

    _write_yaml(app_path, config)
    return {"plugin": plugin_name, "status": "enabled"}


@router.post("/plugins/{plugin_name}/disable")
def disable_plugin(plugin_name: str) -> dict[str, str]:
    """Disable a plugin in app config."""
    app_path = _base_dir / "config" / "app.yaml"
    config = _read_yaml(app_path) if app_path.exists() else {}

    enabled = config.setdefault("plugins", {}).setdefault("enabled", [])
    disabled = config["plugins"].setdefault("disabled", [])

    if plugin_name in enabled:
        enabled.remove(plugin_name)
    if plugin_name not in disabled:
        disabled.append(plugin_name)

    _write_yaml(app_path, config)

    # Deactivate the plugin if currently active
    if _manager and plugin_name in _active_plugin_names():
        _manager.deactivate_plugin(plugin_name)

    return {"plugin": plugin_name, "status": "disabled"}


# --- Helpers ---


def _read_yaml(path: Path) -> dict[str, Any]:
    data = read_yaml_roundtrip(path)
    return data if isinstance(data, dict) else {}


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    write_yaml_roundtrip(path, data)
