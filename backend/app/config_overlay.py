"""Project-tree + user-overlay config merge helpers.

Bibliogon ships configuration in two layers:

1. **Project tree** (read at runtime, never written from runtime
   code):
   - ``backend/config/app.yaml`` — auto-created from
     ``app.yaml.example`` on first start; on legacy installs may
     also carry user edits from before the overlay landed.
   - ``backend/config/plugins/*.yaml`` — bundled plugin defaults.

2. **User overlay** (writable, under ``get_data_dir() / "config"``):
   runtime writes from the Settings UI and plugin
   install / uninstall.

Read merges project + user (user wins; dicts deep-merge; lists
replace). Write targets ONLY the user overlay; the project tree
stays untouched at runtime.

Reason: dev-docker bind-mounts ``./backend:/app`` so the project
tree is not writable by the container user. Production Docker
(``USER bibliogon`` + ``chown -R bibliogon:bibliogon /app``)
makes the project tree writable, but the divergence between
environments was a footgun — the v0.31.0 Phase 2 sweep
fixed ``backup_history.json`` and ``plugins/installed/`` the same
way; this module closes the remaining 10+ write sites in
``settings.py`` and ``plugin_install.py``.

See ``.claude/rules/lessons-learned.md`` "Filesystem isolation"
for the broader rule. The unit + integration tests in
``test_config_overlay.py`` pin the merge semantics and the
"writes never touch the project tree" invariant.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.paths import get_data_dir
from app.yaml_io import read_yaml_roundtrip, write_yaml_roundtrip

logger = logging.getLogger(__name__)

# Resolved at import time; tests that need a different project
# layer reassign this attribute via ``monkeypatch.setattr``.
_PROJECT_CONFIG_DIR: Path = Path(__file__).resolve().parent.parent / "config"


def get_project_config_dir() -> Path:
    """Project-tree config directory (read-only at runtime)."""
    return _PROJECT_CONFIG_DIR


def set_project_config_dir(path: Path) -> None:
    """Override the project config dir for tests.

    Production code does NOT call this; tests use it to point the
    project layer at a tmp directory so the merge logic stays
    exercised end-to-end without depending on the real bundled
    plugin configs.
    """
    global _PROJECT_CONFIG_DIR
    _PROJECT_CONFIG_DIR = path


def get_user_config_dir() -> Path:
    """User-overlay config directory: writable, under ``get_data_dir()``.

    Re-resolved on every call so test env-var overrides
    (``BIBLIOGON_DATA_DIR``) take effect after this module is
    imported.
    """
    return get_data_dir() / "config"


def get_user_plugins_dir() -> Path:
    """User-overlay plugins config directory."""
    return get_user_config_dir() / "plugins"


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Recursive dict merge: override wins, lists REPLACE.

    Same semantics as ``app.main._deep_merge`` so secrets-overlay
    and config-overlay behave identically. Returns a NEW dict;
    inputs are not mutated.
    """
    out: dict[str, Any] = dict(base)
    for key, override_value in override.items():
        base_value = out.get(key)
        if isinstance(base_value, dict) and isinstance(override_value, dict):
            out[key] = deep_merge(base_value, override_value)
        else:
            out[key] = override_value
    return out


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = read_yaml_roundtrip(path)
    except Exception as exc:  # noqa: BLE001 - log + degrade, do not crash
        logger.warning("Could not read %s: %s. Treating as empty.", path, exc)
        return {}
    return data if isinstance(data, dict) else {}


def _project_app_path() -> Path:
    return get_project_config_dir() / "app.yaml"


def _user_app_path() -> Path:
    return get_user_config_dir() / "app.yaml"


def _project_plugin_path(name: str) -> Path:
    return get_project_config_dir() / "plugins" / f"{name}.yaml"


def _user_plugin_path(name: str) -> Path:
    return get_user_plugins_dir() / f"{name}.yaml"


def read_app_config_merged() -> dict[str, Any]:
    """Read app.yaml with project + user-overlay deep-merge.

    Either layer may be missing; both missing yields ``{}``.
    Comments are NOT preserved by deep-merge; callers that need to
    write the result back to disk MUST use ``load_app_config_for_edit``
    instead so ruamel's round-trip can preserve ``# INTERNAL``
    markers and quote styles.
    """
    project = _read_yaml(_project_app_path())
    user = _read_yaml(_user_app_path())
    return deep_merge(project, user)


def load_app_config_for_edit() -> dict[str, Any]:
    """Load app.yaml as a ruamel ``CommentedMap`` for round-trip writes.

    Prefers the user-overlay file (which already represents the
    user's current state with their own comments) and falls back
    to the project file only on first edit, so the bundled
    comments seed the user-overlay copy. Returns an empty dict
    when neither file exists.

    Use this for any code path that loads, mutates, then writes
    back — the merge-based reader strips comments.

    ``CommentedMap`` is dict-compatible at the type-check level,
    so the declared ``dict[str, Any]`` return type is honoured.
    """
    user_path = _user_app_path()
    if user_path.exists():
        loaded = read_yaml_roundtrip(user_path)
        return loaded if isinstance(loaded, dict) else {}
    project_path = _project_app_path()
    if project_path.exists():
        loaded = read_yaml_roundtrip(project_path)
        return loaded if isinstance(loaded, dict) else {}
    return {}


def write_user_app_config(data: dict[str, Any]) -> None:
    """Write app config to the user overlay ONLY.

    Creates the user config dir if missing. Never touches the
    project tree's app.yaml.
    """
    path = _user_app_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    write_yaml_roundtrip(path, data)


def user_app_config_exists() -> bool:
    """True iff the user-overlay app.yaml exists."""
    return _user_app_path().exists()


def read_plugin_config_merged(name: str) -> dict[str, Any]:
    """Read plugin config with bundled defaults + user-overlay merge.

    Comments are stripped (deep-merge constructs a plain dict).
    Callers that intend to write the result back MUST use
    ``load_plugin_config_for_edit`` to keep ``# INTERNAL`` markers
    intact.
    """
    project = _read_yaml(_project_plugin_path(name))
    user = _read_yaml(_user_plugin_path(name))
    return deep_merge(project, user)


def load_plugin_config_for_edit(name: str) -> dict[str, Any]:
    """Load plugin config as a ruamel ``CommentedMap`` for editing.

    Prefers the user-overlay file, falls back to the bundled file
    on first edit so its comments seed the user-overlay copy.
    Returns an empty dict when neither exists.
    """
    user_path = _user_plugin_path(name)
    if user_path.exists():
        loaded = read_yaml_roundtrip(user_path)
        return loaded if isinstance(loaded, dict) else {}
    project_path = _project_plugin_path(name)
    if project_path.exists():
        loaded = read_yaml_roundtrip(project_path)
        return loaded if isinstance(loaded, dict) else {}
    return {}


def write_user_plugin_config(name: str, data: dict[str, Any]) -> None:
    """Write plugin config to the user overlay ONLY.

    Creates the user plugins dir if missing.
    """
    path = _user_plugin_path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    write_yaml_roundtrip(path, data)


def delete_user_plugin_config(name: str) -> bool:
    """Remove the user-overlay file for a plugin if it exists.

    Returns True if a file was deleted, False if nothing was there.
    Never touches the bundled (project) file.
    """
    path = _user_plugin_path(name)
    if path.exists():
        path.unlink()
        return True
    return False


def plugin_config_exists(name: str) -> bool:
    """True iff either the bundled OR the user-overlay file exists."""
    return _project_plugin_path(name).exists() or _user_plugin_path(name).exists()


def has_user_plugin_config(name: str) -> bool:
    """True iff the user-overlay file exists for this plugin."""
    return _user_plugin_path(name).exists()


def migrate_user_overlay_enabled_list() -> tuple[list[str], bool]:
    """Append project-tree plugins missing from user-overlay's enabled list.

    Closes USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01 (P2 backlog 2026-05-18).
    Background: ``deep_merge`` treats lists as REPLACE, not union. So when
    a user-overlay's ``plugins.enabled`` was written BEFORE a new plugin
    shipped, the stale list silently filters the new plugin out — its
    entry-point is discovered but it's never activated. This was the
    plugin-comics Session 1 smoke's 404 root cause.

    Semantics:

    - For each plugin in the project-tree's ``enabled`` list:

      - If NOT in user-overlay's ``enabled`` AND NOT in user-overlay's
        ``disabled``: append to user-overlay's ``enabled``.
      - If in user-overlay's ``disabled``: respect the explicit opt-out;
        do NOT add to ``enabled``.

    - Atomic write: all newly-appended plugins land in a single write,
      or none do (no partial migration on disk).
    - No-op when the user-overlay file does NOT exist: fresh installs
      get the full enabled list from the project-tree's ``app.yaml``
      (auto-created from ``app.yaml.example`` on first start), so no
      migration is needed.
    - Idempotent: running this function twice in a row produces the
      same result on disk + zero additional writes.

    Returns ``(newly_added, did_write)``:

    - ``newly_added``: list of plugin names appended to the user-overlay
      ``enabled`` list in this call (empty when the diff was empty).
    - ``did_write``: True iff this call actually mutated the user-overlay
      file on disk. ``newly_added == []`` implies ``did_write is False``.
    """
    if not user_app_config_exists():
        return [], False

    project = _read_yaml(_project_app_path())
    user = _read_yaml(_user_app_path())

    project_enabled = list(project.get("plugins", {}).get("enabled") or [])
    user_plugins = user.setdefault("plugins", {})
    if not isinstance(user_plugins, dict):
        # Malformed overlay; do not attempt repair, just no-op.
        return [], False
    user_enabled = list(user_plugins.get("enabled") or [])
    user_disabled = set(user_plugins.get("disabled") or [])

    user_enabled_set = set(user_enabled)
    newly_added = [
        name
        for name in project_enabled
        if name not in user_enabled_set and name not in user_disabled
    ]
    if not newly_added:
        return [], False

    user_plugins["enabled"] = user_enabled + newly_added
    # Use load_app_config_for_edit to preserve any comments + quote styles
    # in the user-overlay yaml (the user may have hand-edited it).
    editable = load_app_config_for_edit()
    if isinstance(editable, dict):
        editable_plugins = editable.setdefault("plugins", {})
        if isinstance(editable_plugins, dict):
            existing = list(editable_plugins.get("enabled") or [])
            for name in newly_added:
                if name not in existing:
                    existing.append(name)
            editable_plugins["enabled"] = existing
            write_yaml_roundtrip(_user_app_path(), editable)
            logger.info(
                "User-overlay enabled-list migration: appended %s",
                ", ".join(newly_added),
            )
            return newly_added, True

    # Fallback if load_app_config_for_edit returned an unexpected shape.
    write_user_app_config(user)
    logger.info(
        "User-overlay enabled-list migration (fallback): appended %s",
        ", ".join(newly_added),
    )
    return newly_added, True


def list_merged_plugin_names() -> list[str]:
    """Return all plugin names known via either project or user layer.

    Sorted, deduplicated. Excludes filenames that aren't ``.yaml``.
    """
    names: set[str] = set()
    project_plugins = get_project_config_dir() / "plugins"
    if project_plugins.exists():
        names.update(p.stem for p in project_plugins.glob("*.yaml"))
    user_plugins = get_user_plugins_dir()
    if user_plugins.exists():
        names.update(p.stem for p in user_plugins.glob("*.yaml"))
    return sorted(names)
