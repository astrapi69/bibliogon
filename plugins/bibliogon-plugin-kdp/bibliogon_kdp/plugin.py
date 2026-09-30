"""Amazon KDP plugin for Bibliogon."""

from typing import Any

from pluginforge import BasePlugin


class KdpPlugin(BasePlugin):
    name = "kdp"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    license_tier = "core"
    depends_on = ["export"]

    def activate(self) -> None:
        self._settings = self.config.get("settings", {})

    def get_routes(self) -> list[Any]:
        from .routes import router
        return [router]
