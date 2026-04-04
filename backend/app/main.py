import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.hookspecs import BibliogonHookSpec
from app.licensing import LicenseError, LicenseStore, LicenseValidator
from app.routers import assets, backup, books, chapters, licenses, plugin_install, settings

from pluginforge import BasePlugin, PluginManager
from pluginforge.config import load_i18n

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config" / "app.yaml"

# Environment configuration
DEBUG = os.getenv("BIBLIOGON_DEBUG", "true").lower() in ("true", "1", "yes")
CORS_ORIGINS = os.getenv("BIBLIOGON_CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
SECRET_KEY = os.getenv("BIBLIOGON_SECRET_KEY", "")

# Licensing (bibliogon-specific gate for premium plugins)
_app_config_raw: dict[str, Any] = {}
try:
    import yaml
    with open(CONFIG_PATH, encoding="utf-8") as _f:
        _app_config_raw = yaml.safe_load(_f) or {}
except Exception:
    pass

_license_secret = SECRET_KEY or _app_config_raw.get("licensing", {}).get("secret_key", "pluginforge-default-key")
_license_file = _app_config_raw.get("licensing", {}).get("store_path", "config/licenses.json")
license_validator = LicenseValidator(_license_secret)
license_store = LicenseStore(BASE_DIR / _license_file)


def _check_license(plugin: BasePlugin, plugin_config: dict[str, Any]) -> bool:
    """Pre-activate callback: check premium plugin licenses."""
    license_type = plugin_config.get("plugin", {}).get("license", "MIT")
    if license_type.upper() == "MIT" or license_type.lower() == "free":
        return True

    key = license_store.get(plugin.name)
    if not key:
        return False

    try:
        license_validator.validate_license(key, plugin.name)
        return True
    except LicenseError:
        return False


manager = PluginManager(
    config_path=str(CONFIG_PATH),
    pre_activate=_check_license,
    api_version="1",
)
manager.register_hookspecs(BibliogonHookSpec)

# Configure routes with manager and licensing
licenses.configure(manager, license_validator, license_store)
settings.configure(BASE_DIR, manager)
plugin_install.configure(BASE_DIR, manager)


def _load_installed_plugins() -> None:
    """Add installed plugin directories to sys.path before discovery."""
    installed_dir = BASE_DIR / "plugins" / "installed"
    if not installed_dir.exists():
        return
    for plugin_dir in installed_dir.iterdir():
        if plugin_dir.is_dir() and (plugin_dir / "plugin.yaml").exists():
            path_str = str(plugin_dir)
            if path_str not in sys.path:
                sys.path.insert(0, path_str)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Auto-delete expired trash items on startup
    from app.routers.books import cleanup_expired_trash
    cleanup_expired_trash()
    _load_installed_plugins()
    manager.discover_plugins()
    manager.mount_routes(app)
    yield
    manager.deactivate_all()


app = FastAPI(
    title="Bibliogon",
    description="Open-source book authoring platform.",
    version="0.7.0",
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
app.include_router(chapters.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(backup.router, prefix="/api")
app.include_router(licenses.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(plugin_install.router, prefix="/api")


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
    return {"status": "ok", "version": "0.7.0", "debug": DEBUG}


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
