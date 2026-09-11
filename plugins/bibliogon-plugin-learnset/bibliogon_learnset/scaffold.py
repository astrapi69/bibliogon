"""Phase-1 learnset scaffold: book chapters -> alc set layout (#763).

Builds the mechanical half of the book-to-learnset bridge: one lesson
per content chapter with a single ``theory`` step carrying the chapter
Markdown (the lesson schema forbids empty ``steps``), plus the
``manifest.yaml`` per content-manifest schema 1.6 including the
engine#769 ``book`` block. The didactic condensation (summaries,
exercises) is Phase 2+ AI work and deliberately absent here.

Design notes:

- Slugs follow the engine#105 SlugId contract. We emit a conservative
  ASCII subset (NFD-transliterated, lowercase, hyphen-run form) that the
  canonical Unicode pattern accepts; the reference sets use the same
  style (``biologische-souveranitat``).
- Lesson ordering is the lexicographic sort of lesson ids
  (learn-content-engine#106), so ids get a zero-padded ``NN-`` prefix.
"""

from __future__ import annotations

import io
import json
import math
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

MANIFEST_SCHEMA_VERSION = "1.6"

#: learn-content-engine release the vendored schemas + validator were
#: taken from. Read from the pin file rather than duplicated, so an
#: upgrade cannot leave the stamp behind (#775). The nightly drift
#: guard (scripts/check_learnset_schema_drift.py) compares the vendored
#: artifacts against this exact npm version.
ENGINE_VERSION = (
    (Path(__file__).parent / "vendor" / "engine-version.txt").read_text(encoding="utf-8").strip()
)
SET_VERSION_INITIAL = "1.0.0"
WORDS_PER_MINUTE = 200

#: Chapter types that carry no learnable prose: structural front/back
#: matter and the marketing set. Overridable via the plugin config's
#: ``skip_chapter_types``; content-bearing matter (preface, foreword,
#: introduction, appendix, glossary, bibliography, ...) stays in.
DEFAULT_SKIP_CHAPTER_TYPES = frozenset(
    {
        "toc",
        "imprint",
        "copyright",
        "title_page",
        "half_title",
        "dedication",
        "epigraph",
        "index",
        "endnotes",
        "acknowledgments",
        "about_author",
        "also_by_author",
        "excerpt",
        "call_to_action",
        "next_in_series",
    }
)


@dataclass(frozen=True)
class ChapterInput:
    """One chapter as the scaffold consumes it (already Markdown)."""

    title: str
    chapter_type: str
    markdown: str


def slugify_ascii(raw_title: str) -> str:
    """ASCII slug in the engine#105 SlugId shape.

    NFD-decomposes and drops combining marks (``Souveränität`` ->
    ``souveranitat``), lowercases, folds every non-alphanumeric run
    into one hyphen, and strips edge hyphens.

    Args:
        raw_title: Human title, any script.

    Returns:
        Slug like ``biologische-souveranitat``; ``lektion`` when
        nothing alphanumeric survives.
    """
    decomposed = unicodedata.normalize("NFD", raw_title)
    ascii_text = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    ascii_text = ascii_text.encode("ascii", "ignore").decode("ascii").lower()
    parts = [
        run for run in "".join(ch if ch.isalnum() else " " for ch in ascii_text).split() if run
    ]
    return "-".join(parts) or "lektion"


def estimate_minutes(word_count: int) -> int:
    """Reading-time estimate: ceil(words / 200), floor 1."""
    return max(1, math.ceil(word_count / WORDS_PER_MINUTE))


#: The engine's SlugId schema caps every id at 120 characters. A long
#: or accidentally-duplicated chapter title slugifies past that with
#: no warning - the failure only surfaces as a 400 at export time,
#: naming an id the user never typed. Reserve room for the "NN-"
#: position prefix (2 digits is the common case; wider books get more,
#: which _cap_slug accounts for via ``prefix_len``).
_LESSON_ID_MAX_LENGTH = 120


def _cap_slug(slug: str, prefix_len: int) -> str:
    """Truncate ``slug`` so ``f"{prefix}-{slug}"`` fits the schema cap.

    Cuts at the last hyphen boundary within budget rather than mid-word,
    so a truncated id still reads as a (shorter) slug instead of a
    ragged fragment. Falls back to a hard character cut only when no
    hyphen exists in budget (a single very long word).

    Args:
        slug: The full slugify_ascii() output.
        prefix_len: Length of ``"NN-"`` (the digits plus the hyphen)
            that will precede this slug in the final id.

    Returns:
        A slug with no leading/trailing hyphen, short enough that the
        combined id is at most 120 characters.
    """
    budget = _LESSON_ID_MAX_LENGTH - prefix_len
    if len(slug) <= budget:
        return slug
    truncated = slug[:budget]
    last_hyphen = truncated.rfind("-")
    if last_hyphen > 0:
        truncated = truncated[:last_hyphen]
    return truncated.rstrip("-") or slug[:budget].rstrip("-")


def build_lessons(
    chapters: list[ChapterInput],
    language: str,
    skip_chapter_types: frozenset[str] = DEFAULT_SKIP_CHAPTER_TYPES,
) -> list[dict[str, Any]]:
    """One lesson dict per content chapter, in book order.

    Each lesson carries exactly one ``theory`` step with the chapter
    Markdown as ``body`` (``lesson.steps`` has ``minItems: 1``). The id
    is capped to the engine's 120-char SlugId limit (#806) - a long or
    duplicated chapter title used to slugify past it with no warning,
    surfacing only as a schema-validation 400 at export time. The
    position prefix already disambiguates two chapters whose titles
    truncate to the same slug.
    """
    lessons: list[dict[str, Any]] = []
    content_chapters = [ch for ch in chapters if ch.chapter_type not in skip_chapter_types]
    width = max(2, len(str(len(content_chapters))))
    for position, chapter_input in enumerate(content_chapters, start=1):
        prefix = f"{position:0{width}d}-"
        slug = _cap_slug(slugify_ascii(chapter_input.title), len(prefix))
        word_count = len(chapter_input.markdown.split())
        lessons.append(
            {
                "id": f"{prefix}{slug}",
                "title": chapter_input.title,
                "description": None,
                "target_language": language,
                "source_language": language,
                "estimated_minutes": estimate_minutes(word_count),
                "cards": [],
                "steps": [
                    {
                        "id": "theory-1",
                        "type": "theory",
                        "title": chapter_input.title,
                        "body": chapter_input.markdown,
                    }
                ],
            }
        )
    return lessons


def build_manifest(book: Any, lessons: list[dict[str, Any]]) -> dict[str, Any]:
    """``manifest.yaml`` content per content-manifest schema 1.6.

    The set entry carries the required ``version`` + ``lesson_count``
    and the engine#769 ``book`` block (title/author/asin) sourced from
    the Book row; ``level`` is the non-language sentinel ``none``
    (engine#127).
    """
    set_id = slugify_ascii(book.title)
    language = (book.language or "de").split("-")[0]
    content_set: dict[str, Any] = {
        "id": set_id,
        "title": book.title,
        "title_native": book.title,
        "target_language": language,
        "source_language": language,
        "domain": "knowledge",
        "level": "none",
        "version": SET_VERSION_INITIAL,
        "lesson_count": len(lessons),
        "book": {
            "title": book.title,
            "author": book.author,
            "asin": getattr(book, "asin_ebook", None),
        },
    }
    manifest: dict[str, Any] = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "name": book.title,
        # Free-form per the content-manifest schema. A set committed
        # into an alc-* repo outlives the session that produced it, so
        # it records which engine/schema version it was built against
        # (#775) - otherwise a later validation failure gives no clue
        # whether the set or the engine moved.
        "metadata": {
            "generated_by": "Bibliogon plugin-learnset",
            "engine_version": ENGINE_VERSION,
            "schema_version": MANIFEST_SCHEMA_VERSION,
        },
        "sets": [content_set],
    }
    if getattr(book, "description", None):
        manifest["description"] = book.description
    return manifest


def build_scaffold_zip(
    book: Any,
    chapters: list[ChapterInput],
    skip_chapter_types: frozenset[str] = DEFAULT_SKIP_CHAPTER_TYPES,
) -> bytes:
    """Assemble + validate the set and return the ZIP bytes.

    Layout matches the alc content-repo convention exactly:
    ``sets/<source_lang>/<set-id>/manifest.yaml`` +
    ``lessons/NN-slug.json``. Every artifact is validated through the
    engine's sanctioned validator before packaging; a validation error
    here is a scaffold bug, surfaced loudly instead of shipping an
    invalid set.

    Raises:
        ValueError: When no content chapter survives the skip list, or
            a generated artifact fails schema validation.
    """
    from bibliogon_learnset.validation import validate_lesson, validate_manifest

    language = (book.language or "de").split("-")[0]
    lessons = build_lessons(chapters, language=language, skip_chapter_types=skip_chapter_types)
    if not lessons:
        raise ValueError("No content chapters left after the skip list; nothing to export.")
    manifest = build_manifest(book, lessons)

    validation_errors = validate_manifest(manifest)
    for lesson in lessons:
        validation_errors.extend(validate_lesson(lesson))
    if validation_errors:
        raise ValueError(
            "Generated learnset failed schema validation: " + "; ".join(validation_errors)
        )

    base = f"sets/{language}/{manifest['sets'][0]['id']}"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            f"{base}/manifest.yaml",
            yaml.safe_dump(manifest, allow_unicode=True, sort_keys=False),
        )
        for lesson in lessons:
            archive.writestr(
                f"{base}/lessons/{lesson['id']}.json",
                json.dumps(lesson, ensure_ascii=False, indent=2) + "\n",
            )
    return buffer.getvalue()
