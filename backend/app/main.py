from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.hookspecs import BibliogonHookSpec
from app.licensing import LicenseError, LicenseStore, LicenseValidator
from app.routers import assets, backup, books, chapters, licenses, settings

from pluginforge import BasePlugin, PluginManager
from pluginforge.config import load_i18n

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config" / "app.yaml"

# Licensing (bibliogon-specific gate for premium plugins)
_app_config_raw: dict[str, Any] = {}
try:
    import yaml
    with open(CONFIG_PATH, encoding="utf-8") as _f:
        _app_config_raw = yaml.safe_load(_f) or {}
except Exception:
    pass

_license_secret = _app_config_raw.get("licensing", {}).get("secret_key", "pluginforge-default-key")
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    manager.discover_plugins()
    manager.mount_routes(app)
    yield
    manager.deactivate_all()


app = FastAPI(
    title="Bibliogon",
    description="Open-source book authoring platform.",
    version="0.6.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(books.router, prefix="/api")
app.include_router(chapters.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(backup.router, prefix="/api")
app.include_router(licenses.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


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
    return manager.health_check()


@app.get("/api/plugins/errors")
def get_plugin_errors() -> dict[str, str]:
    return manager.get_load_errors()


@app.get("/api/i18n/{lang}")
def get_i18n(lang: str) -> dict[str, Any]:
    return load_i18n(BASE_DIR / "config", lang)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.6.0"}
