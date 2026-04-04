"""Settings API for reading and writing app and plugin configurations."""

from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/settings", tags=["settings"])

_base_dir: Path = Path(".")
_manager: Any = None
_license_store: Any = None
_license_validator: Any = None


def configure(base_dir: Path, manager: Any, license_store: Any = None, license_validator: Any = None) -> None:
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
    """Get the full app configuration."""
    path = _base_dir / "config" / "app.yaml"
    if not path.exists():
        return {}
    return _read_yaml(path)


class AppSettingsUpdate(BaseModel):
    app: dict[str, Any] | None = None
    ui: dict[str, Any] | None = None
    author: dict[str, Any] | None = None
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
    if body.author is not None:
        current.setdefault("author", {}).update(body.author)
    if body.plugins is not None:
        current.setdefault("plugins", {}).update(body.plugins)

    _write_yaml(path, current)

    # Reload config in the manager so changes take effect
    if _manager:
        _manager.reload_config()

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
    """List all plugins that have configs AND are registered (entry point or ZIP-installed).

    Plugins with YAML config but no entry point (not implemented) are excluded.
    """
    if not _manager:
        return []

    plugins_dir = _base_dir / "config" / "plugins"
    app_config = _manager.get_app_config()
    plugins_cfg = app_config.get("plugins", {})
    enabled = set(plugins_cfg.get("enabled", []) or [])
    disabled = set(plugins_cfg.get("disabled", []) or [])
    active = _active_plugin_names()

    # Get plugins that are actually registered (have entry points)
    try:
        available = set(_manager.list_available_plugins())
    except Exception:
        available = set()
    # Also include active plugins (in case list_available_plugins misses some)
    available |= active

    # Check installed plugins directory (ZIP-installed)
    installed_dir = _base_dir / "plugins" / "installed"
    if installed_dir.exists():
        for d in installed_dir.iterdir():
            if d.is_dir() and (d / "plugin.yaml").exists():
                available.add(d.name)

    # Check bundled plugin directories (plugins/bibliogon-plugin-*)
    bundled_dir = _base_dir.parent / "plugins"
    if bundled_dir.exists():
        for d in bundled_dir.iterdir():
            if d.is_dir() and d.name.startswith("bibliogon-plugin-"):
                plugin_name = d.name.replace("bibliogon-plugin-", "")
                # Only include if it has a plugin.py (actually implemented)
                pkg_dir = d / f"bibliogon_{plugin_name.replace('-', '_')}"
                if (pkg_dir / "plugin.py").exists():
                    available.add(plugin_name)

    result = []
    if plugins_dir.exists():
        for yaml_file in sorted(plugins_dir.glob("*.yaml")):
            name = yaml_file.stem
            # Only show plugins that are actually registered/available
            if name not in available:
                continue
            # Read license tier from plugin config
            license_tier = "core"
            try:
                with open(yaml_file, encoding="utf-8") as f:
                    cfg = yaml.safe_load(f) or {}
                plugin_meta = cfg.get("plugin", {})
                license_type = plugin_meta.get("license", "MIT")
                if license_type not in ("MIT", "free", "Free"):
                    license_tier = "premium"
            except Exception:
                pass
            # Check if plugin has a valid license
            has_license = license_tier == "core"
            if license_tier == "premium" and _license_store:
                key = _license_store.get(name) or _license_store.get("*")
                if key and _license_validator:
                    try:
                        _license_validator.validate_license(key, name)
                        has_license = True
                    except Exception:
                        # Try wildcard
                        wildcard = _license_store.get("*")
                        if wildcard:
                            try:
                                _license_validator.validate_license(wildcard, "*")
                                has_license = True
                            except Exception:
                                pass
            result.append({
                "name": name,
                "has_config": True,
                "enabled": name in enabled and name not in disabled,
                "loaded": name in active,
                "license_tier": license_tier,
                "has_license": has_license,
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
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
