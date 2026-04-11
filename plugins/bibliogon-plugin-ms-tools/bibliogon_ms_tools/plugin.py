"""Manuscript Tools Plugin - style checks, sanitization, readability metrics."""

import pluggy
from pluginforge import BasePlugin

hookimpl = pluggy.HookimplMarker("bibliogon.plugins")


class MsToolsPlugin(BasePlugin):
    """Plugin for manuscript quality analysis and text sanitization."""

    name = "ms-tools"
    version = "1.0.0"
    api_version = "1"
    license_tier = "core"

    def activate(self) -> None:
        """Initialize plugin with config."""
        from .routes import router, set_config

        set_config(self.config or {})
        self._router = router

    @hookimpl
    def content_pre_import(self, content: str, language: str) -> str | None:
        """Sanitize markdown content during import.

        Returns None when the feature is disabled via config or no fixes
        were applied, so the import pipeline keeps the original text.
        """
        settings = (self.config or {}).get("settings") or self.config or {}
        if not settings.get("auto_sanitize_on_import", True):
            return None
        if not content:
            return None

        from .sanitizer import sanitize

        result = sanitize(content, language=language or "de")
        if not result.get("changed"):
            return None
        return result["sanitized"]

    def deactivate(self) -> None:
        """Clean up."""
        pass

    def get_routes(self) -> list:
        """Return FastAPI routers."""
        return [self._router]

    def get_frontend_manifest(self) -> dict:
        """Declare UI extensions."""
        return {
            "sidebar_actions": [
                {
                    "id": "ms_style_check",
                    "label": {"de": "Stil pruefen", "en": "Check Style"},
                    "icon": "text-search",
                },
                {
                    "id": "ms_sanitize",
                    "label": {"de": "Text bereinigen", "en": "Sanitize Text"},
                    "icon": "eraser",
                },
            ],
        }

    def health(self) -> dict:
        """Report plugin health."""
        return {"status": "ok"}
