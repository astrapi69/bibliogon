"""Manuscript Tools Plugin - style checks, sanitization, readability metrics."""

from pluginforge import BasePlugin


class MsToolsPlugin(BasePlugin):
    """Plugin for manuscript quality analysis and text sanitization."""

    name = "ms-tools"
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
