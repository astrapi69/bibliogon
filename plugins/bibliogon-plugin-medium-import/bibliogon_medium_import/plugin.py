"""Bibliogon Medium-import plugin entry point."""

from typing import Any

from pluginforge import BasePlugin


class MediumImportPlugin(BasePlugin):
    name = "medium-import"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    license_tier = "core"
    depends_on: list[str] = []

    def activate(self) -> None:
        from .routes import set_config

        self._settings = self.config.get("settings", {})
        # Push the full config into the route module so the import
        # endpoint can read settings at request time. Without this
        # the YAML-configured + UI-editable settings sit dead and
        # the importer falls back to its hardcoded defaults on
        # every run.
        set_config(self.config or {})

    def get_routes(self) -> list[Any]:
        from .routes import router

        return [router]
