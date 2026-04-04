"""API routes for the translation plugin."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .book_translator import (
    extract_plain_text_from_tiptap,
    rebuild_tiptap_with_translation,
    translate_chapter_content,
)
from .deepl_client import DeepLClient, DeepLError, DEEPL_LANGUAGES
from .lmstudio_client import LMStudioClient, LMStudioError, LANGUAGE_NAMES

router = APIRouter(prefix="/translation", tags=["translation"])

_config: dict = {}


def set_config(config: dict) -> None:
    """Set plugin config from plugin activation."""
    global _config
    _config = config


def _get_settings() -> dict:
    return _config.get("settings", {})


def _get_deepl_client() -> DeepLClient:
    settings = _get_settings()
    api_key = settings.get("deepl_api_key", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="No DeepL API key configured. Set it in Settings > Plugins > Translation.")
    free_api = settings.get("deepl_free_api", True)
    return DeepLClient(api_key=api_key, free_api=free_api)


def _get_lmstudio_client() -> LMStudioClient:
    settings = _get_settings()
    return LMStudioClient(
        base_url=settings.get("lmstudio_url", "http://localhost:1234/v1"),
        model=settings.get("lmstudio_model", "default"),
        temperature=settings.get("lmstudio_temperature", 0.3),
    )


class TranslateRequest(BaseModel):
    """Request body for translation."""

    text: str = Field(..., min_length=1, description="Text to translate")
    target_lang: str = Field(..., pattern="^[a-zA-Z]{2}(-[a-zA-Z]{2})?$")
    source_lang: str | None = Field(default=None, pattern="^[a-zA-Z]{2}(-[a-zA-Z]{2})?$")
    provider: str = Field(default="deepl", pattern="^(deepl|lmstudio)$")
    formality: str = Field(default="default")


class TranslateResponse(BaseModel):
    """Response for translation."""

    translated_text: str
    detected_source_language: str
    provider: str
    character_count: int


@router.post("/translate", response_model=TranslateResponse)
async def translate_text(req: TranslateRequest) -> dict[str, Any]:
    """Translate text via DeepL or local LLM."""
    try:
        if req.provider == "deepl":
            client = _get_deepl_client()
            result = await client.translate(
                text=req.text,
                target_lang=req.target_lang,
                source_lang=req.source_lang,
                formality=req.formality,
            )
            result["provider"] = "deepl"
        else:
            client_lm = _get_lmstudio_client()
            result = await client_lm.translate(
                text=req.text,
                target_lang=req.target_lang,
                source_lang=req.source_lang or "auto",
            )
            result["provider"] = "lmstudio"
        return result
    except DeepLError as e:
        raise HTTPException(status_code=502, detail=f"DeepL error: {e}")
    except LMStudioError as e:
        raise HTTPException(status_code=502, detail=f"LMStudio error: {e}")


@router.get("/languages")
async def supported_languages() -> dict[str, Any]:
    """Return supported languages per provider."""
    return {
        "deepl": DEEPL_LANGUAGES,
        "lmstudio": LANGUAGE_NAMES,
    }


@router.get("/providers")
async def available_providers() -> list[dict[str, Any]]:
    """List available translation providers and their status."""
    settings = _get_settings()
    providers = [
        {
            "id": "deepl",
            "name": "DeepL",
            "configured": bool(settings.get("deepl_api_key")),
            "description": "Cloud-based neural machine translation (API key required)",
        },
        {
            "id": "lmstudio",
            "name": "LMStudio (Local LLM)",
            "configured": True,
            "description": "Local LLM translation via LMStudio (free, no API key)",
        },
    ]
    return providers


@router.get("/health")
async def provider_health() -> dict[str, Any]:
    """Check health of configured providers."""
    result: dict[str, Any] = {}
    settings = _get_settings()

    # DeepL health
    if settings.get("deepl_api_key"):
        try:
            client = _get_deepl_client()
            usage = await client.usage()
            result["deepl"] = {
                "status": "ok",
                "character_count": usage.get("character_count", 0),
                "character_limit": usage.get("character_limit", 0),
            }
        except Exception as e:
            result["deepl"] = {"status": "error", "error": str(e)}
    else:
        result["deepl"] = {"status": "not_configured"}

    # LMStudio health
    client_lm = _get_lmstudio_client()
    result["lmstudio"] = await client_lm.health()

    return result


class TranslateBookRequest(BaseModel):
    """Request to translate an entire book chapter by chapter."""

    book_id: str = Field(..., min_length=1)
    target_lang: str = Field(..., pattern="^[a-zA-Z]{2}(-[a-zA-Z]{2})?$")
    source_lang: str | None = Field(default=None, pattern="^[a-zA-Z]{2}(-[a-zA-Z]{2})?$")
    provider: str = Field(default="deepl", pattern="^(deepl|lmstudio)$")
    title_suffix: str = Field(default="", description="Suffix for new book title, e.g. '(EN)'")


@router.post("/translate-book")
async def translate_book(req: TranslateBookRequest) -> dict[str, Any]:
    """Translate all chapters of a book and create a new translated book.

    Creates a copy of the book with translated chapter content.
    The new book references the original via description field.
    """
    try:
        from app.database import SessionLocal
        from app.models import Book, Chapter
    except ImportError:
        raise HTTPException(status_code=500, detail="Database not available in this context")

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
            raise HTTPException(status_code=400, detail="Book has no chapters to translate")

        # Set up translation client
        deepl_client = None
        lmstudio_client = None
        if req.provider == "deepl":
            deepl_client = _get_deepl_client()
        else:
            lmstudio_client = _get_lmstudio_client()

        # Create new book (copy metadata, update language)
        lang_code = req.target_lang.split("-")[0].lower()
        suffix = req.title_suffix or f"({req.target_lang.upper()})"
        new_book = Book(
            title=f"{book.title} {suffix}".strip(),
            subtitle=book.subtitle,
            author=book.author,
            language=lang_code,
            genre=book.genre,
            series=book.series,
            series_index=book.series_index,
            description=f"Translated from: {book.title} (ID: {book.id})",
        )
        db.add(new_book)
        db.flush()

        # Translate chapters one by one
        translated_count = 0
        errors: list[dict[str, str]] = []

        for ch in chapters:
            plain_text = extract_plain_text_from_tiptap(ch.content)

            try:
                translated_text = await translate_chapter_content(
                    text=plain_text,
                    target_lang=req.target_lang,
                    source_lang=req.source_lang,
                    provider=req.provider,
                    deepl_client=deepl_client,
                    lmstudio_client=lmstudio_client,
                )
                translated_title = await translate_chapter_content(
                    text=ch.title,
                    target_lang=req.target_lang,
                    source_lang=req.source_lang,
                    provider=req.provider,
                    deepl_client=deepl_client,
                    lmstudio_client=lmstudio_client,
                )
            except Exception as e:
                errors.append({"chapter": ch.title, "error": str(e)})
                translated_text = plain_text
                translated_title = ch.title

            new_content = rebuild_tiptap_with_translation(ch.content, translated_text)

            new_chapter = Chapter(
                book_id=new_book.id,
                title=translated_title,
                content=new_content,
                position=ch.position,
                chapter_type=ch.chapter_type,
            )
            db.add(new_chapter)
            translated_count += 1

        db.commit()

        return {
            "book_id": new_book.id,
            "title": new_book.title,
            "language": new_book.language,
            "original_book_id": req.book_id,
            "chapter_count": translated_count,
            "errors": errors,
            "provider": req.provider,
        }
    finally:
        db.close()
