"""FastAPI integration for PluginForge."""

from typing import Any

try:
    from fastapi import FastAPI
except ImportError:
    FastAPI = None  # type: ignore[assignment, misc]


def mount_plugin_routes(app: Any, manager: Any, prefix: str = "/api") -> None:
    """Mount all plugin routers onto a FastAPI app.

    Args:
        app: FastAPI application instance.
        manager: PluginManager instance.
        prefix: URL prefix for plugin routes.
    """
    for router in manager.get_all_routes():
        app.include_router(router, prefix=prefix)


def register_plugin_endpoints(app: Any, manager: Any) -> None:
    """Register standard plugin-related API endpoints.

    Adds:
    - GET /api/plugins/manifests - frontend manifests from all plugins
    - GET /api/i18n/{lang} - i18n strings for a language

    Args:
        app: FastAPI application instance.
        manager: PluginManager instance.
    """
    @app.get("/api/plugins/manifests")
    def get_plugin_manifests() -> dict[str, Any]:
        return manager.get_all_frontend_manifests()

    @app.get("/api/i18n/{lang}")
    def get_i18n(lang: str) -> dict[str, Any]:
        return manager.load_i18n(lang)
