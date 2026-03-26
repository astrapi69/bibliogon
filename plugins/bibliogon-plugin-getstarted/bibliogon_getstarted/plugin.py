"""Get Started plugin for Bibliogon."""

from typing import Any

from pluginforge import BasePlugin


class GetStartedPlugin(BasePlugin):
    name = "getstarted"
    version = "1.0.0"
    api_version = "1"

    def get_routes(self) -> list[Any]:
        from .routes import router
        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        return {
            "pages": [
                {
                    "id": "getstarted",
                    "path": "/get-started",
                    "label": {"de": "Erste Schritte", "en": "Get Started"},
                    "icon": "rocket",
                },
            ],
        }
