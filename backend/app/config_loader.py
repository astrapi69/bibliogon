"""Four-layer application config loader + secrets-override helpers.

Extracted from ``app/main.py`` (God-file split #15, 2026-06-14). Reads
project app.yaml + user overlay + secrets override + env-vars and
deep-merges them (lists replace, dicts merge). No dependency on the
FastAPI app or the plugin manager. main.py re-exports _load_app_config
and _get_user_override_path for external importers.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "app.yaml"


def _get_user_override_path() -> Path:
    """Return the user-home secrets-override file path.

    Gradle-style layered config: project ``app.yaml`` provides
    defaults, this file (gitignored, outside the project tree)
    overlays user secrets, env-vars override both.

    XDG-conformant on Linux/macOS, ``%APPDATA%`` on Windows. Set
    ``XDG_CONFIG_HOME`` to relocate; otherwise defaults to
    ``~/.config/bibliogon/secrets.yaml``.
    """
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if appdata:
            return Path(appdata) / "bibliogon" / "secrets.yaml"
        return Path.home() / "AppData" / "Roaming" / "bibliogon" / "secrets.yaml"
    xdg_config = os.environ.get("XDG_CONFIG_HOME")
    if xdg_config:
        return Path(xdg_config) / "bibliogon" / "secrets.yaml"
    return Path.home() / ".config" / "bibliogon" / "secrets.yaml"


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Recursive dict merge with override-wins semantics.

    Lists are REPLACED, not concatenated. Non-dict values in ``override``
    replace the corresponding ``base`` value.

    Returns a new dict; ``base`` and ``override`` are not mutated.
    """
    out: dict[str, Any] = dict(base)
    for key, override_value in override.items():
        base_value = out.get(key)
        if isinstance(base_value, dict) and isinstance(override_value, dict):
            out[key] = _deep_merge(base_value, override_value)
        else:
            out[key] = override_value
    return out


# Mapping of env-var name -> dotted-path inside the merged config dict.
# Initial scope: app.yaml ``ai.api_key`` only. Plugin yaml secrets follow
# in a separate refactor (PluginManager loader has its own config path
# and reload machinery).
_ENV_SECRET_OVERRIDES: dict[str, tuple[str, ...]] = {
    "BIBLIOGON_AI_API_KEY": ("ai", "api_key"),
}


def _apply_env_overrides(config: dict[str, Any]) -> dict[str, Any]:
    """Overlay environment-variable values onto the merged config dict.

    Env-vars sit at the top of the config chain (project < override <
    env). Used for CI/Docker/12-Factor deployment where secrets come
    from the orchestrator. Returns a new dict; ``config`` is not
    mutated.
    """
    out = dict(config)
    for env_name, path in _ENV_SECRET_OVERRIDES.items():
        env_value = os.environ.get(env_name)
        if env_value is None or env_value == "":
            continue
        # Walk into nested dicts, creating them as needed.
        cursor: dict[str, Any] = out
        for segment in path[:-1]:
            existing = cursor.get(segment)
            cursor[segment] = dict(existing) if isinstance(existing, dict) else {}
            cursor = cursor[segment]
        cursor[path[-1]] = env_value
    return out


def _load_override_file(path: Path) -> dict[str, Any]:
    """Read the user-override yaml file. Returns ``{}`` when the file
    is missing, malformed, or yields a non-dict top-level value.

    Backend MUST start successfully even with a corrupt override file:
    the goal of the override layer is to add secrets, not to gate
    startup. A WARNING log on the first call is enough to surface the
    issue without crashing.
    """
    if not path.exists():
        return {}
    try:
        with path.open(encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as exc:
        logger.warning(
            "Invalid YAML in override file %s: %s. Continuing with project config only.",
            path,
            exc,
        )
        return {}
    except OSError as exc:
        logger.warning(
            "Could not read override file %s: %s. Continuing with project config only.",
            path,
            exc,
        )
        return {}
    if data is None:
        return {}
    if not isinstance(data, dict):
        logger.warning(
            "Override file %s top-level is %s, expected mapping. "
            "Continuing with project config only.",
            path,
            type(data).__name__,
        )
        return {}
    return data


def _load_app_config() -> dict[str, Any]:
    """Read app.yaml + user overlay + secrets override + env-vars.

    Four-layer merge:

    1. Project ``app.yaml`` (defaults shipped with the app).
    2. User-overlay ``<data_dir>/config/app.yaml`` (Settings UI
       writes; see ``app.config_overlay``).
    3. Secrets override ``~/.config/bibliogon/secrets.yaml``
       (long-standing user-home secrets file).
    4. Environment variables (``BIBLIOGON_AI_API_KEY`` etc.).

    Higher layers win. Lists REPLACE; dicts deep-merge. Called
    per-request where freshness matters; cheap (small yaml files,
    no caching needed).
    """
    from app import config_overlay

    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            project = yaml.safe_load(f) or {}
    except Exception:
        project = {}
    user_overlay = config_overlay._read_yaml(config_overlay._user_app_path())
    override = _load_override_file(_get_user_override_path())
    merged = _deep_merge(project, user_overlay)
    merged = _deep_merge(merged, override)
    return _apply_env_overrides(merged)


def _has_project_secret_without_override() -> bool:
    """True when ``app.yaml`` carries a non-empty ``ai.api_key`` AND no
    override file or env-var supersedes it. Used for the one-shot
    deprecation warning at startup so users see the migration hint.
    """
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            project = yaml.safe_load(f) or {}
    except Exception:
        return False
    project_key = (
        project.get("ai", {}).get("api_key", "") if isinstance(project.get("ai"), dict) else ""
    )
    if not isinstance(project_key, str) or not project_key.strip():
        return False
    if _get_user_override_path().exists():
        return False
    if os.environ.get("BIBLIOGON_AI_API_KEY"):
        return False
    return True
