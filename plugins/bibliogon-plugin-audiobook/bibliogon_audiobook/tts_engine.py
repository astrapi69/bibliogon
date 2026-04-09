"""TTS engine abstraction for audiobook generation.

Supports multiple TTS backends: Edge TTS (default, free), with
extensible interface for Google TTS, pyttsx3, ElevenLabs.
"""

import logging
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path

logger = logging.getLogger(__name__)

# Process-wide override for the ElevenLabs API key, populated from the
# plugin's YAML config at activation time. Falls back to the environment
# variable so users who already wired ELEVENLABS_API_KEY into .env keep
# working without touching the new Settings UI.
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


class TTSEngine(ABC):
    """Abstract base class for TTS engines."""

    @abstractmethod
    async def synthesize(self, text: str, output_path: Path, voice: str, language: str, rate: str = "") -> Path:
        """Synthesize text to an audio file.

        Args:
            text: Plain text to convert to speech.
            output_path: Path for the output MP3 file.
            voice: Voice identifier (engine-specific).
            language: Language code (e.g. "de", "en").
            rate: Speed multiplier (e.g. "1.0", "1.25", "0.75").

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

    async def synthesize(self, text: str, output_path: Path, voice: str, language: str, rate: str = "") -> Path:
        """Generate MP3 via Edge TTS."""
        import edge_tts

        if not voice:
            voice = _default_voice_for_language(language)

        # Convert speed multiplier to Edge TTS rate format (e.g. "1.25" -> "+25%")
        edge_rate = _speed_to_edge_rate(rate) if rate else "+0%"
        communicate = edge_tts.Communicate(text, voice, rate=edge_rate)
        await communicate.save(str(output_path))
        logger.info("Edge TTS: generated %s (%d chars, rate=%s)", output_path.name, len(text), edge_rate)
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


# --- Adapters around manuscripta.audiobook.tts ---
#
# manuscripta already ships TTS adapter classes (EdgeTTSAdapter,
# GoogleTTSAdapter, Pyttsx3Adapter, ElevenLabsAdapter). They expose a
# synchronous ``speak(text, output_path)`` method and take their
# configuration in ``__init__``. The bibliogon TTSEngine ABC is async
# and gets per-call args, so each engine below is a thin wrapper that:
#
# - lazily imports the underlying lib so a missing optional dep only
#   blows up when the user actually picks that engine
# - constructs the manuscripta adapter once per synthesize() call with
#   the per-call language/voice/rate
# - runs the sync ``speak()`` in ``asyncio.to_thread`` so the async
#   audiobook job loop is never blocked
#
# Doing it this way means we get all four engines without re-implementing
# any TTS logic.


def _raise_missing_lib(engine: str, package: str, original: Exception) -> "None":
    """Re-raise as a friendly RuntimeError chained from the ImportError.

    ``raise`` is the only place ``from`` works, so this helper does the
    raise itself instead of returning the exception.
    """
    raise RuntimeError(
        f"{engine} requires the '{package}' Python package. "
        f"Install it with: poetry add {package}"
    ) from original


class GoogleTTSEngine(TTSEngine):
    """Google Translate TTS via the ``gtts`` library (free, no API key).

    This is the simple Translate-based TTS, not Google Cloud TTS - one
    default voice per language, no Neural2/Wavenet quality tiers.
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
        import asyncio

        try:
            from manuscripta.audiobook.tts.gtts_adapter import GoogleTTSAdapter
        except ImportError as e:
            _raise_missing_lib("Google TTS", "gtts", e)

        lang = (language or "de").lower().split("-")[0]
        adapter = GoogleTTSAdapter(lang=lang)
        await asyncio.to_thread(adapter.speak, text, output_path)
        logger.info("Google TTS: generated %s (%d chars, lang=%s)", output_path.name, len(text), lang)
        return output_path

    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        # gTTS exposes only one voice per language. Return a single
        # representative entry so the dropdown shows something rather
        # than being empty.
        lang = (language or "").lower().split("-")[0] if language else ""
        return [{
            "id": lang or "default",
            "name": f"Google TTS ({lang or 'auto'})",
            "language": lang,
            "gender": "unknown",
        }]


class Pyttsx3Engine(TTSEngine):
    """Local offline TTS via the system's text-to-speech subsystem.

    Uses whichever speech engine is installed on the host (espeak on
    Linux, NSSpeechSynthesizer on macOS, SAPI on Windows).
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
        import asyncio

        try:
            from manuscripta.audiobook.tts.pyttsx3_adapter import Pyttsx3Adapter
        except ImportError as e:
            _raise_missing_lib("pyttsx3", "pyttsx3", e)

        rate_int = _speed_to_pyttsx3_rate(rate)
        adapter = Pyttsx3Adapter(voice=voice or None, rate=rate_int)
        await asyncio.to_thread(adapter.speak, text, output_path)
        logger.info("pyttsx3: generated %s (%d chars)", output_path.name, len(text))
        return output_path

    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        """Query system voices via pyttsx3 directly (no DB cache)."""
        import asyncio

        def _query() -> list[dict[str, str]]:
            try:
                import pyttsx3
            except ImportError:
                return []
            try:
                engine = pyttsx3.init()
            except Exception as e:  # noqa: BLE001
                logger.warning("pyttsx3.init() failed: %s", e)
                return []
            try:
                voices = engine.getProperty("voices") or []
                result: list[dict[str, str]] = []
                for v in voices:
                    langs = getattr(v, "languages", []) or []
                    lang_str = ", ".join(
                        l.decode("utf-8", errors="ignore") if isinstance(l, bytes) else str(l)
                        for l in langs
                    )
                    if language and language.lower() not in lang_str.lower():
                        continue
                    result.append({
                        "id": getattr(v, "id", ""),
                        "name": getattr(v, "name", ""),
                        "language": lang_str,
                        "gender": getattr(v, "gender", "") or "",
                    })
                return result
            finally:
                try:
                    engine.stop()
                except Exception:
                    pass

        return await asyncio.to_thread(_query)


class ElevenLabsEngine(TTSEngine):
    """High-quality TTS via the ElevenLabs API (requires ELEVENLABS_API_KEY)."""

    @property
    def engine_id(self) -> str:
        return "elevenlabs"

    @property
    def engine_name(self) -> str:
        return "ElevenLabs"

    async def synthesize(
        self, text: str, output_path: Path, voice: str = "", language: str = "de", rate: str = "",
    ) -> Path:
        import asyncio

        # API key check before import: it is the most common misconfig
        # and gives a clearer error than ImportError when the user just
        # forgot to configure it.
        api_key = get_elevenlabs_api_key()
        if not api_key:
            raise RuntimeError(
                "ElevenLabs requires an API key. Configure it under "
                "Settings > Plugins > Audiobook or set ELEVENLABS_API_KEY."
            )

        try:
            from manuscripta.audiobook.tts.elevenlabs_adapter import ElevenLabsAdapter
        except ImportError as e:
            _raise_missing_lib("ElevenLabs", "elevenlabs", e)
        lang = (language or "en").lower().split("-")[0]
        adapter = ElevenLabsAdapter(
            api_key=api_key,
            voice=voice or "Rachel",
            lang=lang,
        )
        await asyncio.to_thread(adapter.speak, text, output_path)
        logger.info("ElevenLabs: generated %s (%d chars, voice=%s)", output_path.name, len(text), voice or "Rachel")
        return output_path

    async def list_voices(self, language: str | None = None) -> list[dict[str, str]]:
        """Query ElevenLabs API live; returns [] if no API key is configured."""
        import asyncio

        api_key = get_elevenlabs_api_key()
        if not api_key:
            return []

        def _query() -> list[dict[str, str]]:
            try:
                from elevenlabs import set_api_key, voices  # type: ignore
            except ImportError:
                return []
            try:
                set_api_key(api_key)
                vs = voices()
                return [
                    {
                        "id": v.voice_id if hasattr(v, "voice_id") else getattr(v, "name", ""),
                        "name": getattr(v, "name", ""),
                        "language": "",  # ElevenLabs voices are multilingual
                        "gender": getattr(v, "labels", {}).get("gender", "") if hasattr(v, "labels") else "",
                    }
                    for v in vs
                ]
            except Exception as e:  # noqa: BLE001
                logger.warning("ElevenLabs voice list failed: %s", e)
                return []

        return await asyncio.to_thread(_query)


def _speed_to_pyttsx3_rate(speed: str) -> int:
    """Convert speed multiplier (e.g. '1.25') to pyttsx3 rate (words per minute).

    pyttsx3 default is around 200 wpm; we map 1.0 to 180 (slightly slower
    feels nicer for an audiobook) and scale linearly.
    """
    try:
        val = float(speed)
    except (ValueError, TypeError):
        val = 1.0
    return max(80, int(180 * val))


# Registry of available engines
ENGINES: dict[str, type[TTSEngine]] = {
    "edge-tts": EdgeTTSEngine,
    "google-tts": GoogleTTSEngine,
    "pyttsx3": Pyttsx3Engine,
    "elevenlabs": ElevenLabsEngine,
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
