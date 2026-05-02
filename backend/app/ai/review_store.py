"""Filesystem storage for persisted AI review reports.

Reviews land under ``uploads/{book_id}/reviews/{review_id}-{chapter_slug}-{date}.md``.
Filename is the metadata: no DB table in MVP. Filename parts:

- ``review_id`` (12 hex chars) - lookup key for the download endpoint
- ``chapter_slug`` - links the file to a chapter for cascade delete
- ``date`` (``YYYY-MM-DD``) - human-readable timestamp for listings

Cascade delete on chapter removal walks the reviews dir and deletes
files whose chapter-slug segment matches the deleted chapter. See
docs/explorations/ai-review-extension.md 3.8 and 3.9.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from app.paths import get_upload_dir

logger = logging.getLogger(__name__)


REVIEWS_DIRNAME = "reviews"

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def reviews_dir(book_id: str) -> Path:
    """Return the reviews directory for a book. Does not create it."""
    return get_upload_dir() / book_id / REVIEWS_DIRNAME


def slugify(text: str, max_length: int = 60) -> str:
    """Produce a filesystem-safe slug from a chapter title or id.

    Lowercases, collapses non-alphanumerics to single hyphens, trims.
    Falls back to 'untitled' if the input slugifies to an empty string.
    """
    if not text:
        return "untitled"
    slug = _SLUG_RE.sub("-", text.lower()).strip("-")
    if not slug:
        return "untitled"
    return slug[:max_length].rstrip("-") or "untitled"


def new_review_id() -> str:
    """12-char hex id, matches the JobStore.create() id shape."""
    return uuid.uuid4().hex[:12]


def report_filename(review_id: str, chapter_slug: str, when: datetime | None = None) -> str:
    """Compose the canonical review-report filename."""
    when = when or datetime.now(UTC)
    date_str = when.strftime("%Y-%m-%d")
    return f"{review_id}-{chapter_slug}-{date_str}.md"


def report_path(
    book_id: str,
    review_id: str,
    chapter_slug: str,
    when: datetime | None = None,
) -> Path:
    """Absolute path where a review Markdown file would be written."""
    return reviews_dir(book_id) / report_filename(review_id, chapter_slug, when)


def write_report(
    book_id: str,
    review_id: str,
    chapter_slug: str,
    markdown: str,
    when: datetime | None = None,
) -> Path:
    """Persist a review Markdown report and return its path.

    Creates parent dirs as needed. Overwrites an existing file with
    the same review_id (same id is not supposed to be reused).
    """
    target = report_path(book_id, review_id, chapter_slug, when)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(markdown, encoding="utf-8")
    return target


def find_report(book_id: str, review_id: str) -> Path | None:
    """Find a review Markdown file by review_id. Returns None if absent."""
    directory = reviews_dir(book_id)
    if not directory.exists():
        return None
    for candidate in directory.iterdir():
        if candidate.is_file() and candidate.name.startswith(f"{review_id}-"):
            return candidate
    return None


def delete_reviews_for_chapter(book_id: str, chapter_slug: str) -> int:
    """Delete review files linked to a chapter slug. Returns the count.

    Matches on the chapter-slug segment between review_id and date.
    Safe to call when the directory does not exist. Best-effort per
    file - an unreadable file never blocks other deletions.
    """
    directory = reviews_dir(book_id)
    if not directory.exists():
        return 0
    deleted = 0
    prefix = f"-{chapter_slug}-"
    for candidate in directory.iterdir():
        if not candidate.is_file():
            continue
        if prefix in candidate.name:
            try:
                candidate.unlink()
                deleted += 1
            except OSError:
                logger.warning("Failed to delete review file %s", candidate, exc_info=True)
    return deleted
