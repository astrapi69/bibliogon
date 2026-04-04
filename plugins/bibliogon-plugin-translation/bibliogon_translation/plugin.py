"""Translation Plugin - DeepL and local LLM (LMStudio) translation."""

from typing import Any

from pluginforge import BasePlugin


class TranslationPlugin(BasePlugin):
    """Plugin for translating book chapters via DeepL or local LLM."""

    name = "translation"
    version = "1.0.0"
    api_version = "1"

    def activate(self) -> None:
        """Initialize plugin with config."""
        from .routes import router, set_config

        set_config(self.config or {})
        self._router = router

    def deactivate(self) -> None:
        """Clean up."""
        pass

    def get_routes(self) -> list[Any]:
        """Return FastAPI routers."""
        return [self._router]

    def get_frontend_manifest(self) -> dict[str, Any]:
        """Declare UI extensions."""
        return {
            "sidebar_actions": [
                {
                    "id": "translate_chapter",
                    "label": {"de": "Kapitel uebersetzen", "en": "Translate Chapter"},
                    "icon": "languages",
                },
            ],
        }

    def health(self) -> dict[str, Any]:
        """Report plugin health."""
        settings = (self.config or {}).get("settings", {})
        provider = settings.get("provider", "deepl")
        has_key = bool(settings.get("deepl_api_key"))
        if provider == "deepl" and not has_key:
            return {"status": "warning", "error": "No DeepL API key configured"}
        return {"status": "ok", "provider": provider}
