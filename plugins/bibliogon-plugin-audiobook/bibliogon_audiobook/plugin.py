"""Audiobook Plugin - TTS-based audiobook generation."""

import asyncio
import shutil
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

        from .generator import generate_audiobook

        chapters = options.get("chapters", [])
        if not chapters:
            return None

        # Use book-specific TTS settings with fallback to plugin config
        settings = (self.config or {}).get("settings", {})
        engine_id = book.get("tts_engine") or settings.get("engine", "edge-tts")
        voice = book.get("tts_voice") or settings.get("default_voice", "")
        language = book.get("tts_language") or book.get("language", "de")
        merge = settings.get("merge", True)

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
                merge=merge,
            ))
        finally:
            loop.close()

        # Return merged file or ZIP of chapters
        if result.get("merged_file"):
            return output_dir / result["merged_file"]

        # Bundle chapter MP3s into ZIP
        import re
        slug = re.sub(r"[^a-z0-9\-]", "-", book.get("title", "audiobook").lower())[:50]
        zip_path = shutil.make_archive(str(output_dir / f"{slug}-audiobook"), "zip", str(output_dir))
        return Path(zip_path)
