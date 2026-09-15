"""A+ Content plugin: generate an Amazon A+ Content package from a book (#825)."""

from typing import Any

from pluginforge import BasePlugin


class AplusPlugin(BasePlugin):
    name = "aplus"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    license_tier = "core"
    depends_on: list[str] = []

    def get_routes(self) -> list[Any]:
        from .routes import router

        return [router]
