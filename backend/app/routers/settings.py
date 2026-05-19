"""Settings API for reading and writing app and plugin configurations.

All writes route through ``app.config_overlay`` so the project
tree (``backend/config/...``) stays untouched at runtime. Reads
deep-merge project defaults + the user-overlay layer under
``get_data_dir() / "config"``. See the overlay module docstring
for the full rationale (dev-docker write-permission quirk +
filesystem-isolation rule).
"""

import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config_overlay

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
    config = config_overlay.read_app_config_merged()
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

    current = config_overlay.load_app_config_for_edit()
    author = current.setdefault("author", {})
    name = (author.get("name") or "").strip()
    pen_names_raw = author.get("pen_names") or []
    pen_names = [n.strip() for n in pen_names_raw if isinstance(n, str) and n.strip()]

    if cleaned == name:
        return {"name": name, "pen_names": pen_names}
    if cleaned in pen_names:
        return {"name": name, "pen_names": pen_names}

    if not name:
        author["name"] = cleaned
    else:
        pen_names.append(cleaned)
        author["pen_names"] = pen_names

    config_overlay.write_user_app_config(current)
    _refresh_manager_app_config()

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
    current = config_overlay.load_app_config_for_edit()

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

    config_overlay.write_user_app_config(current)

    # Reload config in the manager so changes take effect
    _refresh_manager_app_config()

    # Invalidate the plugin-status cache so the editor sees fresh state
    from app.main import invalidate_plugin_status_cache

    invalidate_plugin_status_cache()

    return current


# --- Plugin Settings ---


@router.get("/plugins")
def list_plugin_configs() -> dict[str, Any]:
    """List all plugin configurations with their settings.

    Returns the merged view (bundled defaults + user-overlay
    overrides) per plugin known via either layer.
    """
    result: dict[str, Any] = {}
    for plugin_name in config_overlay.list_merged_plugin_names():
        result[plugin_name] = config_overlay.read_plugin_config_merged(plugin_name)
    return result


@router.get("/plugins/discovered")
def list_discovered_plugins() -> list[dict[str, Any]]:
    """List plugins with configs that are registered (entry point, ZIP, or bundled)."""
    if not _manager:
        return []

    # Plugin discovery uses the MERGED app config so the UI reflects
    # Settings writes (enabled/disabled toggles, etc.) immediately
    # after a PATCH without waiting for a restart.
    app_config = config_overlay.read_app_config_merged()
    plugins_cfg = app_config.get("plugins", {})
    enabled = set(plugins_cfg.get("enabled", []) or [])
    disabled = set(plugins_cfg.get("disabled", []) or [])
    active = _active_plugin_names()
    available = _collect_available_plugins(active)

    # V060: per-plugin DiscoveryResult.states from PluginForge's last
    # discovery pass (pluginforge v0.6.0+). Carries filter_reason +
    # structured load_error.user_facing_message for the Settings UI
    # status column. Returns None before the first discover; in that
    # case the new fields surface as None and the frontend renders
    # the row without a status badge.
    last_result = _manager.get_last_discovery_result()
    pf_states = last_result.states if last_result is not None else {}

    result = []
    for name in config_overlay.list_merged_plugin_names():
        if name not in available:
            continue
        cfg = config_overlay.read_plugin_config_merged(name)
        tier = _resolve_license_tier(cfg)
        has_license = _check_plugin_license(name, tier)
        # About-Dialog (2026-05-18): include display_name (i18n dict)
        # + version + description from the canonical plugin config.
        # Empty/missing fields surface as ``None`` / ``{}`` so the
        # frontend renders the slug or hides the row gracefully.
        # Backward-compatible addition — existing consumers
        # (PluginSettings.tsx) ignore extra fields.
        plugin_meta = (
            cfg.get("plugin", {}) if isinstance(cfg.get("plugin"), dict) else {}
        )
        pf_state = pf_states.get(name)
        result.append(
            {
                "name": name,
                "has_config": True,
                "enabled": name in enabled and name not in disabled,
                "loaded": name in active,
                "license_tier": tier,
                "has_license": has_license,
                "display_name": plugin_meta.get("display_name") or {},
                "description": plugin_meta.get("description") or {},
                "version": plugin_meta.get("version") or None,
                "filter_reason": (
                    pf_state.filter_reason if pf_state is not None else None
                ),
                "load_error_message": (
                    pf_state.load_error.user_facing_message
                    if pf_state is not None and pf_state.load_error is not None
                    else None
                ),
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

    from app.routers.plugin_install import get_installed_plugins_dir

    installed_dir = get_installed_plugins_dir()
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


def _resolve_license_tier(cfg: dict[str, Any]) -> str:
    """Resolve the license tier from a plugin's merged config dict.

    Explicit ``plugin.license_tier`` (``"core"`` / ``"premium"``)
    wins; otherwise fall back to ``plugin.license`` (``MIT``,
    ``Free`` -> ``core``; anything else -> ``premium``).
    """
    meta = cfg.get("plugin", {}) if isinstance(cfg.get("plugin"), dict) else {}
    explicit = meta.get("license_tier", "")
    if explicit in ("core", "premium"):
        return str(explicit)
    license_type = meta.get("license", "MIT")
    return "premium" if license_type not in ("MIT", "free", "Free") else "core"


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
    """Create a new plugin configuration file in the user overlay."""
    if config_overlay.plugin_config_exists(body.name):
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

    config_overlay.write_user_plugin_config(body.name, config)
    return config


@router.delete("/plugins/{plugin_name}")
def delete_plugin_config(plugin_name: str) -> dict[str, str]:
    """Delete a plugin configuration and disable the plugin.

    Only the user-overlay copy is removed; bundled defaults in the
    project tree are left untouched. If the plugin only exists in
    the user overlay, this removes it entirely; if it has a bundled
    counterpart, subsequent reads will fall back to the bundled
    defaults.
    """
    if not config_overlay.plugin_config_exists(plugin_name):
        raise HTTPException(status_code=404, detail=f"Plugin config '{plugin_name}' not found")

    # Deactivate if active
    if _manager and plugin_name in _active_plugin_names():
        _manager.deactivate_plugin(plugin_name)

    # Remove from enabled list in the user overlay so the deletion
    # survives a restart.
    app_config = config_overlay.load_app_config_for_edit()
    enabled = app_config.get("plugins", {}).get("enabled", [])
    if plugin_name in enabled:
        enabled.remove(plugin_name)
        config_overlay.write_user_app_config(app_config)
        _refresh_manager_app_config()

    config_overlay.delete_user_plugin_config(plugin_name)
    return {"plugin": plugin_name, "status": "removed"}


@router.get("/plugins/{plugin_name}")
def get_plugin_config(plugin_name: str) -> dict[str, Any]:
    """Get configuration for a specific plugin (merged view)."""
    if not config_overlay.plugin_config_exists(plugin_name):
        raise HTTPException(status_code=404, detail=f"Plugin config '{plugin_name}' not found")
    return config_overlay.read_plugin_config_merged(plugin_name)


class PluginSettingsUpdate(BaseModel):
    settings: dict[str, Any]


@router.patch("/plugins/{plugin_name}")
def update_plugin_settings(plugin_name: str, body: PluginSettingsUpdate) -> dict[str, Any]:
    """Update the ``settings`` section of a plugin config.

    Writes to the user-overlay layer only. The bundled defaults
    file in the project tree is never modified, so a future
    upstream change to ``settings:`` defaults reappears whenever
    the user-overlay file is removed.
    """
    if not config_overlay.plugin_config_exists(plugin_name):
        raise HTTPException(status_code=404, detail=f"Plugin config '{plugin_name}' not found")

    current = config_overlay.load_plugin_config_for_edit(plugin_name)
    current.setdefault("settings", {}).update(body.settings)
    config_overlay.write_user_plugin_config(plugin_name, current)

    # Update loaded plugin config if active
    if _manager:
        plugin = _manager.get_plugin(plugin_name)
        if plugin:
            plugin.config = current

    return current


# --- Plugin Enable/Disable ---


@router.post("/plugins/{plugin_name}/enable")
def enable_plugin(plugin_name: str) -> dict[str, str]:
    """Enable a plugin in the user-overlay app config."""
    config = config_overlay.load_app_config_for_edit()

    enabled = config.setdefault("plugins", {}).setdefault("enabled", [])
    disabled = config["plugins"].setdefault("disabled", [])

    if plugin_name not in enabled:
        enabled.append(plugin_name)
    if plugin_name in disabled:
        disabled.remove(plugin_name)

    config_overlay.write_user_app_config(config)
    _refresh_manager_app_config()
    return {"plugin": plugin_name, "status": "enabled"}


@router.post("/plugins/{plugin_name}/disable")
def disable_plugin(plugin_name: str) -> dict[str, str]:
    """Disable a plugin in the user-overlay app config."""
    config = config_overlay.load_app_config_for_edit()

    enabled = config.setdefault("plugins", {}).setdefault("enabled", [])
    disabled = config["plugins"].setdefault("disabled", [])

    if plugin_name in enabled:
        enabled.remove(plugin_name)
    if plugin_name not in disabled:
        disabled.append(plugin_name)

    config_overlay.write_user_app_config(config)
    _refresh_manager_app_config()

    # Deactivate the plugin if currently active
    if _manager and plugin_name in _active_plugin_names():
        _manager.deactivate_plugin(plugin_name)

    return {"plugin": plugin_name, "status": "disabled"}


# --- Helpers ---


def _refresh_manager_app_config() -> None:
    """Re-merge the plugin manager's app-config snapshot.

    Uses ``PluginManager.refresh_config`` (pluginforge v0.6.0 public
    API), which replaces the snapshot in-place AND notifies active
    plugins via ``on_config_changed(old, new)``. After a write to
    the user overlay, callers of ``manager.get_app_config()`` see
    the merged view without a backend restart. Plugins that do not
    override the hook keep the no-op default.
    """
    if not _manager:
        return
    merged = config_overlay.read_app_config_merged()
    errors = _manager.refresh_config(merged)
    for err in errors:
        logger.warning(
            "Plugin '%s' on_config_changed raised (%s): %s",
            err.name,
            err.phase,
            err.user_facing_message,
        )
