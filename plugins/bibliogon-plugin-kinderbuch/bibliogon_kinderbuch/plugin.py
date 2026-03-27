"""Children's book plugin for Bibliogon."""

from typing import Any

from pluginforge import BasePlugin


class KinderbuchPlugin(BasePlugin):
    name = "kinderbuch"
    version = "1.0.0"
    api_version = "1"
    depends_on = ["export"]

    def activate(self) -> None:
        """Set up picture-book resources."""
        self._templates = self.config.get("templates", [])
        self._settings = self.config.get("settings", {})

    def get_routes(self) -> list[Any]:
        from .routes import router
        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        return {
            "editor_extensions": ["kinderbuch-page-layout"],
            "templates": self._templates,
            "settings": {
                "image_position": self._settings.get("image_position", "top"),
                "default_font_size": self._settings.get("default_font_size", 24),
            },
        }

    @property
    def templates(self) -> list[dict[str, Any]]:
        return self._templates

    @property
    def settings(self) -> dict[str, Any]:
        return self._settings
