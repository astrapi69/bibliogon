"""Tests for TTS engine module."""

import pytest

from bibliogon_audiobook.tts_engine import (
    ENGINES,
    EdgeTTSEngine,
    _default_voice_for_language,
    get_engine,
)


def test_engines_registry():
    assert "edge-tts" in ENGINES


def test_get_engine_valid():
    engine = get_engine("edge-tts")
    assert isinstance(engine, EdgeTTSEngine)


def test_get_engine_invalid():
    with pytest.raises(ValueError, match="Unknown TTS engine"):
        get_engine("nonexistent")


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
