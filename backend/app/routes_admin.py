"""Admin / plugin-introspection routes: editor plugin-status, plugin
manifests / health / errors, hot rediscover, and the debug test reset.

Extracted from ``app/main.py`` (God-file decomposition, 2026-06-14).
These routes need the live ``PluginManager`` (and, for the AI branch, the
app config). To avoid an import-time cycle with ``app.main`` (which owns
the manager singleton and is patched by tests via
``app.main._load_app_config`` / ``app.main.manager``), the manager and
config are imported lazily *inside* each handler. That keeps every
existing ``unittest.mock.patch("app.main.<name>")`` target intact.

The plugin-status cache lives here at module scope;
:func:`invalidate_plugin_status_cache` is re-exported by ``app.main`` for
the settings router (and tests) that clear it on a config change.
"""

import logging
import time as _time
from typing import Any

from fastapi import APIRouter, FastAPI

logger = logging.getLogger(__name__)

# Plugin-status cache (30s TTL). Cleared by invalidate_plugin_status_cache
# when settings change so the next request reflects fresh state.
_plugin_status_cache: dict[str, Any] = {}
_plugin_status_timestamp: float = 0
_PLUGIN_STATUS_TTL = 30  # seconds


def invalidate_plugin_status_cache() -> None:
    """Clear the plugin-status cache so the next request reads fresh state."""
    global _plugin_status_cache, _plugin_status_timestamp
    _plugin_status_cache = {}
    _plugin_status_timestamp = 0


router = APIRouter()


@router.get("/editor/plugin-status")
async def editor_plugin_status() -> dict[str, dict[str, Any]]:
    """Return availability status for all editor-relevant plugins.

    Checks: plugin active, license valid, external service reachable.
    Results are cached for 30 seconds to avoid hammering external APIs.
    """
    global _plugin_status_cache, _plugin_status_timestamp
    from app.main import _load_app_config, manager

    now = _time.time()
    if _plugin_status_cache and (now - _plugin_status_timestamp) < _PLUGIN_STATUS_TTL:
        return _plugin_status_cache

    active_names = {p.name for p in manager.get_active_plugins()}

    # Plugins the editor cares about
    editor_plugins = {
        "grammar": {
            "label": "LanguageTool",
            "needs_service": True,
            "health_endpoint": "/api/grammar/languages",
        },
        "translation": {
            "label": "Übersetzung",
            "needs_service": True,
            "health_endpoint": "/api/translation/health",
        },
        "audiobook": {
            "label": "Audiobook Vorhören",
            "needs_service": False,
        },
        "ai": {
            "label": "AI-Assistent",
            "needs_service": True,
            "health_endpoint": "/api/ai/health",
        },
    }

    result: dict[str, dict[str, Any]] = {}

    for name, info in editor_plugins.items():
        # Special case: AI is not a plugin but a core module
        if name == "ai":
            ai_cfg = _load_app_config().get("ai", {})
            if not ai_cfg.get("enabled", False):
                result[name] = {
                    "available": False,
                    "reason": "disabled",
                    "message": "KI-Funktionen sind deaktiviert. Aktiviere sie unter Einstellungen > Allgemein > KI-Assistent.",
                }
                continue
            try:
                from app.ai.llm_client import LLMClient

                client = LLMClient(
                    base_url=ai_cfg.get("base_url", "http://localhost:1234/v1"),
                    api_key=ai_cfg.get("api_key", ""),
                    provider=ai_cfg.get("provider", ""),
                )
                health = await client.health()
                if health.get("status") == "ok":
                    result[name] = {"available": True, "reason": None}
                else:
                    result[name] = {
                        "available": False,
                        "reason": "service_not_reachable",
                        "message": f"KI-Server nicht erreichbar ({client.base_url})",
                    }
            except Exception:
                result[name] = {
                    "available": False,
                    "reason": "service_not_reachable",
                    "message": "KI-Server nicht erreichbar",
                }
            continue

        if name not in active_names:
            result[name] = {
                "available": False,
                "reason": "plugin_not_active",
                "message": f"{info['label']}-Plugin nicht aktiviert",
            }
            continue

        # Plugin is active - check external service if needed
        if info.get("needs_service"):
            try:
                plugin = next(p for p in manager.get_active_plugins() if p.name == name)
                health = plugin.health()
                if isinstance(health, dict) and health.get("status") == "ok":
                    result[name] = {"available": True, "reason": None}
                else:
                    error_msg = health.get("error", "") if isinstance(health, dict) else ""
                    result[name] = {
                        "available": False,
                        "reason": "service_not_reachable",
                        "message": error_msg or f"{info['label']} nicht erreichbar",
                    }
            except Exception as e:
                result[name] = {
                    "available": False,
                    "reason": "service_not_reachable",
                    "message": str(e),
                }
        else:
            result[name] = {"available": True, "reason": None}

    _plugin_status_cache = result
    _plugin_status_timestamp = now
    return result


@router.get("/plugins/manifests")
def get_plugin_manifests() -> dict[str, Any]:
    """Return each active plugin's frontend manifest, keyed by plugin name."""
    from app.main import manager

    result: dict[str, Any] = {}
    for plugin in manager.get_active_plugins():
        manifest = plugin.get_frontend_manifest()
        if manifest:
            result[plugin.name] = manifest
    return result


@router.get("/plugins/health")
def get_plugin_health() -> dict[str, Any]:
    """Return the manager's per-plugin health snapshot."""
    from app.main import manager

    return dict(manager.health_check())


@router.get("/plugins/errors")
def get_plugin_errors() -> dict[str, str]:
    """Return the manager's per-plugin load errors."""
    from app.main import manager

    return dict(manager.get_load_errors())


@router.post("/admin/rediscover")
def admin_rediscover() -> dict[str, Any]:
    """Re-read plugin entry points without restarting the host.

    Calls ``PluginManager.rediscover()`` (pluginforge v0.6.0 public API),
    which invalidates ``importlib`` and ``importlib.metadata`` caches,
    activates newly-discovered plugins, deactivates ones whose entry
    point has disappeared, and leaves unchanged plugins untouched.

    Subsumes the ``PLUGIN-DEV-SERVER-RESTART-HELPER-01`` workflow item: a
    contributor adding a new ``plugins/bibliogon-plugin-foo/`` + running
    ``poetry install`` in ``backend/`` can hit this endpoint instead of
    restarting uvicorn.

    NOT relevant to ZIP-installed plugins (those go through
    ``register_plugin()`` directly at install time; they do not register
    entry points). Hot-reload there already happens inside
    ``/api/plugins/install``.

    Response shape mirrors ``DiscoveryDiff`` with severity filtering on
    the errors channel: ``severity="error"`` entries land in ``errors``;
    ``severity="warning"`` entries (e.g. v0.7.0 identity deprecation) land
    in ``notices``. Consumers can render the two channels differently.
    """
    from app.main import manager

    diff = manager.rediscover()
    return {
        "added": list(diff.added),
        "removed": list(diff.removed),
        "unchanged": list(diff.unchanged),
        "states": {
            name: {
                "discovered": state.discovered,
                "enabled_in_config": state.enabled_in_config,
                "disabled_in_config": state.disabled_in_config,
                "activated": state.activated,
                "filter_reason": state.filter_reason,
            }
            for name, state in diff.states.items()
        },
        "errors": [
            {
                "name": err.name,
                "phase": err.phase,
                "user_facing_message": err.user_facing_message,
            }
            for err in diff.errors
            if err.severity == "error"
        ],
        "notices": [
            {
                "name": err.name,
                "phase": err.phase,
                "user_facing_message": err.user_facing_message,
            }
            for err in diff.errors
            if err.severity == "warning"
        ],
    }


def _reset_shared_infra() -> None:
    """Clear process- and disk-level state the content-table wipe misses.

    Each e2e test resets via ``DELETE /api/test/reset``; the table wipe
    covers rows, but the single long-lived backend also accumulates
    config caches, in-flight jobs, orphaned upload files and a growing
    SQLite WAL. Clearing them here keeps every test running against a
    backend as fresh as the first. See
    ``docs/audits/e2e-isolation-audit-2026-06-22.md`` (Option A).
    """
    import shutil

    from app.services.platform_schema import load_platform_schemas
    from app.services.registries.book_type_registry import load_book_types
    from app.services.registries.content_type_registry import load_content_types
    from app.services.registries.story_entity_registry import (
        load_story_entity_types,
    )

    # Config lru_caches: read-only in e2e today, cleared defensively so a
    # future config-mutating spec cannot leak a stale schema across tests.
    for cached in (
        load_platform_schemas,
        load_content_types,
        load_story_entity_types,
        load_book_types,
    ):
        cached.cache_clear()

    # In-flight export / audiobook / bulk-AI jobs (in-memory singleton).
    from app.job_store import job_store

    job_store.shutdown_all()

    # Orphaned upload/asset files: the rows are deleted by the table wipe,
    # the files are not, so they accumulate across the run.
    from app.paths import get_upload_dir

    upload_dir = get_upload_dir()
    if upload_dir.exists():
        for child in upload_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                child.unlink(missing_ok=True)

    # Truncate the SQLite WAL so the db file stops growing across the run.
    from app.database import engine

    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception as exc:  # noqa: BLE001 - non-WAL/non-SQLite: best-effort
        logger.warning("test-reset WAL checkpoint skipped: %s", exc)


def _register_test_reset(app: FastAPI) -> None:
    """Register the debug-only ``DELETE /api/test/reset`` endpoint.

    Only mounted in debug mode (e2e tests need a clean per-test state).
    Wipes every per-test CONTENT table in FK-safe order; seed/config
    tables (BookTemplate*, ChapterTemplate, AudioVoice, GitSyncMapping,
    Author) are intentionally preserved.
    """
    from app.database import SessionLocal
    from app.models import (
        ArcReviewer,
        Article,
        ArticleAsset,
        ArticleComment,
        ArticleImportSource,
        Asset,
        Book,
        BookImportSource,
        BookPublishingState,
        Chapter,
        ChapterLabel,
        ChapterVersion,
        ComicBubble,
        ComicPanel,
        Page,
        Publication,
        StoryEntity,
        StoryEntityPageLink,
        WritingSession,
    )

    reset_models_in_order = [
        StoryEntityPageLink,
        ComicBubble,
        ComicPanel,
        StoryEntity,
        ChapterVersion,
        WritingSession,
        ChapterLabel,
        ArcReviewer,
        BookPublishingState,
        Publication,
        ArticleComment,
        ArticleImportSource,
        ArticleAsset,
        BookImportSource,
        Page,
        Asset,
        Chapter,
        Article,
        Book,
    ]

    @app.delete("/api/test/reset")
    def reset_test_db():
        """Reset all per-test content + shared backend state.

        The table wipe clears content rows; ``_reset_shared_infra`` then
        clears the process/disk state the wipe misses (config caches, the
        job store, orphaned upload files, the growing SQLite WAL) so each
        e2e test runs against a backend as fresh as the first.
        """
        db = SessionLocal()
        try:
            for model in reset_models_in_order:
                db.query(model).delete()
            db.commit()
        finally:
            db.close()
        _reset_shared_infra()
        return {"status": "reset"}


def register_admin_routes(app: FastAPI, *, debug: bool) -> None:
    """Mount the admin router (and, in debug mode, the test-reset route).

    Args:
        app: The FastAPI application instance.
        debug: When True, also registers ``DELETE /api/test/reset``.
    """
    app.include_router(router, prefix="/api")
    if debug:
        _register_test_reset(app)
