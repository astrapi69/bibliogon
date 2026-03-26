"""Help plugin for Bibliogon."""

from typing import Any

from pluginforge import BasePlugin


class HelpPlugin(BasePlugin):
    name = "help"
    version = "1.0.0"
    api_version = "1"

    def get_routes(self) -> list[Any]:
        from .routes import router
        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        return {
            "pages": [
                {
                    "id": "help",
                    "path": "/help",
                    "label": {"de": "Hilfe", "en": "Help"},
                    "icon": "help-circle",
                },
            ],
        }
