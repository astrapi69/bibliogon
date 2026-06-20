"""Audiobook chapter-skip resolution.

Extracted from ``routers/audiobook.py`` (God-file split #8, 2026-06-14).
Resolves which chapter types are skipped for a book's audiobook export,
falling back to a sensible default for legacy books. Pure: no HTTP, no DB
writes.
"""

import json

from app.models import Book

# Mirror of the audiobook generator's built-in SKIP_TYPES default. Used
# only as a fallback when ``Book.audiobook_skip_chapter_types`` is unset
# or empty so the dry-run estimate stays sensible for legacy books that
# never went through the per-book migration. Marketing back-matter
# (also_by_author, excerpt, call_to_action) is skipped here as well so
# the dry-run cost estimate matches the real export.
DEFAULT_AUDIOBOOK_SKIP_TYPES: set[str] = {
    "toc",
    "imprint",
    "index",
    "bibliography",
    "endnotes",
    "also_by_author",
    "excerpt",
    "call_to_action",
}


def resolve_book_skip_types(book: Book) -> set[str]:
    """Return the lowercased skip set for one book.

    Decodes the JSON-encoded ``Book.audiobook_skip_chapter_types`` Text
    column and falls back to ``DEFAULT_AUDIOBOOK_SKIP_TYPES`` when the
    column is null, empty, or malformed. Always returns a set so the
    callers can use ``in`` checks.
    """
    raw = getattr(book, "audiobook_skip_chapter_types", None)
    if not raw:
        return set(DEFAULT_AUDIOBOOK_SKIP_TYPES)
    if isinstance(raw, list):
        decoded = [str(v).strip().lower() for v in raw if str(v).strip()]
        return set(decoded) if decoded else set(DEFAULT_AUDIOBOOK_SKIP_TYPES)
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return set(DEFAULT_AUDIOBOOK_SKIP_TYPES)
        if isinstance(parsed, list):
            decoded = [str(v).strip().lower() for v in parsed if str(v).strip()]
            return set(decoded) if decoded else set(DEFAULT_AUDIOBOOK_SKIP_TYPES)
    return set(DEFAULT_AUDIOBOOK_SKIP_TYPES)
