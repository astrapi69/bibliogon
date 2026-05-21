"""Audiobook Plugin - TTS-based audiobook generation."""

from typing import Any

from pluginforge import BasePlugin


class AudiobookPlugin(BasePlugin):
    """Plugin for generating audiobooks from book chapters via TTS."""

    name = "audiobook"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    license_tier = "core"

    def activate(self) -> None:
        """Initialize plugin with config."""
        from .routes import router, set_config
        from .tts_engine import set_elevenlabs_api_key

        cfg = self.config or {}
        set_config(cfg)
        # Push the configured ElevenLabs key (if any) into the engine so
        # ``ElevenLabsEngine.synthesize`` does not need to re-read YAML on
        # every call. Empty string clears the override.
        elevenlabs_cfg = cfg.get("elevenlabs") or {}
        set_elevenlabs_api_key(elevenlabs_cfg.get("api_key", ""))
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
            "export_options": [
                {
                    "id": "audiobook",
                    "label": {"de": "Audiobook (MP3)", "en": "Audiobook (MP3)"},
                    "icon": "headphones",
                },
            ],
        }

    def health(self) -> dict[str, Any]:
        """Report plugin health."""
        return {"status": "ok", "engine": "edge-tts"}
