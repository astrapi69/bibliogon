"""Grammar check plugin for Bibliogon."""

from typing import Any

from pluginforge import BasePlugin

from .languagetool import LanguageToolClient


class GrammarPlugin(BasePlugin):
    name = "grammar"
    version = "1.0.0"
    api_version = "1"

    def __init__(self) -> None:
        super().__init__()
        self._client: LanguageToolClient | None = None

    def activate(self) -> None:
        settings = self.config.get("settings", {})
        self._client = LanguageToolClient(
            base_url=settings.get("languagetool_url", "https://api.languagetoolplus.com/v2"),
            default_language=settings.get("default_language", "auto"),
            disabled_rules=settings.get("disabled_rules", []),
            disabled_categories=settings.get("disabled_categories", []),
        )

    def deactivate(self) -> None:
        self._client = None

    @property
    def client(self) -> LanguageToolClient:
        if self._client is None:
            raise RuntimeError("GrammarPlugin is not activated")
        return self._client

    def get_routes(self) -> list[Any]:
        from .routes import router
        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        return {
            "editor_extensions": ["grammar-check"],
            "sidebar_actions": [
                {
                    "id": "grammar_check",
                    "label": {"de": "Grammatik pruefen", "en": "Check Grammar"},
                    "icon": "spell-check",
                },
            ],
        }
