"""Amazon KDP plugin for Bibliogon."""

from typing import Any

from pluginforge import BasePlugin


class KdpPlugin(BasePlugin):
    name = "kdp"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"
    depends_on = ["export"]

    def activate(self) -> None:
        self._settings = self.config.get("settings", {})

    def get_routes(self) -> list[Any]:
        from .routes import router
        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        categories = getattr(self, "_settings", {}).get("categories", [])
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
            "categories": categories,
        }

    @property
    def cover_requirements(self) -> dict[str, Any]:
        return getattr(self, "_settings", {}).get("cover", {})

    @property
    def manuscript_requirements(self) -> dict[str, Any]:
        return getattr(self, "_settings", {}).get("manuscript", {})
