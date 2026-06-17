"""Core handler for single Markdown files.

Wraps the existing app.services.backup.markdown_import logic so the
orchestrator can offer a preview and duplicate check for ``.md``
inputs. The legacy single-markdown path on /api/backup/smart-import
still works; this handler is the new plugin-protocol entry point.

Source identifier is a content signature (title + author + chapter
count) when a title can be extracted, falling back to SHA-256 of
file bytes. The signature makes duplicates resilient to trivial
whitespace edits while still catching "I dropped the same file
twice" without requiring the bytes to be identical.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.protocol import DetectedChapter, DetectedProject
from app.models import Book, Chapter, ChapterType
from app.services.backup.markdown_utils import (
    extract_title,
    md_to_html,
    sanitize_import_markdown,
)

_HTML_SUFFIXES = (".html", ".htm")
_H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.IGNORECASE | re.DOTALL)
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")


def _is_html(path: Path) -> bool:
    return path.suffix.lower() in _HTML_SUFFIXES


def _extract_html_title(content: str, fallback: str) -> str:
    """Pull a book title from an HTML document: first ``<h1>``, then
    ``<title>``, then a humanized filename fallback (mirrors
    :func:`extract_title`'s fallback shape)."""
    for pattern in (_H1_RE, _TITLE_RE):
        match = pattern.search(content)
        if match:
            text = _TAG_RE.sub("", match.group(1)).strip()
            if text:
                return text
    cleaned = re.sub(r"^[\d]+(-[\d]+)?-", "", fallback) or fallback
    return cleaned.replace("-", " ").strip().title()


class MarkdownImportHandler:
    """ImportPlugin for a single ``.md`` / ``.markdown`` / ``.txt`` /
    ``.html`` / ``.htm`` file.

    Markdown/text inputs are converted to HTML for storage; HTML inputs are
    stored as-is (sanitized through the ``content_pre_import`` hook). Both
    land in ``Chapter.content`` as HTML, which the editor parses via
    ``setContent`` — the same contract the offline client importer
    (``htmlToTipTap``) honours, so the API and Dexie paths stay in parity."""

    format_name = "markdown"

    _ACCEPT_SUFFIXES = (".md", ".markdown", ".txt", *_HTML_SUFFIXES)

    # --- ImportPlugin ---

    def can_handle(self, input_path: str) -> bool:
        path = Path(input_path)
        if path.suffix.lower() not in self._ACCEPT_SUFFIXES:
            return False
        if path.suffix.lower() == ".txt":
            # For .txt we require an H1 on the first non-blank line so
            # we don't accidentally claim arbitrary plain text that the
            # office/epub handlers might also be able to parse.
            try:
                first_non_blank = next(
                    (
                        line
                        for line in path.read_text(encoding="utf-8").splitlines()
                        if line.strip()
                    ),
                    "",
                )
            except (OSError, UnicodeDecodeError):
                return False
            return first_non_blank.lstrip().startswith("#")
        return True

    def detect(self, input_path: str) -> DetectedProject:
        path = Path(input_path)
        content = path.read_text(encoding="utf-8")
        if _is_html(path):
            return self._detect_html(path, content)
        title = extract_title(content, path.stem)
        warnings: list[str] = []
        has_h1 = any(
            line.strip().startswith("# ") and not line.strip().startswith("## ")
            for line in content.splitlines()
        )
        if not has_h1:
            warnings.append("No H1 title found; using filename as the book title.")

        chapter_count = max(1, _count_h2_sections(content))
        chapters = [
            DetectedChapter(
                title=title or "Untitled",
                position=0,
                word_count=_word_count(content),
                content_preview=_plain_preview(content),
            )
        ]
        source_identifier = _signature(title, author=None, chapter_count=chapter_count, path=path)

        return DetectedProject(
            format_name=self.format_name,
            source_identifier=source_identifier,
            # Mandatory-field defaults surface at detect-time so the
            # router's validate_overrides (which treats missing keys
            # as "fall back to detected") passes for single-markdown
            # inputs that have no author metadata. User can still
            # edit these in the preview.
            title=title or path.stem or "Untitled",
            author="Unknown",
            language=None,
            chapters=chapters,
            assets=[],
            warnings=warnings,
            plugin_specific_data={"raw_length": len(content), "h2_sections": chapter_count - 1},
        )

    def _detect_html(self, path: Path, content: str) -> DetectedProject:
        """Detect a single HTML document: title from ``<h1>`` / ``<title>``,
        one chapter, preview from the tag-stripped body."""
        title = _extract_html_title(content, path.stem)
        warnings: list[str] = []
        if not _H1_RE.search(content):
            warnings.append("No <h1> title found; using filename as the book title.")
        plain = _TAG_RE.sub(" ", content)
        chapters = [
            DetectedChapter(
                title=title or "Untitled",
                position=0,
                word_count=_word_count(plain),
                content_preview=plain.strip()[:200],
            )
        ]
        return DetectedProject(
            format_name=self.format_name,
            source_identifier=_signature(title, author=None, chapter_count=1, path=path),
            title=title or path.stem or "Untitled",
            author="Unknown",
            language=None,
            chapters=chapters,
            assets=[],
            warnings=warnings,
            plugin_specific_data={"raw_length": len(content), "h2_sections": 0},
        )

    def execute(
        self,
        input_path: str,
        detected: DetectedProject,
        overrides: dict,
        duplicate_action: str = "create",
        existing_book_id: str | None = None,
        git_adoption: str | None = None,
    ) -> str:
        if duplicate_action == "cancel":
            raise _DuplicateCancelled()

        path = Path(input_path)
        content = path.read_text(encoding="utf-8")

        session: Session = SessionLocal()
        try:
            if duplicate_action == "overwrite" and existing_book_id:
                _hard_delete_book(session, existing_book_id)

            title = overrides.get("title") or detected.title or path.stem
            author = overrides.get("author") or "Unknown"
            language = overrides.get("language") or "de"

            book = Book(title=title, author=author, language=language)
            session.add(book)
            session.flush()

            from app.import_plugins.overrides import apply_book_overrides

            remaining = {
                k: v for k, v in overrides.items() if k not in {"title", "author", "language"}
            }
            apply_book_overrides(session, book.id, remaining)

            sanitized = sanitize_import_markdown(content, book.language)
            # HTML input is already markup the editor parses via setContent;
            # markdown/text must be converted first. Both end up as HTML in
            # Chapter.content.
            chapter_html = sanitized if _is_html(path) else md_to_html(sanitized)
            session.add(
                Chapter(
                    book_id=book.id,
                    title=title,
                    content=chapter_html,
                    position=0,
                    chapter_type=ChapterType.CHAPTER.value,
                )
            )
            session.commit()
            return book.id
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


# --- Helpers ---


def _count_h2_sections(content: str) -> int:
    return sum(
        1
        for line in content.splitlines()
        if line.lstrip().startswith("## ") and not line.lstrip().startswith("###")
    )


def _word_count(content: str) -> int:
    return len(content.split())


def _plain_preview(content: str) -> str:
    return content[:200]


def _signature(
    title: str | None,
    author: str | None,
    chapter_count: int,
    path: Path,
) -> str:
    """Stable, plugin-specific source identifier.

    When a title is present the signature is derived from content
    metadata (title + author + chapter count), so a minor whitespace
    edit of the same book still collides. Without a title we fall
    back to the SHA-256 of the file bytes.
    """
    if title and title.strip():
        payload = f"{title}\n{author or ''}\n{chapter_count}"
        return f"signature:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return f"sha256:{digest}"


def _hard_delete_book(session: Session, book_id: str) -> None:
    session.query(Chapter).filter(Chapter.book_id == book_id).delete()
    book = session.query(Book).filter(Book.id == book_id).first()
    if book is not None:
        session.delete(book)
    session.flush()


class _DuplicateCancelled(Exception):
    """Raised by execute when the user chose to cancel a duplicate import."""
