"""User-editable launcher settings stored in the platformdirs config dir.

Lives alongside ``install.json`` and ``install.log`` at
``platformdirs.user_config_dir("bibliogon") / "settings.json"``.

All reads fail open: a missing or corrupt file returns the built-in
defaults. The launcher must never crash because of a broken settings
file. All writes are best-effort; a caller that cares about persisting
the change must call ``read_settings`` afterwards to confirm.

Schema is intentionally small and flat so future additions do not
require a migration. ``read_settings`` merges file values over
defaults so new keys added to DEFAULTS automatically appear without
rewriting existing user files.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from platformdirs import user_config_dir

logger = logging.getLogger("bibliogon_launcher.settings")

APP_NAME = "bibliogon"
SETTINGS_FILENAME = "settings.json"

DEFAULTS: dict[str, Any] = {
    "auto_update_check": True,
}


def settings_path() -> Path:
    return Path(user_config_dir(APP_NAME)) / SETTINGS_FILENAME


def read_settings() -> dict[str, Any]:
    """Return the merged settings dict (defaults overlaid with file values).

    Fail-open on missing file, malformed JSON, non-UTF-8 bytes, or any
    OS error. Unknown keys in the file are preserved so forward-
    compatibility with older launcher versions is automatic.
    """
    try:
        raw = settings_path().read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            return dict(DEFAULTS)
        return {**DEFAULTS, **data}
    except (FileNotFoundError, OSError, json.JSONDecodeError, UnicodeDecodeError):
        return dict(DEFAULTS)


def write_settings(settings: dict[str, Any]) -> None:
    """Persist settings to disk. Logs and swallows write errors."""
    path = settings_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.warning("could not write settings file: %s", exc)


def get(key: str) -> Any:
    """Return a single setting value, falling back to the default."""
    return read_settings().get(key, DEFAULTS.get(key))


def update(key: str, value: Any) -> None:
    """Set a single setting value and persist. Read-modify-write.

    Named ``update`` (not ``set``) to avoid shadowing the builtin.
    """
    current = read_settings()
    current[key] = value
    write_settings(current)
