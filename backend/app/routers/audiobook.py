"""Core backend routes for audiobook configuration and persistent files.

These endpoints intentionally live in the core backend (not in the
``bibliogon-plugin-audiobook`` plugin package) for two reasons:

1. The audiobook plugin is premium-licensed. Users without an active
   license still need to be able to manage their stored ElevenLabs key
   and download audiobook files they generated during a previous trial.
2. The persistence layer (``audiobook_storage``) is plumbing that is
   useful even when the heavy TTS code is not loaded - and the route
   handlers here only depend on storage + a tiny amount of TTS-engine
   key plumbing, both of which are pure-Python and importable.

The actual TTS / generation code stays in the plugin and is gated by
the license check on ``export_async`` and friends.
"""

import logging
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book

logger = logging.getLogger(__name__)

router = APIRouter(tags=["audiobook"])


# Path of the audiobook plugin config YAML on disk. Endpoints that need
# to write back into the YAML (currently: ElevenLabs key) use this so
# the change persists across restarts.
AUDIOBOOK_CONFIG_PATH = Path("config/plugins/audiobook.yaml")
ELEVENLABS_USER_ENDPOINT = "https://api.elevenlabs.io/v1/user"


def _load_yaml_config() -> dict[str, Any]:
    """Read the audiobook plugin config from disk, returning {} if missing."""
    if not AUDIOBOOK_CONFIG_PATH.exists():
        return {}
    try:
        return yaml.safe_load(AUDIOBOOK_CONFIG_PATH.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as e:
        logger.warning("Failed to read audiobook.yaml: %s", e)
        return {}


def _write_yaml_config(cfg: dict[str, Any]) -> None:
    """Persist the audiobook plugin config to disk.

    The audiobook YAML is the source of truth that the plugin loads on
    activation. We never silently create a fresh file in an unexpected
    location: if the file is missing, the install is broken and we
    report a 500 instead of guessing.
    """
    if not AUDIOBOOK_CONFIG_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Audiobook plugin config not found at {AUDIOBOOK_CONFIG_PATH}",
        )
    try:
        AUDIOBOOK_CONFIG_PATH.write_text(
            yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to write audiobook config: {e}")


def _push_key_to_engine(api_key: str) -> None:
    """Best-effort: push the new key into the live TTS engine module.

    The plugin may or may not be active in this process. Importing it
    lazily lets us update the in-memory key when it is, and skip
    silently when it is not (e.g. premium plugin not licensed).
    """
    try:
        from bibliogon_audiobook.tts_engine import set_elevenlabs_api_key
    except ImportError:
        return
    set_elevenlabs_api_key(api_key)


def _get_engine_key() -> str:
    """Read the live ElevenLabs key from the engine module if available."""
    try:
        from bibliogon_audiobook.tts_engine import get_elevenlabs_api_key
    except ImportError:
        # Fallback: read from YAML directly so the Settings UI still
        # reflects the persisted state when the plugin is not loaded.
        return ((_load_yaml_config().get("elevenlabs") or {}).get("api_key") or "").strip()
    return get_elevenlabs_api_key()


# --- ElevenLabs API key configuration ---


class ElevenLabsKeyRequest(BaseModel):
    """Request body for storing an ElevenLabs API key."""

    api_key: str = Field(..., min_length=1, description="ElevenLabs API key (sk_...)")


def _verify_elevenlabs_key(api_key: str) -> dict[str, Any]:
    """Hit GET /v1/user to verify the key. Returns the parsed user dict.

    Raises HTTPException with the upstream message on any failure so the
    Settings UI can show a precise error toast.
    """
    try:
        import httpx
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"httpx not installed in backend environment: {e}",
        )
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                ELEVENLABS_USER_ENDPOINT,
                headers={"xi-api-key": api_key},
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs unreachable: {e}")
    if response.status_code == 401:
        raise HTTPException(status_code=400, detail="ElevenLabs rejected the API key (401 Unauthorized).")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"ElevenLabs API error {response.status_code}: {response.text[:200]}",
        )
    try:
        return response.json()
    except ValueError:
        return {}


@router.get("/audiobook/config/elevenlabs")
def get_elevenlabs_config() -> dict[str, Any]:
    """Report whether an ElevenLabs API key is currently configured.

    The key itself is never returned. The frontend uses ``configured``
    to decide whether to show "Schluessel hinterlegt" or the empty input.
    """
    return {"configured": bool(_get_engine_key())}


@router.post("/audiobook/config/elevenlabs")
def set_elevenlabs_config(req: ElevenLabsKeyRequest) -> dict[str, Any]:
    """Verify, store, and activate an ElevenLabs API key."""
    user_info = _verify_elevenlabs_key(req.api_key)

    cfg = _load_yaml_config()
    cfg.setdefault("elevenlabs", {})["api_key"] = req.api_key
    _write_yaml_config(cfg)
    _push_key_to_engine(req.api_key)

    subscription = (user_info.get("subscription") or {}) if isinstance(user_info, dict) else {}
    return {
        "configured": True,
        "tier": subscription.get("tier"),
        "character_count": subscription.get("character_count"),
        "character_limit": subscription.get("character_limit"),
    }


@router.delete("/audiobook/config/elevenlabs", status_code=204)
def delete_elevenlabs_config() -> None:
    """Remove the configured ElevenLabs API key."""
    cfg = _load_yaml_config()
    cfg.setdefault("elevenlabs", {})["api_key"] = ""
    _write_yaml_config(cfg)
    _push_key_to_engine("")


# --- Per-book persistent audiobook downloads ---


def _storage():
    """Lazy import of the audiobook_storage helper module.

    Importing on every call (rather than at module top) lets the backend
    boot even when the bundled audiobook plugin directory is not on
    sys.path - which currently only happens in odd test setups.
    """
    from bibliogon_audiobook import audiobook_storage
    return audiobook_storage


def _verify_book_exists(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.get("/books/{book_id}/audiobook")
def get_book_audiobook(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Return metadata + file list for the persisted audiobook of a book.

    ``exists: false`` is the empty state - frontend renders the
    "noch kein Audiobook generiert" hint instead of the download list.
    """
    _verify_book_exists(book_id, db)
    storage = _storage()
    metadata = storage.load_metadata(book_id)
    if metadata is None:
        return {"exists": False, "book_id": book_id}
    chapter_files = metadata.get("chapter_files") or []
    chapter_entries = [
        {
            "filename": item["filename"],
            "size_bytes": item.get("size_bytes", 0),
            "url": f"/api/books/{book_id}/audiobook/chapters/{item['filename']}",
        }
        for item in chapter_files
    ]
    merged = metadata.get("merged")
    merged_entry: dict[str, Any] | None = None
    if merged:
        merged_entry = {
            "filename": merged.get("filename", "audiobook.mp3"),
            "size_bytes": merged.get("size_bytes", 0),
            "url": f"/api/books/{book_id}/audiobook/merged",
        }
    return {
        "exists": True,
        "book_id": book_id,
        "created_at": metadata.get("created_at"),
        "engine": metadata.get("engine"),
        "voice": metadata.get("voice"),
        "language": metadata.get("language"),
        "speed": metadata.get("speed"),
        "merge_mode": metadata.get("merge_mode"),
        "chapters": chapter_entries,
        "merged": merged_entry,
        "zip_url": f"/api/books/{book_id}/audiobook/zip",
    }


@router.delete("/books/{book_id}/audiobook", status_code=204)
def delete_book_audiobook(book_id: str, db: Session = Depends(get_db)) -> None:
    """Delete the persisted audiobook directory for a book."""
    _verify_book_exists(book_id, db)
    storage = _storage()
    deleted = storage.delete_audiobook(book_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="No audiobook stored for this book")


@router.get("/books/{book_id}/audiobook/merged")
def download_book_audiobook_merged(book_id: str, db: Session = Depends(get_db)) -> FileResponse:
    """Download the merged audiobook MP3 for a book."""
    _verify_book_exists(book_id, db)
    storage = _storage()
    path = storage.merged_file_path(book_id)
    if path is None:
        raise HTTPException(status_code=404, detail="No merged audiobook for this book")
    return FileResponse(path=str(path), media_type="audio/mpeg", filename=path.name)


@router.get("/books/{book_id}/audiobook/chapters/{filename}")
def download_book_audiobook_chapter(
    book_id: str, filename: str, db: Session = Depends(get_db),
) -> FileResponse:
    """Download a single chapter MP3 from the persisted audiobook."""
    _verify_book_exists(book_id, db)
    storage = _storage()
    path = storage.chapter_file_path(book_id, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Chapter file not found")
    return FileResponse(path=str(path), media_type="audio/mpeg", filename=filename)


@router.get("/books/{book_id}/audiobook/zip")
def download_book_audiobook_zip(book_id: str, db: Session = Depends(get_db)) -> FileResponse:
    """Bundle all chapter MP3s into a ZIP and serve it.

    The ZIP is built lazily into a temp file rather than streamed,
    because FileResponse handles range requests for free.
    """
    _verify_book_exists(book_id, db)
    storage = _storage()
    metadata = storage.load_metadata(book_id)
    if metadata is None:
        raise HTTPException(status_code=404, detail="No audiobook stored for this book")
    chapter_files = metadata.get("chapter_files") or []
    if not chapter_files:
        raise HTTPException(status_code=404, detail="No chapter files to bundle")
    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_audiobook_zip_"))
    zip_path = tmp_dir / "audiobook.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in chapter_files:
            src = storage.chapter_file_path(book_id, item["filename"])
            if src is not None:
                zf.write(src, item["filename"])
    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=f"{book_id}-audiobook.zip",
    )
