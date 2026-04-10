"""API routes for the audiobook plugin."""

import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .generator import generate_audiobook, is_ffmpeg_available
from .tts_engine import ENGINES, get_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audiobook", tags=["audiobook"])

_config: dict = {}


def set_config(config: dict) -> None:
    """Set plugin config from plugin activation."""
    global _config
    _config = config


class GenerateRequest(BaseModel):
    """Request to generate audiobook for a book."""

    book_id: str = Field(..., min_length=1)
    engine: str = Field(default="edge-tts")
    voice: str = Field(default="")
    language: str | None = Field(default=None, description="Override book language")
    skip_types: list[str] = Field(
        default=["toc", "imprint", "index", "bibliography", "endnotes"],
    )
    merge: str = Field(
        default="merged",
        description="Merge mode: 'separate' (one MP3 per chapter), 'merged' (single MP3), or 'both'",
    )


@router.post("/generate")
async def generate(req: GenerateRequest) -> dict[str, Any]:
    """Generate audiobook MP3 files for all chapters of a book.

    Returns chapter-by-chapter generation results with file list.
    """
    try:
        from app.database import SessionLocal
        from app.models import Book, Chapter
    except ImportError:
        raise HTTPException(status_code=500, detail="Database not available")

    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == req.book_id, Book.deleted_at.is_(None)).first()
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")

        chapters = (
            db.query(Chapter)
            .filter(Chapter.book_id == req.book_id)
            .order_by(Chapter.position)
            .all()
        )
        if not chapters:
            raise HTTPException(status_code=400, detail="Book has no chapters")

        chapters_data = [
            {
                "title": ch.title,
                "content": ch.content,
                "position": ch.position,
                "chapter_type": ch.chapter_type,
            }
            for ch in chapters
        ]
    finally:
        db.close()

    # Use book's TTS settings as defaults, request params override
    engine_id = req.engine or getattr(book, "tts_engine", None) or "edge-tts"
    voice = req.voice or getattr(book, "tts_voice", None) or ""
    language = req.language or getattr(book, "tts_language", None) or book.language or "de"
    output_dir = Path(tempfile.mkdtemp(prefix="bibliogon_audiobook_"))

    result = await generate_audiobook(
        book_title=book.title,
        chapters=chapters_data,
        output_dir=output_dir,
        engine_id=engine_id,
        voice=voice,
        language=language,
        skip_types=set(req.skip_types),
        merge=req.merge,
    )

    # Bundle into ZIP for download
    if result["generated_count"] > 0:
        import re
        slug = re.sub(r"[^a-z0-9\-]", "-", book.title.lower().strip())[:50]
        zip_path = shutil.make_archive(str(output_dir / f"{slug}-audiobook"), "zip", str(output_dir))
        result["download_path"] = zip_path
        result["download_filename"] = f"{slug}-audiobook.zip"

    return result


@router.get("/engines")
async def list_engines() -> list[dict[str, str]]:
    """List available TTS engines."""
    return [
        {"id": eid, "name": get_engine(eid).engine_name}
        for eid in ENGINES
    ]


@router.get("/languages")
async def list_languages(engine: str = "edge-tts") -> list[dict[str, str]]:
    """List available languages for a TTS engine."""
    # Hardcoded language lists per engine (Edge TTS has the most)
    edge_langs = [
        {"id": "de", "name": "Deutsch", "locale": "de-DE"},
        {"id": "en", "name": "English", "locale": "en-US"},
        {"id": "es", "name": "Espanol", "locale": "es-ES"},
        {"id": "fr", "name": "Francais", "locale": "fr-FR"},
        {"id": "el", "name": "Ellinika", "locale": "el-GR"},
        {"id": "it", "name": "Italiano", "locale": "it-IT"},
        {"id": "nl", "name": "Nederlands", "locale": "nl-NL"},
        {"id": "pt", "name": "Portugues", "locale": "pt-BR"},
        {"id": "ru", "name": "Russky", "locale": "ru-RU"},
        {"id": "ja", "name": "Nihongo", "locale": "ja-JP"},
        {"id": "zh", "name": "Zhongwen", "locale": "zh-CN"},
        {"id": "tr", "name": "Turkce", "locale": "tr-TR"},
    ]
    # All engines support the same base languages for now
    return edge_langs


@router.get("/voices")
async def list_voices(engine: str = "edge-tts", language: str | None = None) -> list[dict[str, str]]:
    """List available voices for a TTS engine, optionally filtered by language."""
    try:
        tts = get_engine(engine)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await tts.list_voices(language)


@router.get("/status")
async def audiobook_status() -> dict[str, Any]:
    """Check audiobook system status (ffmpeg availability, engines)."""
    return {
        "ffmpeg_available": is_ffmpeg_available(),
        "engines": [eid for eid in ENGINES],
        "merge_supported": is_ffmpeg_available(),
    }


# Max preview text length (characters) to avoid long TTS calls
MAX_PREVIEW_LENGTH = 2000


class PreviewRequest(BaseModel):
    """Request to preview (listen to) a text snippet via TTS."""

    text: str = Field(..., min_length=1, max_length=MAX_PREVIEW_LENGTH)
    engine: str = Field(default="edge-tts")
    voice: str = Field(default="")
    language: str = Field(default="de")
    book_id: str = Field(default="", description="Book ID to persist preview for")
    chapter_title: str = Field(default="", description="Chapter title for the filename")


import hashlib

# Persistent cache dir for preview MP3s so identical text+engine+voice
# combinations do not trigger a redundant TTS call.
PREVIEW_CACHE_DIR = Path("uploads/preview_cache")


def _preview_cache_key(text: str, engine: str, voice: str, language: str) -> str:
    """Deterministic hash over the four parameters that affect the audio."""
    raw = f"{text}|{engine}|{voice}|{language}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.post("/preview")
async def preview_audio(req: PreviewRequest) -> FileResponse:
    """Generate a short audio preview for a text snippet.

    Returns an MP3 file that can be played directly in the browser.
    Limited to 2000 characters to keep response times short.

    Cached: if the same text+engine+voice+language combination was
    previewed before, the existing MP3 is returned immediately
    without calling the TTS engine again. Saves time and money
    for paid engines.
    """
    try:
        tts = get_engine(req.engine)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Check cache first
    cache_key = _preview_cache_key(req.text, req.engine, req.voice, req.language)
    PREVIEW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached_path = PREVIEW_CACHE_DIR / f"{cache_key}.mp3"

    if cached_path.exists():
        logger.info("Preview cache hit: %s", cache_key[:12])
        # Persist even on cache hit — the first generation may have
        # happened without a book_id (e.g. from a different context).
        if req.book_id:
            _persist_preview(cached_path, req.book_id, req.chapter_title, req.text)
        return FileResponse(
            path=str(cached_path),
            media_type="audio/mpeg",
            filename="preview.mp3",
        )

    # Cache miss: generate via TTS
    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_preview_"))
    output_path = tmp_dir / "preview.mp3"

    try:
        await tts.synthesize(
            text=req.text,
            output_path=output_path,
            voice=req.voice,
            language=req.language,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS preview failed: {e}")

    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Preview audio file was not generated")

    # Store in cache for next time
    try:
        shutil.copy2(output_path, cached_path)
    except OSError as e:
        logger.warning("Failed to cache preview: %s", e)

    # Persist under the book's audiobook/previews/ directory so the
    # user can find it again in the metadata Audiobook tab.
    if req.book_id:
        _persist_preview(output_path, req.book_id, req.chapter_title, req.text)

    return FileResponse(
        path=str(output_path),
        media_type="audio/mpeg",
        filename="preview.mp3",
    )


def _slugify_preview(text: str) -> str:
    """Build a short filesystem-safe slug from text."""
    import re
    slug = text.lower().strip()[:40]
    slug = re.sub(r"[^a-z0-9\-]", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "preview"


def _persist_preview(mp3_path: Path, book_id: str, chapter_title: str, text: str) -> None:
    """Copy the preview MP3 into uploads/{book_id}/audiobook/previews/.

    Filename format: {chapter-slug}-preview-{short-text-slug}.mp3
    so the user can tell which chapter and passage the preview is from.
    """
    previews_dir = Path("uploads") / book_id / "audiobook" / "previews"
    previews_dir.mkdir(parents=True, exist_ok=True)

    chapter_slug = _slugify_preview(chapter_title) if chapter_title else "untitled"
    text_slug = _slugify_preview(text[:30])
    filename = f"{chapter_slug}-preview-{text_slug}.mp3"

    target = previews_dir / filename
    # Don't overwrite if it already exists (same chapter + text = same file)
    if target.exists():
        return
    try:
        shutil.copy2(mp3_path, target)
        logger.info("Persisted preview: %s", target)
    except OSError as e:
        logger.warning("Failed to persist preview: %s", e)
