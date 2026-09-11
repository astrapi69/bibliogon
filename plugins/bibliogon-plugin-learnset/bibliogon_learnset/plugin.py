"""Learnset plugin: export a book as an adaptive-learner learn set (#763)."""

from typing import Any

from pluginforge import BasePlugin


class LearnsetPlugin(BasePlugin):
    name = "learnset"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    license_tier = "core"
    depends_on = ["export"]

    def activate(self) -> None:
        from .routes import set_config

        set_config(self.config)

    def get_routes(self) -> list[Any]:
        from .routes import router

        return [router]
