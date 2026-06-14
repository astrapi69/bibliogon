"""Dry-run audiobook sample synthesis + cost estimation.

Extracted from ``routers/audiobook.py`` (God-file split #8 follow-up,
2026-06-14). Generates a short MP3 sample from the first paragraph of the
first non-skipped chapter and estimates the cost of a full export, so the
frontend can offer a "Probe hören" player plus a cost preview before the
user commits.

Per ``.claude/rules/code-hygiene.md`` this service raises typed
``BibliogonError`` subclasses; the router builds the ``FileResponse`` and
stays thin. Status codes match the pre-split router behaviour 1:1 (404
unknown book, 400 no chapters / no text, 500 plugin missing / no sample,
502 on a TTS engine failure).

The ``bibliogon_audiobook`` imports stay lazy (per-call, inside the
functions) so the backend boots without the premium plugin on sys.path
and so test patches against ``bibliogon_audiobook.tts_engine.get_engine``
take effect.
"""

import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.exceptions import BibliogonError, ExternalServiceError, NotFoundError, ValidationError
from app.models import Book, Chapter
from app.services.audiobook_skip_types import resolve_book_skip_types

logger = logging.getLogger(__name__)


@dataclass
class DryRunSample:
    """Result of a dry-run synthesis: the sample MP3 plus estimate headers."""

    output_path: Path
    cost_header: str
    chapter_count: int
    engine_id: str
    voice: str


def _select_sample_text(chapters: list[Chapter], skip_types: set[str]) -> str:
    """Return the first paragraph (<=500 chars) of the first non-skipped,
    non-empty chapter, or "" when every chapter is skipped / empty.
    """
    for ch in chapters:
        if (ch.chapter_type or "").lower() in skip_types:
            continue
        try:
            from bibliogon_audiobook.generator import extract_plain_text

            full_text = extract_plain_text(ch.content)
        except ImportError:
            full_text = ch.content if isinstance(ch.content, str) else ""
        if full_text.strip():
            first_para: str = full_text.strip().split("\n\n")[0][:500]
            return first_para
    return ""


def _estimate_full_cost(
    chapters: list[Chapter],
    skip_types: set[str],
    engine_id: str,
    voice: str,
    language: str,
) -> tuple[str, int]:
    """Estimate full-export cost. Returns ``(cost_header, chapter_count)``.

    ``cost_header`` is ``"free"`` for free engines or a 4-decimal USD
    string. Any failure (plugin missing, adapter error) degrades to
    ``("free", count_so_far)`` rather than failing the dry-run.
    """
    cost_header = "free"
    chapter_count = 0
    try:
        from bibliogon_audiobook.generator import extract_plain_text
        from manuscripta.audiobook.tts import create_adapter

        adapter = create_adapter(engine_id, lang=language, voice=voice or "default")
        total_cost = 0.0
        for ch in chapters:
            if (ch.chapter_type or "").lower() in skip_types:
                continue
            pt = extract_plain_text(ch.content)
            if not pt.strip():
                continue
            chapter_count += 1
            c = adapter.estimate_cost(pt)
            if c is not None:
                total_cost += c
        if total_cost > 0:
            cost_header = f"{total_cost:.4f}"
    except Exception:
        pass
    return cost_header, chapter_count


async def generate_dry_run_sample(book_id: str, db: Session) -> DryRunSample:
    """Generate a short audio sample from the first non-skipped chapter.

    Args:
        book_id: ID of the book to sample.
        db: Active DB session.

    Returns:
        A ``DryRunSample`` with the MP3 path and the cost-estimate values
        the router turns into response headers.

    Raises:
        NotFoundError: The book does not exist (-> 404).
        ValidationError: The book has no chapters or no chapter with text
            content (-> 400).
        ExternalServiceError: The TTS engine failed to synthesize (-> 502).
        BibliogonError: The audiobook plugin is unavailable or produced no
            sample file (-> 500).
    """
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if not book:
        raise NotFoundError("Book not found")

    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.position).all()
    if not chapters:
        raise ValidationError("Book has no chapters")

    # The skip set comes from Book.audiobook_skip_chapter_types (the per-book
    # column that replaced the former plugin-global skip_types), falling back
    # to the generator's built-in SKIP_TYPES inside resolve_book_skip_types.
    skip_types = resolve_book_skip_types(book)
    sample_text = _select_sample_text(chapters, skip_types)
    if not sample_text:
        raise ValidationError("No chapter with text content found")

    engine_id = getattr(book, "tts_engine", None) or "edge-tts"
    voice = getattr(book, "tts_voice", None) or ""
    language = getattr(book, "tts_language", None) or book.language or "de"

    try:
        from bibliogon_audiobook.tts_engine import get_engine
    except ImportError as e:
        raise BibliogonError("Audiobook plugin not available") from e

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_dryrun_"))
    output_path = tmp_dir / "dry-run-sample.mp3"

    try:
        tts = get_engine(engine_id)
        await tts.synthesize(
            text=sample_text,
            output_path=output_path,
            voice=voice,
            language=language,
        )
    except Exception as e:
        raise ExternalServiceError("TTS", f"Dry-run failed: {e}") from e

    if not output_path.exists():
        raise BibliogonError("Sample audio was not generated")

    cost_header, chapter_count = _estimate_full_cost(
        chapters, skip_types, engine_id, voice, language
    )

    return DryRunSample(
        output_path=output_path,
        cost_header=cost_header,
        chapter_count=chapter_count,
        engine_id=engine_id,
        voice=voice,
    )
