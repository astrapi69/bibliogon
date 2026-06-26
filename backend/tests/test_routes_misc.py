"""Tests for the miscellaneous core routes (app/routes_misc.py).

Covers the TTS-voice listing, the i18n catalog endpoint, the health
probe, and the Edge-TTS voice sync (the only network call is mocked -
everything else exercises the real DB + config).
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import AudioVoice


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


class TestVoicesEndpoint:
    """GET /api/voices reads TTS voices from the DB (no plugin needed)."""

    def test_list_voices_empty_default_engine(self, client):
        r = client.get("/api/voices")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_voices_returns_seeded_rows_for_engine_language(self, client):
        db = SessionLocal()
        try:
            # Idempotent seed: another test (or app-startup voice sync) may
            # have already inserted this voice_id, which is UNIQUE. A bare
            # add() then collides under the full-suite order. Delete any
            # existing row first so this test is order-independent.
            db.query(AudioVoice).filter(
                AudioVoice.voice_id == "de-DE-KatjaNeural"
            ).delete()
            db.add(
                AudioVoice(
                    engine="edge-tts",
                    language="de-DE",
                    voice_id="de-DE-KatjaNeural",
                    display_name="Katja",
                    gender="Female",
                    quality="standard",
                )
            )
            db.commit()
        finally:
            db.close()

        r = client.get("/api/voices", params={"engine": "edge-tts", "language": "de"})
        assert r.status_code == 200
        voices = r.json()
        assert any(v["id"] == "de-DE-KatjaNeural" for v in voices)

    def test_list_voices_unknown_engine_returns_empty(self, client):
        r = client.get("/api/voices", params={"engine": "does-not-exist"})
        assert r.status_code == 200
        assert r.json() == []


class TestVoicesSyncEndpoint:
    """POST /api/voices/sync re-syncs Edge voices (network call mocked)."""

    def test_sync_voices_returns_count(self, client):
        with patch("app.voice_store.sync_edge_tts_voices", new=AsyncMock(return_value=42)):
            r = client.post("/api/voices/sync")
        assert r.status_code == 200
        body = r.json()
        assert body == {"synced": 42, "engine": "edge-tts"}


class TestI18nEndpoint:
    """GET /api/i18n/{lang} returns the merged catalog as a dict."""

    def test_get_i18n_known_language(self, client):
        r = client.get("/api/i18n/de")
        assert r.status_code == 200
        catalog = r.json()
        assert isinstance(catalog, dict)
        assert len(catalog) > 0

    def test_get_i18n_english(self, client):
        r = client.get("/api/i18n/en")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)


class TestHealthEndpoint:
    """GET /api/health is the liveness probe."""

    def test_health_reports_version_and_debug(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "version" in body
        assert "debug" in body
