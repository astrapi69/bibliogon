"""Children's book plugin for Bibliogon."""

from typing import Any

from pluginforge import BasePlugin


class KinderbuchPlugin(BasePlugin):
    name = "kinderbuch"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    min_app_version = "0.9.0"
    license_tier = "core"
    depends_on = ["export"]

    def activate(self) -> None:
        """Set up picture-book resources."""
        self._templates = self.config.get("templates", [])
        self._settings = self.config.get("settings", {})

    def get_routes(self) -> list[Any]:
        from .routes import router
        return [router]

    @property
    def templates(self) -> list[dict[str, Any]]:
        return getattr(self, "_templates", [])

    @property
    def settings(self) -> dict[str, Any]:
        return getattr(self, "_settings", {})
