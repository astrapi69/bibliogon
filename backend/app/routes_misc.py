"""Miscellaneous core routes: TTS voices, i18n catalogs, health.

Extracted from ``app/main.py`` (God-file decomposition, 2026-06-14).
These endpoints depend only on the database / config and need no plugin
manager, so they live in their own APIRouter mounted by
``router_registration.register_routers``.
"""

from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pluginforge.config import load_i18n

from app import __version__

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent


@router.get("/voices")
def list_voices(engine: str = "edge-tts", language: str | None = None):
    """List TTS voices from the database (always available, no plugin needed)."""
    from app.database import SessionLocal
    from app.voice_store import get_voices

    db = SessionLocal()
    try:
        return get_voices(db, engine, language)
    finally:
        db.close()


@router.post("/voices/sync")
async def sync_voices():
    """Re-sync Edge TTS voices from the API into the database."""
    from app.database import SessionLocal
    from app.voice_store import sync_edge_tts_voices

    db = SessionLocal()
    try:
        count = await sync_edge_tts_voices(db)
        return {"synced": count, "engine": "edge-tts"}
    finally:
        db.close()


@router.get("/i18n/{lang}")
def get_i18n(lang: str) -> dict[str, Any]:
    """Return the merged i18n catalog for ``lang``."""
    return dict(load_i18n(BASE_DIR / "config", lang))


@router.get("/health")
def health():
    """Liveness probe with version + debug flag."""
    from app.main import DEBUG

    return {"status": "ok", "version": __version__, "debug": DEBUG}
