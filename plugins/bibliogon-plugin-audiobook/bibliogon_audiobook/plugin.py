"""Audiobook Plugin - TTS-based audiobook generation."""

import asyncio
import tempfile
from pathlib import Path
from typing import Any

import pluggy

from pluginforge import BasePlugin

hookimpl = pluggy.HookimplMarker("bibliogon.plugins")


class AudiobookPlugin(BasePlugin):
    """Plugin for generating audiobooks from book chapters via TTS."""

    name = "audiobook"
    version = "1.0.0"
    api_version = "1"
    license_tier = "premium"

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

    @hookimpl
    def export_formats(self) -> list[dict[str, Any]]:
        """Register audiobook as an export format."""
        return [
            {
                "id": "audiobook",
                "label": "Audiobook (MP3)",
                "extension": ".mp3",
                "media_type": "audio/mpeg",
            },
        ]

    @hookimpl
    def export_execute(self, book: dict[str, Any], fmt: str, options: dict[str, Any]) -> Path | None:
        """Execute audiobook export if format matches."""
        if fmt != "audiobook":
            return None

        from .generator import bundle_audiobook_output, generate_audiobook, normalize_merge_mode

        chapters = options.get("chapters", [])
        if not chapters:
            return None

        # Book-level merge override falls back to plugin config (default: "merged")
        settings = (self.config or {}).get("settings", {})
        engine_id = book.get("tts_engine") or settings.get("engine", "edge-tts")
        voice = book.get("tts_voice") or settings.get("default_voice", "")
        language = book.get("tts_language") or book.get("language", "de")
        merge_mode = normalize_merge_mode(book.get("audiobook_merge") or settings.get("merge"))

        output_dir = Path(tempfile.mkdtemp(prefix="bibliogon_audiobook_export_"))

        # Run async generator synchronously (hooks are sync)
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(generate_audiobook(
                book_title=book.get("title", "audiobook"),
                chapters=chapters,
                output_dir=output_dir,
                engine_id=engine_id,
                voice=voice,
                language=language,
                merge=merge_mode,
            ))
        finally:
            loop.close()

        return bundle_audiobook_output(result, output_dir, book.get("title", "audiobook"))
