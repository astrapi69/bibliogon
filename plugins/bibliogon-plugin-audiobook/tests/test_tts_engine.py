"""Tests for TTS engine module."""

import pytest

from bibliogon_audiobook.tts_engine import (
    ENGINES,
    EdgeTTSEngine,
    ElevenLabsEngine,
    GoogleTTSEngine,
    Pyttsx3Engine,
    _default_voice_for_language,
    _speed_to_pyttsx3_rate,
    get_engine,
)


def test_engines_registry_includes_all_four():
    """All four engines wrapped from manuscripta must be registered."""
    assert "edge-tts" in ENGINES
    assert "google-tts" in ENGINES
    assert "pyttsx3" in ENGINES
    assert "elevenlabs" in ENGINES


def test_get_engine_valid():
    engine = get_engine("edge-tts")
    assert isinstance(engine, EdgeTTSEngine)


def test_get_engine_unknown_falls_back_to_edge(caplog):
    """Unknown engine ids must NOT crash the export pipeline.

    Real users have books with legacy tts_engine values that no longer
    exist; the export job should fall back to edge-tts and log a warning.
    """
    import logging
    with caplog.at_level(logging.WARNING):
        engine = get_engine("nonexistent")
    assert isinstance(engine, EdgeTTSEngine)
    assert any("Unknown TTS engine" in r.message for r in caplog.records)


def test_get_engine_returns_each_registered_engine():
    assert isinstance(get_engine("edge-tts"), EdgeTTSEngine)
    assert isinstance(get_engine("google-tts"), GoogleTTSEngine)
    assert isinstance(get_engine("pyttsx3"), Pyttsx3Engine)
    assert isinstance(get_engine("elevenlabs"), ElevenLabsEngine)


# --- Engine identity ---


def test_google_tts_engine_metadata():
    e = GoogleTTSEngine()
    assert e.engine_id == "google-tts"
    assert "Google" in e.engine_name


def test_pyttsx3_engine_metadata():
    e = Pyttsx3Engine()
    assert e.engine_id == "pyttsx3"
    assert "pyttsx3" in e.engine_name.lower()


def test_elevenlabs_engine_metadata():
    e = ElevenLabsEngine()
    assert e.engine_id == "elevenlabs"
    assert e.engine_name == "ElevenLabs"


# --- Speed conversion for pyttsx3 (words per minute) ---


def test_speed_to_pyttsx3_rate_default():
    assert _speed_to_pyttsx3_rate("1.0") == 180


def test_speed_to_pyttsx3_rate_faster():
    assert _speed_to_pyttsx3_rate("1.5") == 270


def test_speed_to_pyttsx3_rate_slower():
    assert _speed_to_pyttsx3_rate("0.5") == 90


def test_speed_to_pyttsx3_rate_clamps_to_minimum():
    assert _speed_to_pyttsx3_rate("0.1") >= 80


def test_speed_to_pyttsx3_rate_garbage_falls_back_to_default():
    assert _speed_to_pyttsx3_rate("abc") == 180
    assert _speed_to_pyttsx3_rate("") == 180


# --- Wrapper -> manuscripta delegation ---


@pytest.mark.asyncio
async def test_google_tts_synthesize_delegates_to_manuscripta(monkeypatch, tmp_path):
    """GoogleTTSEngine.synthesize must instantiate the manuscripta adapter
    with the per-call language and call its speak() method exactly once.
    """
    captured: dict = {}

    class FakeAdapter:
        def __init__(self, lang: str = "en"):
            captured["lang"] = lang

        def speak(self, text, output_path):
            captured["text"] = text
            captured["output_path"] = output_path

    import sys, types
    fake_module = types.ModuleType("manuscripta.audiobook.tts.gtts_adapter")
    fake_module.GoogleTTSAdapter = FakeAdapter
    sys.modules["manuscripta.audiobook.tts.gtts_adapter"] = fake_module

    out = tmp_path / "out.mp3"
    engine = GoogleTTSEngine()
    result = await engine.synthesize("Hallo Welt", out, language="de-DE")

    assert result == out
    assert captured["lang"] == "de"  # locale collapsed to bare lang code
    assert captured["text"] == "Hallo Welt"


@pytest.mark.asyncio
async def test_pyttsx3_synthesize_delegates_to_manuscripta(monkeypatch, tmp_path):
    captured: dict = {}

    class FakeAdapter:
        def __init__(self, voice=None, rate: int = 180):
            captured["voice"] = voice
            captured["rate"] = rate

        def speak(self, text, output_path):
            captured["text"] = text

    import sys, types
    fake_module = types.ModuleType("manuscripta.audiobook.tts.pyttsx3_adapter")
    fake_module.Pyttsx3Adapter = FakeAdapter
    sys.modules["manuscripta.audiobook.tts.pyttsx3_adapter"] = fake_module

    engine = Pyttsx3Engine()
    await engine.synthesize("Test", tmp_path / "x.mp3", voice="german", rate="1.5")

    assert captured["voice"] == "german"
    assert captured["rate"] == 270  # 1.5 * 180


@pytest.mark.asyncio
async def test_elevenlabs_synthesize_requires_api_key(monkeypatch, tmp_path):
    """ElevenLabs engine refuses to run without ELEVENLABS_API_KEY."""
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    engine = ElevenLabsEngine()
    with pytest.raises(RuntimeError, match="ELEVENLABS_API_KEY"):
        await engine.synthesize("text", tmp_path / "x.mp3")


@pytest.mark.asyncio
async def test_elevenlabs_synthesize_delegates_when_key_present(monkeypatch, tmp_path):
    captured: dict = {}

    class FakeAdapter:
        def __init__(self, api_key: str, voice="Rachel", model="eleven_multilingual_v2", lang="en"):
            captured["api_key"] = api_key
            captured["voice"] = voice
            captured["lang"] = lang

        def speak(self, text, output_path):
            captured["text"] = text

    import sys, types
    fake_module = types.ModuleType("manuscripta.audiobook.tts.elevenlabs_adapter")
    fake_module.ElevenLabsAdapter = FakeAdapter
    sys.modules["manuscripta.audiobook.tts.elevenlabs_adapter"] = fake_module

    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key-123")
    engine = ElevenLabsEngine()
    await engine.synthesize("text", tmp_path / "x.mp3", voice="Bella", language="en-US")

    assert captured["api_key"] == "test-key-123"
    assert captured["voice"] == "Bella"
    assert captured["lang"] == "en"


# --- list_voices fallbacks ---


@pytest.mark.asyncio
async def test_google_list_voices_returns_one_per_language():
    voices = await GoogleTTSEngine().list_voices(language="de")
    assert len(voices) == 1
    assert voices[0]["language"] == "de"


@pytest.mark.asyncio
async def test_elevenlabs_list_voices_empty_without_api_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    voices = await ElevenLabsEngine().list_voices()
    assert voices == []


def test_edge_tts_engine_id():
    engine = EdgeTTSEngine()
    assert engine.engine_id == "edge-tts"
    assert engine.engine_name == "Microsoft Edge TTS"


def test_default_voice_german():
    voice = _default_voice_for_language("de")
    assert "de-DE" in voice


def test_default_voice_english():
    voice = _default_voice_for_language("en")
    assert "en-US" in voice


def test_default_voice_unknown_fallback():
    voice = _default_voice_for_language("xx")
    assert "en-US" in voice


def test_default_voice_with_locale():
    voice = _default_voice_for_language("de-DE")
    assert "de-DE" in voice
