"""Grammar check plugin for Bibliogon."""

from typing import Any

from pluginforge import BasePlugin

from .languagetool import LanguageToolClient


class GrammarPlugin(BasePlugin):
    name = "grammar"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"

    _client: LanguageToolClient | None = None

    def activate(self) -> None:
        from .routes import set_config
        set_config(self.config or {})

        settings = self.config.get("settings", {})
        self._client = LanguageToolClient(
            base_url=settings.get("languagetool_url", "https://api.languagetoolplus.com/v2"),
            username=settings.get("languagetool_username", ""),
            api_key=settings.get("languagetool_api_key", ""),
        )

    def deactivate(self) -> None:
        self._client = None

    @property
    def client(self) -> LanguageToolClient | None:
        return getattr(self, "_client", None)

    def get_routes(self) -> list[Any]:
        from .routes import router
        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        return {
            "editor_extensions": ["grammar-check"],
            "sidebar_actions": [
                {
                    "id": "grammar_check",
                    "label": {"de": "Grammatik prüfen", "en": "Check Grammar"},
                    "icon": "spell-check",
                },
            ],
        }

    def health(self) -> dict[str, Any]:
        client = getattr(self, "_client", None)
        if client is None:
            return {"status": "error", "error": "Not activated"}
        return {"status": "ok", "url": client.base_url}
