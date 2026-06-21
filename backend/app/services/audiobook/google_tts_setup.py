"""Google Cloud TTS engine wiring + voice seeding.

Extracted from ``routers/audiobook.py`` (God-file split #8, 2026-06-14).
Pushes uploaded credentials into the live TTS engine and seeds the
available Google voices into the DB in the background. The in-memory
``_seeding_status`` dict is shared with the router endpoints (mutated in
place, never reassigned) so the frontend can poll seeding progress.
"""

import logging
from pathlib import Path
from typing import Any

from app.database import SessionLocal
from app.models import AudioVoice

logger = logging.getLogger(__name__)

# In-memory seeding status so the frontend can poll until voices are loaded.
_seeding_status: dict[str, Any] = {}


def push_google_creds_to_engine(path: str) -> None:
    """Best-effort: push the credentials path into the live engine module."""
    try:
        from bibliogon_audiobook.tts_engine import set_google_cloud_credentials_path
    except ImportError:
        return
    set_google_cloud_credentials_path(path)


def seed_google_voices_sync(credentials_path: Path) -> None:
    """Background: load all Google Cloud TTS voices into the DB.

    Runs in a thread via BackgroundTasks. Uses its own DB session so
    the request that triggered it is not blocked.
    """
    _seeding_status["google-cloud-tts"] = {"done": False, "error": None, "count": 0}
    db = SessionLocal()
    try:
        from manuscripta.audiobook.tts import create_adapter

        adapter = create_adapter(
            "google-cloud-tts",
            credentials_path=str(credentials_path),
            voice_id="placeholder",
            language="en-US",
        )
        voices = adapter.list_voices()

        db.query(AudioVoice).filter(AudioVoice.engine == "google-cloud-tts").delete()
        for v in voices:
            db.add(
                AudioVoice(
                    engine=v.engine,
                    language=v.language,
                    voice_id=v.voice_id,
                    display_name=v.display_name,
                    gender=v.gender,
                    quality=getattr(v, "quality", "standard"),
                )
            )
        db.commit()
        _seeding_status["google-cloud-tts"] = {"done": True, "error": None, "count": len(voices)}
        logger.info("Seeded %d Google Cloud TTS voices", len(voices))
    except Exception as e:
        db.rollback()
        logger.error("Google Cloud TTS voice seeding failed: %s", e, exc_info=True)
        _seeding_status["google-cloud-tts"] = {"done": True, "error": str(e), "count": 0}
    finally:
        db.close()
        # Clean up the temp credentials file
        if credentials_path.exists():
            credentials_path.unlink(missing_ok=True)
