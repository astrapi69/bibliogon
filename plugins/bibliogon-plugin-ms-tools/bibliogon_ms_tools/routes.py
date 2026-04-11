"""API routes for manuscript tools plugin."""

import csv
import io
import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .readability import analyze_readability
from .sanitizer import sanitize
from .style_checker import check_style

router = APIRouter(prefix="/ms-tools", tags=["manuscript-tools"])

_config: dict = {}

DEFAULT_MAX_SENTENCE_LENGTH = 25
DEFAULT_REPETITION_WINDOW = 50


def set_config(config: dict) -> None:
    """Set plugin config from plugin activation."""
    global _config
    _config = config


def _plugin_settings() -> dict:
    """Return the plugin ``settings`` block, falling back to the raw config."""
    return (_config or {}).get("settings") or _config or {}


def _resolve_thresholds(
    book_id: str | None,
    override_max_sentence_length: int | None,
    override_repetition_window: int | None,
) -> tuple[int, int]:
    """Resolve effective thresholds: request > book > plugin settings > defaults.

    Per-book overrides are read from the ``books`` table when ``book_id`` is
    provided. Missing columns (e.g. in test DBs without the migration) are
    tolerated silently.
    """
    settings = _plugin_settings()
    max_sentence = settings.get("max_sentence_length", DEFAULT_MAX_SENTENCE_LENGTH)
    repetition = settings.get("repetition_window", DEFAULT_REPETITION_WINDOW)

    if book_id:
        try:
            from app.database import SessionLocal
            from app.models import Book
        except ImportError:
            book = None
        else:
            db = SessionLocal()
            try:
                book = db.query(Book).filter(Book.id == book_id).first()
            finally:
                db.close()
        if book is not None:
            book_max = getattr(book, "ms_tools_max_sentence_length", None)
            book_rep = getattr(book, "ms_tools_repetition_window", None)
            if book_max is not None:
                max_sentence = book_max
            if book_rep is not None:
                repetition = book_rep

    if override_max_sentence_length is not None:
        max_sentence = override_max_sentence_length
    if override_repetition_window is not None:
        repetition = override_repetition_window

    return int(max_sentence), int(repetition)


class StyleCheckRequest(BaseModel):
    """Request body for style check."""

    text: str = Field(..., min_length=1, description="Text to analyze")
    language: str = Field(default="de", pattern="^[a-z]{2}$")
    max_sentence_length: int | None = Field(default=None, ge=10, le=100)
    repetition_window: int | None = Field(default=None, ge=10, le=200)
    book_id: str | None = Field(default=None, description="Resolve per-book threshold overrides")


class SanitizeRequest(BaseModel):
    """Request body for text sanitization."""

    text: str = Field(..., min_length=1, description="Text to sanitize")
    language: str = Field(default="de", pattern="^[a-z]{2}$")
    fix_quotes: bool = Field(default=True)
    fix_whitespace: bool = Field(default=True)
    fix_dashes: bool = Field(default=True)
    fix_ellipsis: bool = Field(default=True)
    fix_invisible: bool = Field(default=True)
    fix_html: bool = Field(default=True)


class ReadabilityRequest(BaseModel):
    """Request body for readability analysis."""

    text: str = Field(..., min_length=1, description="Text to analyze")
    language: str = Field(default="de", pattern="^[a-z]{2}$")


@router.post("/check")
async def style_check(req: StyleCheckRequest) -> dict:
    """Run style checks: filler words, passive voice, sentence length,
    word repetitions, adverbs, redundant phrases.

    Thresholds are resolved in this order: explicit request values > per-book
    overrides (when ``book_id`` is provided) > plugin config > built-in defaults.
    """
    max_sentence, repetition = _resolve_thresholds(
        req.book_id, req.max_sentence_length, req.repetition_window
    )
    return check_style(
        text=req.text,
        language=req.language,
        max_sentence_length=max_sentence,
        repetition_window=repetition,
    )


@router.post("/sanitize")
async def sanitize_text(req: SanitizeRequest) -> dict:
    """Sanitize text: fix invisible chars, quotes, whitespace, dashes,
    ellipsis, HTML artifacts."""
    return sanitize(
        text=req.text,
        language=req.language,
        fix_invisible=req.fix_invisible,
        fix_quote_marks=req.fix_quotes,
        fix_spaces=req.fix_whitespace,
        fix_dash_marks=req.fix_dashes,
        fix_ellipses=req.fix_ellipsis,
        fix_html=req.fix_html,
    )


@router.post("/sanitize/preview")
async def sanitize_preview(req: SanitizeRequest) -> dict:
    """Preview sanitization changes as a line-by-line diff.

    Returns the same result as /sanitize plus a ``diff`` field with
    a list of change records. Each record has ``line``, ``type``
    ("removed"/"added"/"unchanged") and ``text``.
    """
    result = sanitize(
        text=req.text,
        language=req.language,
        fix_invisible=req.fix_invisible,
        fix_quote_marks=req.fix_quotes,
        fix_spaces=req.fix_whitespace,
        fix_dash_marks=req.fix_dashes,
        fix_ellipses=req.fix_ellipsis,
        fix_html=req.fix_html,
    )

    original_lines = result["original"].splitlines()
    sanitized_lines = result["sanitized"].splitlines()

    diff: list[dict[str, Any]] = []
    max_lines = max(len(original_lines), len(sanitized_lines))
    for i in range(max_lines):
        orig = original_lines[i] if i < len(original_lines) else ""
        sani = sanitized_lines[i] if i < len(sanitized_lines) else ""
        if orig == sani:
            diff.append({"line": i + 1, "type": "unchanged", "text": orig})
        else:
            if orig:
                diff.append({"line": i + 1, "type": "removed", "text": orig})
            if sani:
                diff.append({"line": i + 1, "type": "added", "text": sani})

    result["diff"] = diff
    return result


@router.post("/readability")
async def readability_check(req: ReadabilityRequest) -> dict:
    """Analyze text readability: Flesch, word/char counts, reading time."""
    return analyze_readability(text=req.text, language=req.language)


@router.get("/languages")
async def supported_languages() -> dict:
    """Return supported languages for style checks, sanitization, and readability."""
    from .readability import VOWEL_GROUPS
    from .sanitizer import QUOTE_STYLES
    from .style_checker import FILLER_WORDS

    return {
        "style_check": list(FILLER_WORDS.keys()),
        "sanitize": list(QUOTE_STYLES.keys()),
        "readability": list(VOWEL_GROUPS.keys()),
    }


class MetricsExportRequest(BaseModel):
    """Request for metrics export."""

    book_id: str = Field(..., min_length=1)
    format: str = Field(default="json", pattern="^(json|csv)$")


@router.post("/metrics/export")
async def export_metrics(req: MetricsExportRequest) -> StreamingResponse:
    """Export readability + style metrics for all chapters of a book.

    Returns JSON or CSV with per-chapter metrics and a book-wide summary.
    """
    try:
        from app.database import SessionLocal
        from app.models import Book, Chapter
    except ImportError:
        raise HTTPException(status_code=500, detail="Database not available")

    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == req.book_id).first()
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")

        chapters = (
            db.query(Chapter)
            .filter(Chapter.book_id == req.book_id)
            .order_by(Chapter.position)
            .all()
        )

        from .readability import analyze_readability as _analyze
        from .style_checker import check_style as _check
        from bibliogon_audiobook.generator import extract_plain_text

        rows: list[dict[str, Any]] = []
        for ch in chapters:
            try:
                plain = extract_plain_text(ch.content)
            except Exception:
                plain = ch.content if isinstance(ch.content, str) else ""
            if not plain.strip():
                continue
            lang = book.language or "de"
            readability = _analyze(plain, lang)
            style = _check(plain, lang)
            rows.append({
                "chapter": ch.title,
                "position": ch.position,
                "chapter_type": ch.chapter_type,
                **readability,
                "filler_count": style["filler_count"],
                "filler_ratio": style["filler_ratio"],
                "passive_count": style["passive_count"],
                "passive_ratio": style.get("passive_ratio", 0),
                "long_sentence_count": style["long_sentence_count"],
                "repetition_count": style.get("repetition_count", 0),
                "adverb_count": style.get("adverb_count", 0),
                "adverb_ratio": style.get("adverb_ratio", 0),
            })
    finally:
        db.close()

    if not rows:
        raise HTTPException(status_code=400, detail="No chapters with text content")

    filename = f"{book.title or 'book'}-metrics"

    if req.format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
        )

    return StreamingResponse(
        iter([json.dumps({"book": book.title, "chapters": rows}, indent=2, ensure_ascii=False)]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
    )
