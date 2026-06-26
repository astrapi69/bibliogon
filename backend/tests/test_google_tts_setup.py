"""Tests for app/services/audiobook/google_tts_setup.py.

Covers the credentials-push helper (both the engine-present and the
ImportError best-effort branch) and the background voice-seeding routine
(success, adapter-failure, and the temp-credentials cleanup). The
external TTS adapter (manuscripta / Google Cloud) is mocked; the DB write
path is exercised for real.
"""

import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.database import SessionLocal
from app.models import AudioVoice
from app.services.audiobook import google_tts_setup


def _fake_voice(voice_id: str) -> SimpleNamespace:
    return SimpleNamespace(
        engine="google-cloud-tts",
        language="en-US",
        voice_id=voice_id,
        display_name=voice_id,
        gender="Female",
        quality="premium",
    )


class TestPushGoogleCreds:
    def test_pushes_path_into_engine_when_importable(self):
        with patch("bibliogon_audiobook.tts_engine.set_google_cloud_credentials_path") as set_path:
            google_tts_setup.push_google_creds_to_engine("/tmp/creds.json")
        set_path.assert_called_once_with("/tmp/creds.json")

    def test_silently_returns_when_engine_module_missing(self):
        # Setting the module to None makes the inner import raise ImportError;
        # the helper must swallow it (best-effort) and return without error.
        with patch.dict(sys.modules, {"bibliogon_audiobook.tts_engine": None}):
            google_tts_setup.push_google_creds_to_engine("/tmp/creds.json")


class TestSeedGoogleVoices:
    def setup_method(self):
        google_tts_setup._seeding_status.pop("google-cloud-tts", None)

    def teardown_method(self):
        google_tts_setup._seeding_status.pop("google-cloud-tts", None)
        db = SessionLocal()
        try:
            db.query(AudioVoice).filter(AudioVoice.engine == "google-cloud-tts").delete()
            db.commit()
        finally:
            db.close()

    def test_seeds_voices_and_marks_done(self, tmp_path):
        creds = tmp_path / "creds.json"
        creds.write_text("{}", encoding="utf-8")

        adapter = MagicMock()
        adapter.list_voices.return_value = [_fake_voice("v1"), _fake_voice("v2")]

        with patch("manuscripta.audiobook.tts.create_adapter", return_value=adapter):
            google_tts_setup.seed_google_voices_sync(creds)

        status = google_tts_setup._seeding_status["google-cloud-tts"]
        assert status == {"done": True, "error": None, "count": 2}

        db = SessionLocal()
        try:
            rows = db.query(AudioVoice).filter(AudioVoice.engine == "google-cloud-tts").all()
            assert {r.voice_id for r in rows} == {"v1", "v2"}
        finally:
            db.close()

        # The temp credentials file is removed when seeding finishes.
        assert not creds.exists()

    def test_records_error_when_adapter_fails(self, tmp_path):
        creds = tmp_path / "creds.json"
        creds.write_text("{}", encoding="utf-8")

        with patch(
            "manuscripta.audiobook.tts.create_adapter",
            side_effect=RuntimeError("bad credentials"),
        ):
            google_tts_setup.seed_google_voices_sync(creds)

        status = google_tts_setup._seeding_status["google-cloud-tts"]
        assert status["done"] is True
        assert status["count"] == 0
        assert "bad credentials" in status["error"]
        # Cleanup still runs in the finally block.
        assert not creds.exists()
