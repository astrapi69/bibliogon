"""Plugin installation API - upload, install, uninstall ZIP plugins."""

import importlib
import re
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, UploadFile

from app.yaml_io import read_yaml_roundtrip, write_yaml_roundtrip

router = APIRouter(prefix="/plugins", tags=["plugin-install"])

_base_dir: Path = Path(".")
_manager: Any = None
_installed_dir: Path = Path(".")


def configure(base_dir: Path, manager: Any) -> None:
    global _base_dir, _manager, _installed_dir
    _base_dir = base_dir
    _manager = manager
    _installed_dir = base_dir / "plugins" / "installed"
    _installed_dir.mkdir(parents=True, exist_ok=True)


# Validation: only allow safe plugin names
_SAFE_NAME = re.compile(r"^[a-z][a-z0-9_-]{1,48}[a-z0-9]$")


def _validate_plugin_name(name: str) -> None:
    if not _SAFE_NAME.match(name):
        raise HTTPException(
            status_code=400,
            detail=f"Ungültiger Plugin-Name: '{name}'. "
                   "Erlaubt: Kleinbuchstaben, Ziffern, Bindestriche, Unterstriche (3-50 Zeichen).",
        )


def _validate_zip_paths(zf: zipfile.ZipFile) -> None:
    """Prevent path traversal attacks in ZIP files."""
    for info in zf.infolist():
        if info.filename.startswith("/") or ".." in info.filename:
            raise HTTPException(
                status_code=400,
                detail=f"Ungültiger Pfad im ZIP: '{info.filename}'",
            )


@router.post("/install")
async def install_plugin(file: UploadFile) -> dict[str, Any]:
    """Install a plugin from a ZIP file."""
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Nur ZIP-Dateien erlaubt.")

    content = await file.read()
    try:
        zf = zipfile.ZipFile(file=__import__("io").BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Ungueltige ZIP-Datei.")

    plugin_name, package_name, plugin_config = _validate_plugin_zip(zf)
    install_path = _extract_plugin(zf, plugin_name)
    registered, error_msg = _register_plugin(plugin_name, package_name, plugin_config)
    _enable_plugin_in_config(plugin_name)

    return {
        "plugin": plugin_name,
        "version": plugin_config.get("plugin", {}).get("version", "unknown"),
        "package": package_name, "installed_path": str(install_path),
        "registered": registered, "error": error_msg or None,
        "status": "installed" if registered else "installed_pending_restart",
        "message": (
            f"Plugin '{plugin_name}' installiert und aktiviert." if registered
            else f"Plugin '{plugin_name}' installiert. Neustart erforderlich."
            + (f" Fehler: {error_msg}" if error_msg else "")
        ),
    }


def _validate_plugin_zip(zf: zipfile.ZipFile) -> tuple[str, str, dict]:
    """Validate ZIP structure and return (plugin_name, package_name, config)."""
    _validate_zip_paths(zf)

    top_dirs = {n.split("/")[0] for n in zf.namelist() if "/" in n}
    if len(top_dirs) != 1:
        raise HTTPException(status_code=400, detail="ZIP muss genau ein Verzeichnis enthalten.")
    plugin_dir = top_dirs.pop()

    yaml_path = f"{plugin_dir}/plugin.yaml"
    if yaml_path not in zf.namelist():
        raise HTTPException(status_code=400, detail=f"plugin.yaml fehlt (erwartet: {yaml_path}).")

    try:
        config = yaml.safe_load(zf.read(yaml_path))
    except Exception:
        raise HTTPException(status_code=400, detail="plugin.yaml ist ungueltig.")

    plugin_name = config.get("plugin", {}).get("name", "")
    _validate_plugin_name(plugin_name)

    packages = [
        n.split("/")[1] for n in zf.namelist()
        if n.count("/") == 2 and n.endswith("__init__.py") and n.startswith(plugin_dir + "/")
    ]
    if not packages:
        raise HTTPException(status_code=400, detail="Kein Python-Paket gefunden.")

    package_name = packages[0]
    if f"{plugin_dir}/{package_name}/plugin.py" not in zf.namelist():
        raise HTTPException(status_code=400, detail=f"plugin.py fehlt im Paket '{package_name}'.")

    return plugin_name, package_name, config


def _extract_plugin(zf: zipfile.ZipFile, plugin_name: str) -> Path:
    """Extract plugin ZIP to installed directory and copy config."""
    install_path = _installed_dir / plugin_name
    if install_path.exists():
        shutil.rmtree(install_path)
    install_path.mkdir(parents=True, exist_ok=True)

    for info in zf.infolist():
        if info.is_dir():
            continue
        rel_path = "/".join(info.filename.split("/")[1:])
        if not rel_path:
            continue
        target = install_path / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(zf.read(info.filename))

    config_dest = _base_dir / "config" / "plugins" / f"{plugin_name}.yaml"
    shutil.copy2(install_path / "plugin.yaml", config_dest)

    install_str = str(install_path)
    if install_str not in sys.path:
        sys.path.insert(0, install_str)
    return install_path


def _register_plugin(plugin_name: str, package_name: str, plugin_config: dict) -> tuple[bool, str]:
    """Try to dynamically register the plugin. Returns (registered, error_msg)."""
    if not _manager:
        return False, "Plugin manager not available"
    try:
        module = importlib.import_module(f"{package_name}.plugin")
        from pluginforge import BasePlugin
        plugin_class = next(
            (getattr(module, a) for a in dir(module)
             if isinstance(getattr(module, a), type) and issubclass(getattr(module, a), BasePlugin) and getattr(module, a) is not BasePlugin),
            None,
        )
        if not plugin_class:
            return False, f"Keine BasePlugin-Unterklasse in {package_name}.plugin gefunden."
        _manager.register_plugin(plugin_class(), plugin_config)
        return True, ""
    except Exception as e:
        return False, str(e)


def _enable_plugin_in_config(plugin_name: str) -> None:
    """Add plugin to enabled list in app.yaml."""
    app_yaml_path = _base_dir / "config" / "app.yaml"
    if not app_yaml_path.exists():
        return
    app_config = _read_yaml(app_yaml_path)
    enabled = app_config.setdefault("plugins", {}).setdefault("enabled", [])
    disabled = app_config["plugins"].setdefault("disabled", [])
    if plugin_name not in enabled:
        enabled.append(plugin_name)
    if plugin_name in disabled:
        disabled.remove(plugin_name)
    _write_yaml(app_yaml_path, app_config)


@router.delete("/install/{plugin_name}")
def uninstall_plugin(plugin_name: str) -> dict[str, str]:
    """Uninstall a previously installed plugin."""
    _validate_plugin_name(plugin_name)

    install_path = _installed_dir / plugin_name
    if not install_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Plugin '{plugin_name}' ist nicht installiert.",
        )

    # Deactivate if active
    if _manager:
        active_names = {p.name for p in _manager.get_active_plugins()}
        if plugin_name in active_names:
            _manager.deactivate_plugin(plugin_name)

    # Remove from enabled list
    app_yaml_path = _base_dir / "config" / "app.yaml"
    if app_yaml_path.exists():
        app_config = _read_yaml(app_yaml_path)
        enabled = app_config.get("plugins", {}).get("enabled", [])
        disabled = app_config.get("plugins", {}).setdefault("disabled", [])
        if plugin_name in enabled:
            enabled.remove(plugin_name)
        _write_yaml(app_yaml_path, app_config)

    # Remove plugin config
    config_path = _base_dir / "config" / "plugins" / f"{plugin_name}.yaml"
    if config_path.exists():
        config_path.unlink()

    # Remove installed files
    shutil.rmtree(install_path)

    # Remove from sys.path
    install_str = str(install_path)
    if install_str in sys.path:
        sys.path.remove(install_str)

    return {"plugin": plugin_name, "status": "uninstalled"}


@router.get("/installed")
def list_installed_plugins() -> list[dict[str, Any]]:
    """List all plugins installed via ZIP upload."""
    result: list[dict[str, Any]] = []
    if not _installed_dir.exists():
        return result

    for plugin_dir in sorted(_installed_dir.iterdir()):
        if not plugin_dir.is_dir():
            continue
        yaml_path = plugin_dir / "plugin.yaml"
        if not yaml_path.exists():
            continue

        config = _read_yaml(yaml_path)
        meta = config.get("plugin", {})
        active_names = set()
        if _manager:
            active_names = {p.name for p in _manager.get_active_plugins()}

        result.append({
            "name": meta.get("name", plugin_dir.name),
            "display_name": meta.get("display_name", plugin_dir.name),
            "description": meta.get("description", ""),
            "version": meta.get("version", "unknown"),
            "license": meta.get("license", "unknown"),
            "active": meta.get("name", plugin_dir.name) in active_names,
            "path": str(plugin_dir),
        })

    return result


# --- Helpers ---

def _read_yaml(path: Path) -> dict[str, Any]:
    return read_yaml_roundtrip(path)


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    write_yaml_roundtrip(path, data)
