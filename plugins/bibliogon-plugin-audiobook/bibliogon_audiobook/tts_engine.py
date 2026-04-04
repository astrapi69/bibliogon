"""TTS engine abstraction for audiobook generation.

Supports multiple TTS backends: Edge TTS (default, free), with
extensible interface for Google TTS, pyttsx3, ElevenLabs.
"""

import logging
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path

logger = logging.getLogger(__name__)


class TTSEngine(ABC):
    """Abstract base class for TTS engines."""

    @abstractmethod
    async def synthesize(self, text: str, output_path: Path, voice: str, language: str) -> Path:
        """Synthesize text to an audio file.

        Args:
            text: Plain text to convert to speech.
            output_path: Path for the output MP3 file.
            voice: Voice identifier (engine-specific).
            language: Language code (e.g. "de", "en").

        Returns:
            Path to the generated audio file.
        """
        ...

    @abstractmethod
    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        """List available voices, optionally filtered by language.

        Returns list of dicts with at least: id, name, language, gender.
        """
        ...

    @property
    @abstractmethod
    def engine_id(self) -> str:
        """Unique identifier for this engine."""
        ...

    @property
    @abstractmethod
    def engine_name(self) -> str:
        """Human-readable engine name."""
        ...


class EdgeTTSEngine(TTSEngine):
    """Microsoft Edge TTS engine (free, no API key required).

    Uses the edge-tts library which interfaces with Microsoft's online
    text-to-speech service.
    """

    @property
    def engine_id(self) -> str:
        return "edge-tts"

    @property
    def engine_name(self) -> str:
        return "Microsoft Edge TTS"

    async def synthesize(self, text: str, output_path: Path, voice: str, language: str) -> Path:
        """Generate MP3 via Edge TTS."""
        import edge_tts

        if not voice:
            voice = _default_voice_for_language(language)

        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(output_path))
        logger.info("Edge TTS: generated %s (%d chars)", output_path.name, len(text))
        return output_path

    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        """List Edge TTS voices."""
        import edge_tts

        voices = await edge_tts.list_voices()
        result = []
        for v in voices:
            voice_lang = v.get("Locale", "").split("-")[0].lower()
            if language and voice_lang != language.lower():
                continue
            result.append({
                "id": v.get("ShortName", ""),
                "name": v.get("FriendlyName", ""),
                "language": v.get("Locale", ""),
                "gender": v.get("Gender", ""),
            })
        return result


# Default voice mapping per language
_DEFAULT_VOICES = {
    "de": "de-DE-ConradNeural",
    "en": "en-US-GuyNeural",
    "es": "es-ES-AlvaroNeural",
    "fr": "fr-FR-HenriNeural",
    "el": "el-GR-NestorNeural",
    "it": "it-IT-DiegoNeural",
    "nl": "nl-NL-MaartenNeural",
    "pt": "pt-BR-AntonioNeural",
    "ru": "ru-RU-DmitryNeural",
    "ja": "ja-JP-KeitaNeural",
    "zh": "zh-CN-YunxiNeural",
}


def _default_voice_for_language(language: str) -> str:
    """Get default Edge TTS voice for a language code."""
    lang = language.lower().split("-")[0]
    return _DEFAULT_VOICES.get(lang, "en-US-GuyNeural")


# Registry of available engines
ENGINES: dict[str, type[TTSEngine]] = {
    "edge-tts": EdgeTTSEngine,
}


def get_engine(engine_id: str = "edge-tts") -> TTSEngine:
    """Get a TTS engine instance by ID."""
    engine_class = ENGINES.get(engine_id)
    if not engine_class:
        raise ValueError(f"Unknown TTS engine: {engine_id}. Available: {', '.join(ENGINES.keys())}")
    return engine_class()
