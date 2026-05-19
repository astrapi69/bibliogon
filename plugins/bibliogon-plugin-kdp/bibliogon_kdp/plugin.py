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

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        from .routes import KDP_CATEGORIES

        return {
            "sidebar_actions": [
                {
                    "id": "kdp_metadata",
                    "label": {"de": "KDP-Metadaten", "en": "KDP Metadata"},
                    "icon": "file-check",
                },
                {
                    "id": "kdp_cover_check",
                    "label": {"de": "Cover prüfen", "en": "Check Cover"},
                    "icon": "image-check",
                },
            ],
            "categories": list(KDP_CATEGORIES),
        }
