"""Voice store: sync TTS voices from engines into the DB.

Voices are cached in the audio_voices table. On successful API call
the table is updated with current voices; removed voices are deleted.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import AudioVoice

logger = logging.getLogger(__name__)


def get_voices(db: Session, engine: str, language: str | None = None) -> list[dict[str, str]]:
    """Get cached voices from DB, filtered by engine and optional language.

    Language matching is two-mode by design:

    - ``"de-DE"`` (region present): exact case-insensitive match. The
      caller has explicitly asked for German-Germany only and would not
      want German-Austria sneaking in.
    - ``"de"`` (bare language code): prefix match against the stored
      ``Locale``. Returns ``de-DE``, ``de-AT``, ``de-CH``, ...

    Bibliogon's Book.language field stores bare codes today, so the
    prefix branch is the common path. The exact branch exists so that
    plugin authors and tests that pass full locales get the strict
    behaviour they reasonably expect.
    """
    query = db.query(AudioVoice).filter(AudioVoice.engine == engine)
    if language:
        normalized = language.strip().lower()
        if "-" in normalized:
            # Stored locales use hyphenated form ("de-DE"); ilike for
            # case insensitivity ("de-de" still matches "de-DE").
            query = query.filter(AudioVoice.language.ilike(normalized))
        else:
            # Bare code: prefix match. The trailing "-%" requires a
            # region separator so that "en" does not also match a
            # language called "english" if one ever shows up.
            query = query.filter(
                (AudioVoice.language.ilike(normalized))
                | (AudioVoice.language.ilike(f"{normalized}-%"))
            )
    voices = query.order_by(AudioVoice.language, AudioVoice.display_name).all()
    return [
        {
            "id": v.voice_id, "name": v.display_name,
            "language": v.language, "gender": v.gender,
            "quality": getattr(v, "quality", "standard"),
        }
        for v in voices
    ]


async def sync_edge_tts_voices(db: Session) -> int:
    """Fetch all Edge TTS voices and sync into DB.

    New voices are added, existing voices are updated, removed voices are deleted.
    Returns number of voices synced.

    Async because edge_tts.list_voices() is a coroutine and this function
    is called from inside FastAPI's running event loop (lifespan handler).
    Creating a nested loop with asyncio.new_event_loop() is forbidden in
    that context.
    """
    try:
        import edge_tts
    except ImportError:
        logger.warning("edge-tts not installed, skipping voice sync")
        return 0

    try:
        voices = await edge_tts.list_voices()
    except Exception as e:
        logger.error("Failed to fetch Edge TTS voices: %s", e)
        return 0

    now = datetime.now(timezone.utc)
    seen_ids: set[str] = set()

    for v in voices:
        voice_id = v.get("ShortName", "")
        if not voice_id:
            continue
        seen_ids.add(voice_id)

        locale = v.get("Locale", "")
        friendly = v.get("FriendlyName", "")
        # Extract short name: "Microsoft Katja Online (Natural)" -> "Katja"
        display = _extract_display_name(friendly, locale)
        gender = v.get("Gender", "unknown")

        existing = db.query(AudioVoice).filter(AudioVoice.voice_id == voice_id).first()
        if existing:
            existing.display_name = display
            existing.gender = gender
            existing.language = locale
            existing.updated_at = now
        else:
            db.add(AudioVoice(
                engine="edge-tts", language=locale, voice_id=voice_id,
                display_name=display, gender=gender, updated_at=now,
            ))

    # Delete voices that no longer exist in the API response
    deleted = db.query(AudioVoice).filter(
        AudioVoice.engine == "edge-tts",
        AudioVoice.voice_id.notin_(seen_ids),
    ).delete(synchronize_session=False)

    db.commit()
    total = len(seen_ids)
    logger.info("Edge TTS voice sync: %d voices (%d removed)", total, deleted)
    return total


def _extract_display_name(friendly_name: str, locale: str) -> str:
    """Extract a short display name from Edge TTS FriendlyName.

    'Microsoft Server Speech Text to Speech Voice (de-DE, KatjaNeural)' -> 'Katja'
    'Microsoft Katja Online (Natural)' -> 'Katja'
    """
    # Try to extract from parentheses pattern: (locale, NameNeural)
    if "," in friendly_name and "Neural" in friendly_name:
        part = friendly_name.split(",")[-1].strip().rstrip(")")
        name = part.replace("Neural", "").strip()
        if name:
            return name

    # Try "Microsoft Name Online" pattern
    parts = friendly_name.replace("Microsoft", "").strip().split()
    if parts:
        return parts[0]

    return friendly_name


def voice_count(db: Session, engine: str = "edge-tts") -> int:
    """Count cached voices for an engine."""
    return db.query(AudioVoice).filter(AudioVoice.engine == engine).count()
