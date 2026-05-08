"""Bibliogon Medium-import plugin entry point."""

from typing import Any

from pluginforge import BasePlugin


class MediumImportPlugin(BasePlugin):
    name = "medium-import"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"
    depends_on: list[str] = []

    def activate(self) -> None:
        self._settings = self.config.get("settings", {})

    def get_routes(self) -> list[Any]:
        from .routes import router

        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        return {
            "settings_section": {
                "id": "medium-import",
                "label": {
                    "de": "Medium-Import",
                    "en": "Medium Import",
                    "es": "Importar de Medium",
                    "fr": "Importer depuis Medium",
                    "el": "Εισαγωγή από Medium",
                    "pt": "Importar do Medium",
                    "tr": "Medium'dan İçe Aktar",
                    "ja": "Medium からインポート",
                },
            },
        }
