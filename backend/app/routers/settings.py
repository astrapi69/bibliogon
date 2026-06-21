"""Settings API for reading and writing app and plugin configurations.

All writes route through ``app.config_overlay`` so the project
tree (``backend/config/...``) stays untouched at runtime. Reads
deep-merge project defaults + the user-overlay layer under
``get_data_dir() / "config"``. See the overlay module docstring
for the full rationale (dev-docker write-permission quirk +
filesystem-isolation rule).
"""

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config_overlay
from app.services.plugin_discovery import collect_available_plugins
from app.services.plugin_license import check_plugin_license, resolve_license_tier
from app.services.secrets_management import secrets_managed_externally

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])

# Dotted paths into the AppSettingsUpdate body that name secrets.
# When an override file exists OR an env-var is set for that secret,
# the field is stripped from PATCH bodies before write so the UI
# cannot accidentally clobber the externally-managed value.
# Initial scope mirrors _ENV_SECRET_OVERRIDES in app.main: ai.api_key.
_SECRET_FIELDS: tuple[tuple[str, str], ...] = (("ai", "api_key"),)

# DASHBOARD-PAGINATION-LOAD-MORE-01 C2: allowed page-size values for
# the dashboard "Load more" paginator. Matches the frontend
# PageSizeSelector dropdown. Both keys validated together so the
# Dashboard / ArticleList paginator can persist user selection
# without the backend silently accepting nonsense values.
_DASHBOARD_PAGE_SIZE_KEYS: tuple[str, ...] = (
    "books_page_size",
    "articles_page_size",
)
_DASHBOARD_PAGE_SIZE_ALLOWED: frozenset[int] = frozenset({10, 25, 50, 100})


def _validate_dashboard_page_sizes(ui: dict[str, Any]) -> None:
    """Reject ui.dashboard.{books,articles}_page_size values outside
    the allowed enum. Raises 400 with a precise message naming the
    offending key + the allowed set. Silent on missing keys."""
    dashboard = ui.get("dashboard")
    if not isinstance(dashboard, dict):
        return
    for key in _DASHBOARD_PAGE_SIZE_KEYS:
        if key not in dashboard:
            continue
        value = dashboard[key]
        if value not in _DASHBOARD_PAGE_SIZE_ALLOWED:
            allowed = sorted(_DASHBOARD_PAGE_SIZE_ALLOWED)
            raise HTTPException(
                status_code=400,
                detail=(f"ui.dashboard.{key} must be one of {allowed}; got {value!r}"),
            )


def _validate_ui_defaults(ui: dict[str, Any]) -> None:
    """Reject ui.defaults.{book_type,content_type} values outside the
    registry-defined allowed sets. Raises 400 with a precise message
    naming the offending key + the allowed set. Silent on missing keys.

    SSoT: the allowed ids come from book-types.yaml / content-types.yaml
    via the registry services, never a hardcoded list here. Adding a new
    book/content type to the YAML automatically widens the allowed set.
    """
    defaults = ui.get("defaults")
    if not isinstance(defaults, dict):
        return

    from app.services.registries.book_type_registry import book_type_ids
    from app.services.registries.content_type_registry import content_type_ids

    checks: tuple[tuple[str, Any], ...] = (
        ("book_type", book_type_ids),
        ("content_type", content_type_ids),
    )
    for key, allowed_fn in checks:
        if key not in defaults:
            continue
        value = defaults[key]
        allowed = allowed_fn()
        if value not in allowed:
            raise HTTPException(
                status_code=400,
                detail=(f"ui.defaults.{key} must be one of {sorted(allowed)}; got {value!r}"),
            )


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
    config["_secrets_managed_externally"] = secrets_managed_externally()
    return config


class AppSettingsUpdate(BaseModel):
    app: dict[str, Any] | None = None
    ui: dict[str, Any] | None = None
    author: dict[str, Any] | None = None
    plugins: dict[str, Any] | None = None
    ai: dict[str, Any] | None = None
    editor: dict[str, Any] | None = None
    # behavior.skip_non_destructive_confirmations (read by AppDialog).
    # Without this field the Settings>Verhalten toggle was silently
    # dropped at validation and never persisted.
    behavior: dict[str, Any] | None = None
    # AR-02 Phase 2.1: settings-managed list of article topics. The
    # ArticleEditor topic dropdown reads from app.yaml topics: [...].
    topics: list[str] | None = None
    # #477 Phase 2: auto-update-check preferences + state
    # (auto_check, check_interval, last_check_at, dismissed_version).
    updates: dict[str, Any] | None = None


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
    # Hold the overlay lock across the whole read-modify-write so two
    # overlapping PATCHes cannot read the same baseline and clobber each
    # other's keys (settings-clobber data-loss class).
    with config_overlay.app_config_lock():
        current = config_overlay.load_app_config_for_edit()

        if secrets_managed_externally():
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

        if body.ui is not None:
            # Validate enum-constrained dashboard keys (C2) BEFORE merging
            # so an invalid request never reaches disk.
            _validate_dashboard_page_sizes(body.ui)
            # Validate ui.defaults.{book_type,content_type} against the
            # type registries (SSoT) before write.
            _validate_ui_defaults(body.ui)

        if body.app is not None:
            current.setdefault("app", {}).update(body.app)
        if body.behavior is not None:
            current.setdefault("behavior", {}).update(body.behavior)
        if body.updates is not None:
            current.setdefault("updates", {}).update(body.updates)
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
    """List plugins with configs that are registered (entry point, ZIP, or bundled).

    PluginForge v0.9.0 ``inspect_plugin(name)`` is the single-call
    aggregator for per-plugin state + identity. It replaces the
    five-accessor pattern (``get_active_plugins`` +
    ``get_last_discovery_result`` + per-state lookup +
    ``load_error.user_facing_message`` + ``activated`` membership)
    that this endpoint composed by hand. Returns ``None`` for plugin
    names not known to the manager (never discovered); we fall back
    to the configured-but-not-discovered shape in that case so the
    Settings UI can still render the row.
    """
    if not _manager:
        return []

    # Plugin discovery uses the MERGED app config so the UI reflects
    # Settings writes (enabled/disabled toggles, etc.) immediately
    # after a PATCH without waiting for a restart.
    app_config = config_overlay.read_app_config_merged()
    plugins_cfg = app_config.get("plugins", {})
    enabled = set(plugins_cfg.get("enabled", []) or [])
    disabled = set(plugins_cfg.get("disabled", []) or [])
    available = collect_available_plugins(_active_plugin_names(), _manager, _base_dir)

    result = []
    for name in config_overlay.list_merged_plugin_names():
        if name not in available:
            continue
        cfg = config_overlay.read_plugin_config_merged(name)
        tier = resolve_license_tier(cfg)
        has_license = check_plugin_license(name, tier, _license_store, _license_validator)
        # About-Dialog (2026-05-18): include display_name (i18n dict)
        # + version + description from the canonical plugin config.
        # Empty/missing fields surface as ``None`` / ``{}`` so the
        # frontend renders the slug or hides the row gracefully.
        plugin_meta = cfg.get("plugin", {}) if isinstance(cfg.get("plugin"), dict) else {}
        inspection = _manager.inspect_plugin(name)
        state = inspection.state if inspection is not None else None
        load_error = state.load_error if state is not None else None
        activated_at = state.activated_at if state is not None else None
        last_config_change = state.last_config_change if state is not None else None
        result.append(
            {
                "name": name,
                "has_config": True,
                "enabled": name in enabled and name not in disabled,
                "loaded": state.activated if state is not None else False,
                "license_tier": tier,
                "has_license": has_license,
                "display_name": plugin_meta.get("display_name") or {},
                "description": plugin_meta.get("description") or {},
                "version": plugin_meta.get("version") or None,
                "filter_reason": state.filter_reason if state is not None else None,
                "load_error_message": (
                    load_error.user_facing_message if load_error is not None else None
                ),
                # PluginForge v0.9.0 lifecycle-visibility fields:
                "activated_at": activated_at.isoformat() if activated_at else None,
                "last_config_change": (
                    last_config_change.isoformat() if last_config_change else None
                ),
                "source": state.source if state is not None else None,
            }
        )
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
