"""Settings API for reading and writing app and plugin configurations."""

from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/settings", tags=["settings"])

_base_dir: Path = Path(".")
_manager: Any = None


def configure(base_dir: Path, manager: Any) -> None:
    global _base_dir, _manager
    _base_dir = base_dir
    _manager = manager


# --- App Settings ---


@router.get("/app")
def get_app_settings() -> dict[str, Any]:
    """Get the full app configuration."""
    path = _base_dir / "config" / "app.yaml"
    if not path.exists():
        return {}
    return _read_yaml(path)


class AppSettingsUpdate(BaseModel):
    app: dict[str, Any] | None = None
    ui: dict[str, Any] | None = None
    plugins: dict[str, Any] | None = None


@router.patch("/app")
def update_app_settings(body: AppSettingsUpdate) -> dict[str, Any]:
    """Update app configuration (merges with existing)."""
    path = _base_dir / "config" / "app.yaml"
    current = _read_yaml(path) if path.exists() else {}

    if body.app is not None:
        current.setdefault("app", {}).update(body.app)
    if body.ui is not None:
        current.setdefault("ui", {}).update(body.ui)
    if body.plugins is not None:
        current.setdefault("plugins", {}).update(body.plugins)

    _write_yaml(path, current)

    # Invalidate config cache
    if _manager:
        _manager.config_loader.invalidate()

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

    # Invalidate config cache and update loaded plugin
    if _manager:
        _manager.config_loader.invalidate()
        if plugin_name in _manager.plugins:
            plugin = _manager.plugins[plugin_name]
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

    if _manager:
        _manager.config_loader.invalidate()

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

    # Unload the plugin if currently active
    if _manager and plugin_name in _manager.plugins:
        _manager.unload(plugin_name)
        _manager.config_loader.invalidate()

    return {"plugin": plugin_name, "status": "disabled"}


# --- Helpers ---


def _read_yaml(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
