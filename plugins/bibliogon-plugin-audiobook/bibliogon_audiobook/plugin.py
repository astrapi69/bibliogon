"""Audiobook Plugin - TTS-based audiobook generation."""

from typing import Any

from pluginforge import BasePlugin


class AudiobookPlugin(BasePlugin):
    """Plugin for generating audiobooks from book chapters via TTS."""

    name = "audiobook"
    version = "1.0.0"
    api_version = "1"
    license_tier = "premium"

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
                    "id": "generate_audiobook",
                    "label": {"de": "Audiobook generieren", "en": "Generate Audiobook"},
                    "icon": "headphones",
                },
            ],
        }

    def health(self) -> dict[str, Any]:
        """Report plugin health."""
        return {"status": "ok", "engine": "edge-tts"}
