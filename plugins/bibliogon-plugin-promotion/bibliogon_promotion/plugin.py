"""Promotion plugin: portfolio board over the author's retail formats (#782)."""

from typing import Any

from pluginforge import BasePlugin


class PromotionPlugin(BasePlugin):
    name = "promotion"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    license_tier = "core"
    depends_on: list[str] = []

    def get_routes(self) -> list[Any]:
        from .routes import router

        return [router]
