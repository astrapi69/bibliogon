"""TTS engine abstraction for audiobook generation.

Thin async wrapper around manuscripta's synchronous TTS adapter layer.
Each engine class below delegates to ``manuscripta.audiobook.tts.create_adapter``
for the actual TTS work and runs the blocking ``synthesize()`` call on a thread
via ``asyncio.to_thread``.

Public API consumed by the rest of bibliogon:

- ``TTSEngine`` ABC (used as type annotation in generator.py)
- ``get_engine(engine_id)`` factory
- ``ENGINES`` registry dict
- ``set_elevenlabs_api_key`` / ``get_elevenlabs_api_key`` (key management)
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ElevenLabs API key management (process-wide singleton)
# ---------------------------------------------------------------------------

_ELEVENLABS_API_KEY: str = ""


def set_elevenlabs_api_key(key: str | None) -> None:
    """Inject the ElevenLabs API key from the plugin config.

    Empty / None clears the override and lets the env var take over.
    """
    global _ELEVENLABS_API_KEY
    _ELEVENLABS_API_KEY = (key or "").strip()


def get_elevenlabs_api_key() -> str:
    """Return the configured key, falling back to ``ELEVENLABS_API_KEY``."""
    import os
    return _ELEVENLABS_API_KEY or os.environ.get("ELEVENLABS_API_KEY") or ""


# ---------------------------------------------------------------------------
# TTSEngine ABC (kept for generator.py / routes.py type compatibility)
# ---------------------------------------------------------------------------

class TTSEngine(ABC):
    """Abstract base class for TTS engines."""

    @abstractmethod
    async def synthesize(self, text: str, output_path: Path, voice: str, language: str, rate: str = "") -> Path:
        """Synthesize text to an audio file."""
        ...

    @abstractmethod
    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        """List available voices, optionally filtered by language."""
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Default voice mapping per language (used when the caller passes no voice)
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


def _speed_to_edge_rate(speed: str) -> str:
    """Convert speed multiplier (e.g. '1.25') to Edge TTS rate format ('+25%')."""
    try:
        val = float(speed)
        pct = int((val - 1.0) * 100)
        return f"{pct:+d}%"
    except (ValueError, TypeError):
        return "+0%"


def _default_voice_for_language(language: str) -> str:
    """Get default Edge TTS voice for a language code."""
    lang = language.lower().split("-")[0]
    return _DEFAULT_VOICES.get(lang, "en-US-GuyNeural")


def _speed_to_pyttsx3_rate(speed: str) -> int:
    """Convert speed multiplier (e.g. '1.25') to pyttsx3 rate (words per minute)."""
    try:
        val = float(speed)
    except (ValueError, TypeError):
        val = 1.0
    return max(80, int(180 * val))


def _voice_info_to_dict(voice_info: Any) -> dict[str, str]:
    """Convert a manuscripta ``VoiceInfo`` to the dict format bibliogon uses."""
    return {
        "id": voice_info.voice_id,
        "name": voice_info.display_name,
        "language": voice_info.language,
        "gender": voice_info.gender,
    }


# ---------------------------------------------------------------------------
# Concrete engine wrappers (delegate to manuscripta adapters)
# ---------------------------------------------------------------------------

class EdgeTTSEngine(TTSEngine):
    """Microsoft Edge TTS engine (free, no API key required).

    Delegates to ``manuscripta.audiobook.tts.EdgeTTSAdapter``.
    """

    @property
    def engine_id(self) -> str:
        return "edge-tts"

    @property
    def engine_name(self) -> str:
        return "Microsoft Edge TTS"

    async def synthesize(self, text: str, output_path: Path, voice: str, language: str, rate: str = "") -> Path:
        """Generate MP3 via Edge TTS (native async, no thread needed)."""
        import edge_tts

        if not voice:
            voice = _default_voice_for_language(language)
        edge_rate = _speed_to_edge_rate(rate) if rate else "+0%"
        communicate = edge_tts.Communicate(text, voice, rate=edge_rate)
        await communicate.save(str(output_path))
        logger.info("Edge TTS: generated %s (%d chars, rate=%s)", output_path.name, len(text), edge_rate)
        return output_path

    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        """List Edge TTS voices via the manuscripta adapter."""
        from manuscripta.audiobook.tts import create_adapter
        adapter = create_adapter("edge-tts", lang=language or "en")
        voices = await asyncio.to_thread(adapter.list_voices, language)
        return [_voice_info_to_dict(v) for v in voices]


class GoogleTTSEngine(TTSEngine):
    """Google Translate TTS via the ``gtts`` library (free, no API key).

    Delegates to ``manuscripta.audiobook.tts.GoogleTranslateTTSAdapter``.
    """

    @property
    def engine_id(self) -> str:
        return "google-tts"

    @property
    def engine_name(self) -> str:
        return "Google TTS (gTTS)"

    async def synthesize(
        self, text: str, output_path: Path, voice: str = "", language: str = "de", rate: str = "",
    ) -> Path:
        from manuscripta.audiobook.tts import create_adapter

        lang = (language or "de").lower().split("-")[0]
        adapter = create_adapter("google-translate", lang=lang)
        await asyncio.to_thread(adapter.synthesize, text, output_path)
        logger.info("Google TTS: generated %s (%d chars, lang=%s)", output_path.name, len(text), lang)
        return output_path

    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        from manuscripta.audiobook.tts import create_adapter
        lang = (language or "").lower().split("-")[0] if language else ""
        adapter = create_adapter("google-translate", lang=lang or "en")
        voices = await asyncio.to_thread(adapter.list_voices, language)
        if voices:
            return [_voice_info_to_dict(v) for v in voices]
        # gTTS may return nothing meaningful; fall back to a stub entry
        return [{
            "id": lang or "default",
            "name": f"Google TTS ({lang or 'auto'})",
            "language": lang,
            "gender": "unknown",
        }]


class Pyttsx3Engine(TTSEngine):
    """Local offline TTS via the system's text-to-speech subsystem.

    Delegates to ``manuscripta.audiobook.tts.Pyttsx3Adapter``.
    """

    @property
    def engine_id(self) -> str:
        return "pyttsx3"

    @property
    def engine_name(self) -> str:
        return "pyttsx3 (offline)"

    async def synthesize(
        self, text: str, output_path: Path, voice: str = "", language: str = "de", rate: str = "",
    ) -> Path:
        from manuscripta.audiobook.tts import create_adapter

        rate_int = _speed_to_pyttsx3_rate(rate)
        adapter = create_adapter("pyttsx3", voice=voice or None, rate=rate_int)
        await asyncio.to_thread(adapter.synthesize, text, output_path)
        logger.info("pyttsx3: generated %s (%d chars)", output_path.name, len(text))
        return output_path

    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        from manuscripta.audiobook.tts import create_adapter

        def _query() -> list[dict[str, str]]:
            try:
                adapter = create_adapter("pyttsx3")
                voices = adapter.list_voices(language)
                return [_voice_info_to_dict(v) for v in voices]
            except Exception as e:  # noqa: BLE001
                logger.warning("pyttsx3 voice listing failed: %s", e)
                return []

        return await asyncio.to_thread(_query)


class ElevenLabsEngine(TTSEngine):
    """High-quality TTS via the ElevenLabs API (requires API key).

    Delegates to ``manuscripta.audiobook.tts.ElevenLabsAdapter``.
    """

    @property
    def engine_id(self) -> str:
        return "elevenlabs"

    @property
    def engine_name(self) -> str:
        return "ElevenLabs"

    async def synthesize(
        self, text: str, output_path: Path, voice: str = "", language: str = "de", rate: str = "",
    ) -> Path:
        api_key = get_elevenlabs_api_key()
        if not api_key:
            raise RuntimeError(
                "ElevenLabs requires an API key. Configure it under "
                "Settings > Plugins > Audiobook or set ELEVENLABS_API_KEY."
            )

        from manuscripta.audiobook.tts import create_adapter

        lang = (language or "en").lower().split("-")[0]
        adapter = create_adapter(
            "elevenlabs",
            api_key=api_key,
            voice=voice or "Rachel",
            lang=lang,
        )
        await asyncio.to_thread(adapter.synthesize, text, output_path)
        logger.info("ElevenLabs: generated %s (%d chars, voice=%s)", output_path.name, len(text), voice or "Rachel")
        return output_path

    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        """Query ElevenLabs API live; returns [] if no API key is configured."""
        api_key = get_elevenlabs_api_key()
        if not api_key:
            return []

        def _query() -> list[dict[str, str]]:
            from manuscripta.audiobook.tts import create_adapter
            try:
                adapter = create_adapter("elevenlabs", api_key=api_key)
                voices = adapter.list_voices(language)
                return [_voice_info_to_dict(v) for v in voices]
            except Exception as e:  # noqa: BLE001
                logger.warning("ElevenLabs voice list failed: %s", e)
                return []

        return await asyncio.to_thread(_query)


# Process-wide path to decrypted Google Cloud credentials temp file.
# Populated when the backend uploads and validates a service account JSON;
# the engine reads it lazily so the heavy google-cloud-texttospeech dep
# is only imported when the user actually picks this engine.
_GOOGLE_CLOUD_CREDENTIALS_PATH: str = ""


def set_google_cloud_credentials_path(path: str | None) -> None:
    """Inject the temp-file path of the decrypted Google SA JSON."""
    global _GOOGLE_CLOUD_CREDENTIALS_PATH
    _GOOGLE_CLOUD_CREDENTIALS_PATH = (path or "").strip()


def get_google_cloud_credentials_path() -> str:
    """Return the current credentials path, or empty string."""
    return _GOOGLE_CLOUD_CREDENTIALS_PATH


class GoogleCloudTTSEngine(TTSEngine):
    """Google Cloud Text-to-Speech (premium, requires Service Account).

    Delegates to ``manuscripta.audiobook.tts.GoogleCloudTTSAdapter``
    which is lazily imported so the heavy ``google-cloud-texttospeech``
    package is only needed when the user actually picks this engine.
    """

    @property
    def engine_id(self) -> str:
        return "google-cloud-tts"

    @property
    def engine_name(self) -> str:
        return "Google Cloud TTS"

    def _require_credentials(self) -> str:
        creds = get_google_cloud_credentials_path()
        if not creds:
            raise RuntimeError(
                "Google Cloud TTS requires a Service Account. "
                "Upload it under Settings > Plugins > Audiobook."
            )
        return creds

    async def synthesize(
        self, text: str, output_path: Path, voice: str = "", language: str = "de", rate: str = "",
    ) -> Path:
        from manuscripta.audiobook.tts import create_adapter

        creds = self._require_credentials()
        lang = (language or "de").lower()
        speed = 1.0
        try:
            speed = float(rate) if rate else 1.0
        except (ValueError, TypeError):
            pass
        adapter = create_adapter(
            "google-cloud-tts",
            credentials_path=creds,
            voice_id=voice or f"{lang}-Standard-A",
            language=lang,
            speed=speed,
        )
        await asyncio.to_thread(adapter.synthesize, text, output_path)
        logger.info(
            "Google Cloud TTS: generated %s (%d chars, voice=%s)",
            output_path.name, len(text), voice,
        )
        return output_path

    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        creds = get_google_cloud_credentials_path()
        if not creds:
            return []

        def _query() -> list[dict[str, str]]:
            from manuscripta.audiobook.tts import create_adapter
            try:
                adapter = create_adapter(
                    "google-cloud-tts",
                    credentials_path=creds,
                    voice_id="placeholder",
                    language=language or "en-US",
                )
                voices = adapter.list_voices(language)
                return [_voice_info_to_dict(v) for v in voices]
            except Exception as e:  # noqa: BLE001
                logger.warning("Google Cloud TTS voice list failed: %s", e)
                return []

        return await asyncio.to_thread(_query)


# ---------------------------------------------------------------------------
# Registry and factory
# ---------------------------------------------------------------------------

ENGINES: dict[str, type[TTSEngine]] = {
    "edge-tts": EdgeTTSEngine,
    "google-tts": GoogleTTSEngine,
    "pyttsx3": Pyttsx3Engine,
    "elevenlabs": ElevenLabsEngine,
    "google-cloud-tts": GoogleCloudTTSEngine,
}


def get_engine(engine_id: str = "edge-tts") -> TTSEngine:
    """Get a TTS engine instance by ID.

    Falls back to ``edge-tts`` with a warning if the requested engine
    is unknown - this prevents legacy ``Book.tts_engine`` values from
    crashing the export pipeline.
    """
    engine_class = ENGINES.get(engine_id)
    if engine_class is None:
        logger.warning(
            "Unknown TTS engine '%s', falling back to edge-tts (available: %s)",
            engine_id, ", ".join(sorted(ENGINES.keys())),
        )
        engine_class = ENGINES["edge-tts"]
    return engine_class()
