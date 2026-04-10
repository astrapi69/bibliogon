"""Tests for TTS engine module."""

from unittest.mock import MagicMock, patch

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
async def test_google_tts_synthesize_delegates_to_manuscripta(tmp_path):
    """GoogleTTSEngine.synthesize must call create_adapter('google-translate')
    with the collapsed language and delegate to adapter.synthesize().
    """
    mock_adapter = MagicMock()
    with patch("manuscripta.audiobook.tts.create_adapter", return_value=mock_adapter) as mock_create:
        out = tmp_path / "out.mp3"
        engine = GoogleTTSEngine()
        result = await engine.synthesize("Hallo Welt", out, language="de-DE")

    assert result == out
    mock_create.assert_called_once_with("google-translate", lang="de")
    mock_adapter.synthesize.assert_called_once_with("Hallo Welt", out)


@pytest.mark.asyncio
async def test_pyttsx3_synthesize_delegates_to_manuscripta(tmp_path):
    mock_adapter = MagicMock()
    with patch("manuscripta.audiobook.tts.create_adapter", return_value=mock_adapter) as mock_create:
        engine = Pyttsx3Engine()
        await engine.synthesize("Test", tmp_path / "x.mp3", voice="german", rate="1.5")

    mock_create.assert_called_once_with("pyttsx3", voice="german", rate=270)
    mock_adapter.synthesize.assert_called_once()


@pytest.mark.asyncio
async def test_elevenlabs_synthesize_requires_api_key(monkeypatch, tmp_path):
    """ElevenLabs engine refuses to run without ELEVENLABS_API_KEY."""
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    from bibliogon_audiobook.tts_engine import set_elevenlabs_api_key
    set_elevenlabs_api_key("")
    engine = ElevenLabsEngine()
    with pytest.raises(RuntimeError, match="API key"):
        await engine.synthesize("text", tmp_path / "x.mp3")


@pytest.mark.asyncio
async def test_elevenlabs_synthesize_delegates_when_key_present(monkeypatch, tmp_path):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key-123")
    from bibliogon_audiobook.tts_engine import set_elevenlabs_api_key
    set_elevenlabs_api_key("test-key-123")

    mock_adapter = MagicMock()
    with patch("manuscripta.audiobook.tts.create_adapter", return_value=mock_adapter) as mock_create:
        engine = ElevenLabsEngine()
        await engine.synthesize("text", tmp_path / "x.mp3", voice="Bella", language="en-US")

    mock_create.assert_called_once_with(
        "elevenlabs", api_key="test-key-123", voice="Bella", lang="en",
    )
    mock_adapter.synthesize.assert_called_once()


# --- list_voices fallbacks ---


@pytest.mark.asyncio
async def test_google_list_voices_returns_voices():
    """GoogleTTSEngine.list_voices delegates to the manuscripta adapter."""
    from manuscripta.audiobook.tts import VoiceInfo
    fake_voices = [VoiceInfo(engine="gtts", voice_id="de", display_name="Google TTS (de)", language="de", gender="unknown")]
    mock_adapter = MagicMock()
    mock_adapter.list_voices.return_value = fake_voices
    with patch("manuscripta.audiobook.tts.create_adapter", return_value=mock_adapter):
        voices = await GoogleTTSEngine().list_voices(language="de")
    assert len(voices) == 1
    assert voices[0]["language"] == "de"


@pytest.mark.asyncio
async def test_elevenlabs_list_voices_empty_without_api_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    from bibliogon_audiobook.tts_engine import set_elevenlabs_api_key
    set_elevenlabs_api_key("")
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
