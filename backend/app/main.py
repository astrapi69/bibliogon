import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.database import init_db
from app.logging_config import setup_logging

setup_logging()
logger = logging.getLogger(__name__)
from pluginforge import BasePlugin, PluginManager
from pluginforge.config import load_i18n

# Side-effect import: register core import handlers with the plugin
# registry before any request hits the orchestrator. Aliased so the
# bare top-level `app` package name does not shadow the `app = FastAPI(
# ...)` assignment below (mypy attr-defined cascade otherwise).
from app import import_plugins as _register_core_import_handlers  # noqa: F401, E402
from app.hookspecs import BibliogonHookSpec
from app.import_plugins import handlers as _import_plugins_handlers  # noqa: F401, E402
from app.licensing import LicenseError, LicenseStore, LicenseValidator
from app.routers import (
    article_assets,
    article_export,
    articles,
    assets,
    audiobook,
    backup,
    books,
    chapter_templates,
    chapters,
    covers,
    git_backup,
    git_import_backfill,
    git_sync,
    import_orchestrator,
    licenses,
    plugin_install,
    publications,
    settings,
    templates,
    translations,
)
from app.routers import (
    ssh_keys as ssh_keys_router,
)

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config" / "app.yaml"
CONFIG_EXAMPLE_PATH = BASE_DIR / "config" / "app.yaml.example"

# Auto-create app.yaml from example on first startup
if not CONFIG_PATH.exists() and CONFIG_EXAMPLE_PATH.exists():
    import shutil

    shutil.copy2(CONFIG_EXAMPLE_PATH, CONFIG_PATH)
    logging.getLogger(__name__).info("Created config/app.yaml from app.yaml.example")

# Environment configuration
DEBUG = os.getenv("BIBLIOGON_DEBUG", "true").lower() in ("true", "1", "yes")
CORS_ORIGINS = os.getenv("BIBLIOGON_CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
SECRET_KEY = os.getenv("BIBLIOGON_SECRET_KEY", "")

# App config helpers
import yaml


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
    """Read app.yaml + user override + env-vars fresh from disk.

    Three-layer merge: project ``app.yaml`` (defaults) ← user override
    file (~/.config/bibliogon/secrets.yaml or %APPDATA%/...) ← env-vars
    (BIBLIOGON_*). Override-wins semantics; env-vars beat both.

    Called per-request where freshness matters; cheap (small yaml
    files, no caching needed).
    """
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            project = yaml.safe_load(f) or {}
    except Exception:
        project = {}
    override = _load_override_file(_get_user_override_path())
    merged = _deep_merge(project, override)
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


if _has_project_secret_without_override():
    logger.warning(
        "Secrets found in %s (ai.api_key). This file is gitignored but "
        "may be committed accidentally, end up in backups, or appear in "
        "screen-shares. Move secrets to %s or set BIBLIOGON_AI_API_KEY. "
        "See docs/configuration.md for details.",
        CONFIG_PATH,
        _get_user_override_path(),
    )

# Licensing reads at startup (licensing config doesn't change at runtime)
_startup_config = _load_app_config()
_license_secret = SECRET_KEY or _startup_config.get("licensing", {}).get(
    "secret_key", "pluginforge-default-key"
)
_license_file = _startup_config.get("licensing", {}).get("store_path", "config/licenses.json")
license_validator = LicenseValidator(_license_secret)
license_store = LicenseStore(BASE_DIR / _license_file)


def _check_license(plugin: BasePlugin, _plugin_config: dict[str, Any]) -> bool:
    """Pre-activate callback: check premium plugin licenses.

    Currently disabled: all plugins are free during the development phase.
    The LICENSING_ENABLED flag in backend/app/licensing.py controls this.
    When reactivated, premium plugins will need a valid license key.
    """
    from .licensing import LICENSING_ENABLED

    if not LICENSING_ENABLED:
        return True

    tier = getattr(plugin, "license_tier", "core")
    if tier == "core":
        return True

    key = license_store.get(plugin.name)
    if not key:
        key = license_store.get("*")
    if not key:
        logger.info("Premium plugin '%s' blocked: no license key", plugin.name)
        return False

    try:
        _payload, _warning = license_validator.validate_license(key, plugin.name)
        return True
    except LicenseError:
        wildcard_key = license_store.get("*")
        if wildcard_key and wildcard_key != key:
            try:
                license_validator.validate_license(wildcard_key, "*")
                return True
            except LicenseError:
                pass
        logger.info("Premium plugin '%s' blocked: invalid/expired license", plugin.name)
        return False


manager = PluginManager(
    config_path=str(CONFIG_PATH),
    pre_activate=_check_license,
    api_version="1",
)
manager.register_hookspecs(BibliogonHookSpec)

# Configure routes with manager and licensing
licenses.configure(manager, license_validator, license_store)
settings.configure(
    BASE_DIR, manager, license_store=license_store, license_validator=license_validator
)
plugin_install.configure(BASE_DIR, manager)


def _load_installed_plugins() -> None:
    """Add installed and bundled plugin directories to sys.path before discovery."""
    # ZIP-installed plugins
    installed_dir = BASE_DIR / "plugins" / "installed"
    if installed_dir.exists():
        for plugin_dir in installed_dir.iterdir():
            if plugin_dir.is_dir() and (plugin_dir / "plugin.yaml").exists():
                path_str = str(plugin_dir)
                if path_str not in sys.path:
                    sys.path.insert(0, path_str)

    # Bundled plugins (e.g. plugins/bibliogon-plugin-audiobook/)
    bundled_dir = BASE_DIR.parent / "plugins"
    if bundled_dir.exists():
        for plugin_dir in bundled_dir.iterdir():
            if plugin_dir.is_dir() and plugin_dir.name.startswith("bibliogon-plugin-"):
                path_str = str(plugin_dir)
                if path_str not in sys.path:
                    sys.path.insert(0, path_str)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Bibliogon (debug=%s)", DEBUG)
    init_db()
    # Auto-delete expired trash items on startup
    from app.routers.articles import cleanup_expired_article_trash
    from app.routers.books import cleanup_expired_trash

    cleanup_expired_trash()
    cleanup_expired_article_trash()
    # Seed voices if table is empty
    from app.database import SessionLocal
    from app.voice_store import sync_edge_tts_voices, voice_count

    _vs_db = SessionLocal()
    try:
        if voice_count(_vs_db) == 0:
            await sync_edge_tts_voices(_vs_db)
    finally:
        _vs_db.close()
    # Seed builtin book templates (idempotent)
    from app.data.builtin_templates import seed_builtin_templates

    _bt_db = SessionLocal()
    try:
        seed_builtin_templates(_bt_db)
    finally:
        _bt_db.close()
    # Seed builtin chapter templates (idempotent)
    from app.data.builtin_chapter_templates import seed_builtin_chapter_templates

    _ct_db = SessionLocal()
    try:
        seed_builtin_chapter_templates(_ct_db)
    finally:
        _ct_db.close()
    _load_installed_plugins()
    manager.discover_plugins()
    manager.mount_routes(app)
    active = [p.name for p in manager.get_active_plugins()]
    logger.info("Plugins loaded: %s", ", ".join(active) if active else "none")
    yield
    logger.info("Shutting down Bibliogon")
    manager.deactivate_all()


app = FastAPI(
    title="Bibliogon",
    description="Open-source book authoring platform.",
    version=__version__,
    lifespan=lifespan,
    docs_url="/api/docs" if DEBUG else None,
    redoc_url="/api/redoc" if DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(books.router, prefix="/api")
app.include_router(articles.router, prefix="/api")
app.include_router(article_assets.router, prefix="/api")
app.include_router(article_export.router, prefix="/api")
app.include_router(publications.publications_router, prefix="/api")
app.include_router(publications.platform_schemas_router, prefix="/api")
app.include_router(chapters.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(audiobook.router, prefix="/api")
app.include_router(covers.router, prefix="/api")
app.include_router(backup.router, prefix="/api")
app.include_router(import_orchestrator.router, prefix="/api")
app.include_router(licenses.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(plugin_install.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(chapter_templates.router, prefix="/api")
app.include_router(git_backup.router, prefix="/api")
app.include_router(git_import_backfill.router, prefix="/api")
app.include_router(git_sync.router, prefix="/api")
app.include_router(translations.router, prefix="/api")
app.include_router(ssh_keys_router.router, prefix="/api")

from app.ai.routes import router as ai_router

app.include_router(ai_router, prefix="/api")

from app.routers.websocket import router as ws_router

app.include_router(ws_router, prefix="/api")


# Global exception handler: log all unhandled errors with stacktrace
from fastapi import Request
from fastapi.responses import JSONResponse


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log all unhandled exceptions with full stacktrace."""
    import traceback

    logger.error(
        "Unhandled error: %s %s -> %s",
        request.method,
        request.url.path,
        str(exc),
        exc_info=True,
    )
    detail: dict[str, Any] = {"detail": str(exc)}
    if DEBUG:
        detail["stacktrace"] = traceback.format_exc()
        detail["endpoint"] = request.url.path
        detail["method"] = request.method
    return JSONResponse(status_code=500, content=detail)


@app.get("/api/voices")
def list_voices(engine: str = "edge-tts", language: str | None = None):
    """List TTS voices from the database (always available, no plugin needed)."""
    from app.database import SessionLocal
    from app.voice_store import get_voices

    db = SessionLocal()
    try:
        return get_voices(db, engine, language)
    finally:
        db.close()


@app.post("/api/voices/sync")
async def sync_voices():
    """Re-sync Edge TTS voices from the API into the database."""
    from app.database import SessionLocal
    from app.voice_store import sync_edge_tts_voices

    db = SessionLocal()
    try:
        count = await sync_edge_tts_voices(db)
        return {"synced": count, "engine": "edge-tts"}
    finally:
        db.close()


# --- Editor plugin status (cached, with reachability checks) ---

import time as _time

_plugin_status_cache: dict[str, Any] = {}
_plugin_status_timestamp: float = 0


def invalidate_plugin_status_cache() -> None:
    """Clear the plugin-status cache so the next request reads fresh state."""
    global _plugin_status_cache, _plugin_status_timestamp
    _plugin_status_cache = {}
    _plugin_status_timestamp = 0


_PLUGIN_STATUS_TTL = 30  # seconds


@app.get("/api/editor/plugin-status")
async def editor_plugin_status() -> dict[str, dict[str, Any]]:
    """Return availability status for all editor-relevant plugins.

    Checks: plugin active, license valid, external service reachable.
    Results are cached for 30 seconds to avoid hammering external APIs.
    """
    global _plugin_status_cache, _plugin_status_timestamp

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


@app.get("/api/plugins/manifests")
def get_plugin_manifests() -> dict[str, Any]:
    result: dict[str, Any] = {}
    for plugin in manager.get_active_plugins():
        manifest = plugin.get_frontend_manifest()
        if manifest:
            result[plugin.name] = manifest
    return result


@app.get("/api/plugins/health")
def get_plugin_health() -> dict[str, Any]:
    return dict(manager.health_check())


@app.get("/api/plugins/errors")
def get_plugin_errors() -> dict[str, str]:
    return dict(manager.get_load_errors())


@app.get("/api/i18n/{lang}")
def get_i18n(lang: str) -> dict[str, Any]:
    return dict(load_i18n(BASE_DIR / "config", lang))


@app.get("/api/health")
def health():
    return {"status": "ok", "version": __version__, "debug": DEBUG}


# Test reset endpoint - only available in debug mode
if DEBUG:
    from app.database import SessionLocal
    from app.models import Asset, Book, Chapter

    @app.delete("/api/test/reset")
    def reset_test_db():
        """Reset all data. Used by e2e tests for clean state. Only available in debug mode."""
        db = SessionLocal()
        try:
            db.query(Asset).delete()
            db.query(Chapter).delete()
            db.query(Book).delete()
            db.commit()
            return {"status": "reset"}
        finally:
            db.close()
