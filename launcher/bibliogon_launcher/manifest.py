"""Install manifest for tracking Bibliogon installation state.

The manifest is a small JSON file stored in the platform-specific user
config directory (``platformdirs.user_config_dir("bibliogon")``):

- Linux:   ``~/.config/bibliogon/install.json``
- macOS:   ``~/Library/Application Support/bibliogon/install.json``
- Windows: ``%APPDATA%\\bibliogon\\install.json``

Written by the launcher after a successful install and read on every
startup to determine whether to show the install UI or the main UI.
"""

from __future__ import annotations

import json
import platform
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from platformdirs import user_config_dir

APP_NAME = "bibliogon"
MANIFEST_FILENAME = "install.json"


def manifest_path() -> Path:
    """Return the platform-specific path for the install manifest."""
    return Path(user_config_dir(APP_NAME)) / MANIFEST_FILENAME


def read_manifest() -> dict[str, Any] | None:
    """Read the install manifest, or None if absent/malformed.

    Fails open: a corrupt or unreadable manifest is treated as
    absent (no installation), never as a crash.
    """
    path = manifest_path()
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def write_manifest(install_dir: Path, version: str) -> None:
    """Write the install manifest after a successful installation."""
    path = manifest_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "version": version,
        "install_dir": str(install_dir),
        "installed_at": datetime.now(timezone.utc).isoformat(),
        "platform": platform.system().lower(),
    }
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def delete_manifest() -> None:
    """Remove the install manifest. No-op if already absent."""
    path = manifest_path()
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def install_dir_from_manifest() -> Path | None:
    """Return the install directory from the manifest, or None.

    Returns None if the manifest is absent, malformed, or the
    ``install_dir`` field is missing.
    """
    data = read_manifest()
    if data is None:
        return None
    raw = data.get("install_dir")
    if not raw:
        return None
    return Path(raw)


# --- Cleanup state persistence ---

CLEANUP_FILENAME = "cleanup.json"

CLEANUP_STEPS = (
    "compose_down",
    "remove_volumes",
    "remove_images",
    "rmtree",
    "delete_manifest",
)


def cleanup_path() -> Path:
    """Return the platform-specific path for the cleanup state file."""
    return Path(user_config_dir(APP_NAME)) / CLEANUP_FILENAME


def read_cleanup_pending() -> dict[str, Any] | None:
    """Read the cleanup state, or None if absent/malformed. Fail-open."""
    path = cleanup_path()
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def write_cleanup_pending(install_dir: Path) -> None:
    """Write a fresh cleanup state with all steps pending (False)."""
    path = cleanup_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "pending_since": datetime.now(timezone.utc).isoformat(),
        "install_dir": str(install_dir),
        "steps": {step: False for step in CLEANUP_STEPS},
    }
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def update_cleanup_step(step: str, success: bool) -> None:
    """Mark a single cleanup step as completed. Fail-open on write errors."""
    data = read_cleanup_pending()
    if data is None:
        return
    steps = data.get("steps", {})
    steps[step] = success
    data["steps"] = steps
    try:
        cleanup_path().write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError:
        pass


def delete_cleanup_pending() -> None:
    """Remove the cleanup state file. No-op if absent."""
    try:
        cleanup_path().unlink()
    except FileNotFoundError:
        pass


def all_cleanup_done(data: dict[str, Any] | None) -> bool:
    """True if every cleanup step is marked True."""
    if data is None:
        return True
    steps = data.get("steps", {})
    return all(steps.get(s, False) for s in CLEANUP_STEPS)
