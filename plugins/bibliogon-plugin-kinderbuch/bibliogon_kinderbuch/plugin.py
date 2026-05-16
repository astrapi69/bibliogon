"""Children's book plugin for Bibliogon."""

from typing import Any

from pluginforge import BasePlugin


class KinderbuchPlugin(BasePlugin):
    name = "kinderbuch"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"
    depends_on = ["export"]

    def activate(self) -> None:
        """Set up picture-book resources."""
        self._templates = self.config.get("templates", [])
        self._settings = self.config.get("settings", {})

    def get_routes(self) -> list[Any]:
        from .pages import router as pages_router
        from .routes import router
        return [router, pages_router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        # ``editor_extensions`` slot will be re-added in Session 3 when the
        # frontend PageEditor lands. v1.0.0 previously declared a
        # ``kinderbuch-page-layout`` slot that no frontend code consumed.
        return {
            "templates": getattr(self, "_templates", []),
            "settings": {
                "image_position": getattr(self, "_settings", {}).get("image_position", "top"),
                "default_font_size": getattr(self, "_settings", {}).get("default_font_size", 24),
            },
        }

    @property
    def templates(self) -> list[dict[str, Any]]:
        return getattr(self, "_templates", [])

    @property
    def settings(self) -> dict[str, Any]:
        return getattr(self, "_settings", {})
