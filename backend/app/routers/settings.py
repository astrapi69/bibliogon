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


@router.get("/plugins/discovered")
def list_discovered_plugins() -> list[dict[str, Any]]:
    """List all plugins discovered via entry points (installed on system)."""
    if not _manager:
        return []

    discovered = _manager.discover()
    plugins_dir = _base_dir / "config" / "plugins"
    enabled = set(
        _read_yaml(_base_dir / "config" / "app.yaml").get("plugins", {}).get("enabled", [])
    ) if (_base_dir / "config" / "app.yaml").exists() else set()
    disabled = set(
        _read_yaml(_base_dir / "config" / "app.yaml").get("plugins", {}).get("disabled", [])
    ) if (_base_dir / "config" / "app.yaml").exists() else set()

    result = []
    for name in discovered:
        has_config = (plugins_dir / f"{name}.yaml").exists() if plugins_dir.exists() else False
        is_enabled = name in enabled and name not in disabled
        is_loaded = name in _manager.plugins
        result.append({
            "name": name,
            "has_config": has_config,
            "enabled": is_enabled,
            "loaded": is_loaded,
        })

    # Also include plugins that have config but weren't discovered (manually added)
    if plugins_dir.exists():
        for yaml_file in plugins_dir.glob("*.yaml"):
            name = yaml_file.stem
            if name not in [r["name"] for r in result]:
                result.append({
                    "name": name,
                    "has_config": True,
                    "enabled": name in enabled and name not in disabled,
                    "loaded": name in _manager.plugins,
                })

    return result


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

    # Unload if active
    if _manager and plugin_name in _manager.plugins:
        _manager.unload(plugin_name)

    # Remove from enabled list
    app_path = _base_dir / "config" / "app.yaml"
    if app_path.exists():
        app_config = _read_yaml(app_path)
        enabled = app_config.get("plugins", {}).get("enabled", [])
        if plugin_name in enabled:
            enabled.remove(plugin_name)
            _write_yaml(app_path, app_config)

    # Delete config file
    path.unlink()

    if _manager:
        _manager.config_loader.invalidate()

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
