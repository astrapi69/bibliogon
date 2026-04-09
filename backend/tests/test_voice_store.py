"""Tests for ``voice_store.get_voices`` filter logic.

Regression: the audiobook voice dropdown leaked Edge TTS German voices
into engines like Google TTS / pyttsx3 / ElevenLabs because the frontend
fell back to a hardcoded list when ``/api/voices`` returned ``[]``. The
fix lives in the frontend, but ``get_voices`` is the contract those
fallbacks were papering over: it must filter strictly by engine, and
its language matching must be predictable in both forms (``"de"`` vs
``"de-DE"``).
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import AudioVoice, Base
from app.voice_store import get_voices


@pytest.fixture
def db():
    """In-memory SQLite session preloaded with a representative voice set."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    now = datetime.now(timezone.utc)
    rows = [
        # German Edge variants across regions
        ("edge-tts", "de-DE", "de-DE-KatjaNeural", "Katja", "Female"),
        ("edge-tts", "de-DE", "de-DE-ConradNeural", "Conrad", "Male"),
        ("edge-tts", "de-AT", "de-AT-IngridNeural", "Ingrid", "Female"),
        ("edge-tts", "de-CH", "de-CH-LeniNeural", "Leni", "Female"),
        # English Edge
        ("edge-tts", "en-US", "en-US-GuyNeural", "Guy", "Male"),
        ("edge-tts", "en-GB", "en-GB-RyanNeural", "Ryan", "Male"),
        # A different engine sharing language - must NEVER appear in
        # the edge-tts result set, this is the bug we are guarding.
        ("google-tts", "de", "google-de", "Google DE", "unknown"),
        ("elevenlabs", "en", "rachel", "Rachel", "Female"),
    ]
    for engine_id, lang, vid, name, gender in rows:
        session.add(AudioVoice(
            engine=engine_id, language=lang, voice_id=vid,
            display_name=name, gender=gender, updated_at=now,
        ))
    session.commit()
    yield session
    session.close()


def test_engine_filter_isolates_engines(db):
    """get_voices(engine='edge-tts') must NOT leak google-tts/elevenlabs rows."""
    voices = get_voices(db, engine="edge-tts", language="de")
    voice_ids = {v["id"] for v in voices}
    assert "google-de" not in voice_ids
    assert "rachel" not in voice_ids
    # All returned voices belong to edge-tts
    for v in voices:
        assert not v["id"].startswith("google")
        assert v["id"] != "rachel"


def test_bare_language_returns_all_regional_variants(db):
    """language='de' returns de-DE, de-AT, de-CH (prefix mode)."""
    voices = get_voices(db, engine="edge-tts", language="de")
    languages = {v["language"] for v in voices}
    assert languages == {"de-DE", "de-AT", "de-CH"}
    assert len(voices) == 4  # 2x de-DE + 1 de-AT + 1 de-CH


def test_full_locale_returns_only_exact_match(db):
    """language='de-DE' returns ONLY de-DE, not de-AT or de-CH."""
    voices = get_voices(db, engine="edge-tts", language="de-DE")
    languages = {v["language"] for v in voices}
    assert languages == {"de-DE"}
    assert len(voices) == 2  # Katja + Conrad


def test_language_match_is_case_insensitive(db):
    """User-supplied 'DE' / 'de-de' must work as well as the canonical form."""
    upper = get_voices(db, engine="edge-tts", language="DE")
    canonical = get_voices(db, engine="edge-tts", language="de")
    assert {v["id"] for v in upper} == {v["id"] for v in canonical}

    mixed = get_voices(db, engine="edge-tts", language="de-de")
    exact = get_voices(db, engine="edge-tts", language="de-DE")
    assert {v["id"] for v in mixed} == {v["id"] for v in exact}


def test_unknown_engine_returns_empty(db):
    """An unknown engine never returns voices from another engine."""
    assert get_voices(db, engine="ghost-tts", language="de") == []


def test_unknown_language_returns_empty(db):
    """A language with no matching voices returns []."""
    assert get_voices(db, engine="edge-tts", language="zz") == []


def test_no_language_returns_all_engine_voices(db):
    """language=None still filters by engine but skips the language predicate."""
    voices = get_voices(db, engine="edge-tts", language=None)
    # 4 German + 2 English Edge voices, no google or elevenlabs
    assert len(voices) == 6
    engines = {v["language"].split("-")[0] for v in voices}
    assert engines == {"de", "en"}


def test_english_does_not_leak_into_german_query(db):
    """Regression: en-US must not match a 'de' prefix query."""
    voices = get_voices(db, engine="edge-tts", language="de")
    voice_ids = {v["id"] for v in voices}
    assert "en-US-GuyNeural" not in voice_ids
    assert "en-GB-RyanNeural" not in voice_ids
