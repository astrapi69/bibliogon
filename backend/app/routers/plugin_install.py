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
    """Install a plugin from a ZIP file.

    Expected ZIP structure:
        plugin-name/
        ├── plugin.yaml       (required: plugin config)
        ├── package_name/     (required: Python package with plugin.py)
        │   ├── __init__.py
        │   └── plugin.py
        └── requirements.txt  (optional)
    """
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Nur ZIP-Dateien erlaubt.")

    # Read into memory and validate
    content = await file.read()
    try:
        zf = zipfile.ZipFile(file=__import__("io").BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Ungültige ZIP-Datei.")

    _validate_zip_paths(zf)

    # Find the plugin root directory (first directory in ZIP)
    top_dirs = {n.split("/")[0] for n in zf.namelist() if "/" in n}
    if len(top_dirs) != 1:
        raise HTTPException(
            status_code=400,
            detail="ZIP muss genau ein Verzeichnis enthalten (den Plugin-Ordner).",
        )
    plugin_dir_name = top_dirs.pop()

    # Find and validate plugin.yaml
    yaml_path = f"{plugin_dir_name}/plugin.yaml"
    if yaml_path not in zf.namelist():
        raise HTTPException(
            status_code=400,
            detail=f"plugin.yaml fehlt im ZIP (erwartet: {yaml_path}).",
        )

    try:
        plugin_config = yaml.safe_load(zf.read(yaml_path))
    except Exception:
        raise HTTPException(status_code=400, detail="plugin.yaml ist ungültig.")

    plugin_meta = plugin_config.get("plugin", {})
    plugin_name = plugin_meta.get("name", "")
    _validate_plugin_name(plugin_name)

    # Find the Python package (directory with __init__.py)
    python_packages = []
    for name in zf.namelist():
        parts = name.split("/")
        if len(parts) == 3 and parts[2] == "__init__.py" and parts[0] == plugin_dir_name:
            python_packages.append(parts[1])

    if not python_packages:
        raise HTTPException(
            status_code=400,
            detail="Kein Python-Paket gefunden (Verzeichnis mit __init__.py fehlt).",
        )

    # Check if plugin.py exists in the package
    package_name = python_packages[0]
    plugin_module_path = f"{plugin_dir_name}/{package_name}/plugin.py"
    if plugin_module_path not in zf.namelist():
        raise HTTPException(
            status_code=400,
            detail=f"plugin.py fehlt im Paket '{package_name}'.",
        )

    # Check for entry_point in plugin.yaml
    entry_point = plugin_meta.get("entry_point", "")
    if not entry_point:
        # Auto-detect: package_name.plugin:*Plugin
        entry_point = f"{package_name}.plugin"

    # Extract to installed directory
    install_path = _installed_dir / plugin_name
    if install_path.exists():
        shutil.rmtree(install_path)

    install_path.mkdir(parents=True, exist_ok=True)
    for info in zf.infolist():
        if info.is_dir():
            continue
        # Strip the top-level directory from the path
        rel_path = "/".join(info.filename.split("/")[1:])
        if not rel_path:
            continue
        target = install_path / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(zf.read(info.filename))

    # Copy plugin.yaml to config/plugins/
    config_dest = _base_dir / "config" / "plugins" / f"{plugin_name}.yaml"
    shutil.copy2(install_path / "plugin.yaml", config_dest)

    # Add to sys.path so Python can import the package
    install_str = str(install_path)
    if install_str not in sys.path:
        sys.path.insert(0, install_str)

    # Register the plugin dynamically
    registered = False
    error_msg = ""
    if _manager:
        try:
            # Import the plugin module
            module = importlib.import_module(f"{package_name}.plugin")

            # Find the plugin class (subclass of BasePlugin)
            from pluginforge import BasePlugin
            plugin_class = None
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, BasePlugin)
                    and attr is not BasePlugin
                ):
                    plugin_class = attr
                    break

            if not plugin_class:
                error_msg = f"Keine BasePlugin-Unterklasse in {package_name}.plugin gefunden."
            else:
                # Register with pluggy
                plugin_instance = plugin_class()
                _manager.register_plugin(plugin_instance, plugin_config)
                registered = True
        except Exception as e:
            error_msg = str(e)

    # Add to enabled list in app.yaml
    app_yaml_path = _base_dir / "config" / "app.yaml"
    if app_yaml_path.exists():
        app_config = _read_yaml(app_yaml_path)
        enabled = app_config.setdefault("plugins", {}).setdefault("enabled", [])
        disabled = app_config["plugins"].setdefault("disabled", [])
        if plugin_name not in enabled:
            enabled.append(plugin_name)
        if plugin_name in disabled:
            disabled.remove(plugin_name)
        _write_yaml(app_yaml_path, app_config)

    return {
        "plugin": plugin_name,
        "version": plugin_meta.get("version", "unknown"),
        "package": package_name,
        "installed_path": str(install_path),
        "registered": registered,
        "error": error_msg or None,
        "status": "installed" if registered else "installed_pending_restart",
        "message": (
            f"Plugin '{plugin_name}' installiert und aktiviert."
            if registered
            else f"Plugin '{plugin_name}' installiert. Neustart erforderlich für Aktivierung."
            + (f" Fehler: {error_msg}" if error_msg else "")
        ),
    }


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
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
