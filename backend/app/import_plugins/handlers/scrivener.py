"""Core import handler for Scrivener ``.scriv`` projects.

SCRIVENER-PROJECT-IMPORT-01 - "the single biggest lever for converting
Scrivener users". A ``.scriv`` project is a directory bundle; the user
uploads it as a ZIP, the orchestrator extracts it, and this handler
claims the extracted directory by the presence of a ``.scrivx`` index.

Pipeline (mirrors the office docx/epub handler): parse the ``.scrivx``
binder for the ordered manuscript documents, convert each document's
``content.rtf`` to Markdown via Pandoc (which reads RTF), then reuse the
single-markdown pipeline (``md_to_html`` + ``sanitize_import_markdown``)
to land each as a TipTap-ready Chapter. The per-document ``synopsis.txt``
maps onto ``Chapter.synopsis`` (CHAPTER-SYNOPSIS-NOTES-01).
"""

from __future__ import annotations

import hashlib
import subprocess
import tempfile
from pathlib import Path

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.handlers.office import _hard_delete_book
from app.import_plugins.protocol import DetectedChapter, DetectedProject
from app.import_plugins.scrivener_binder import BinderEntry, parse_binder
from app.models import Book, Chapter, ChapterType
from app.services.backup.markdown_utils import md_to_html, sanitize_import_markdown


class _DuplicateCancelled(Exception):
    """Raised to abort an import when the user chose 'cancel'."""


class ScrivenerImportHandler:
    """Imports a Scrivener ``.scriv`` project directory into a Book."""

    format_name = "scrivener"

    def can_handle(self, input_path: str) -> bool:
        path = Path(input_path)
        return path.is_dir() and _find_scrivx(path) is not None

    def detect(self, input_path: str) -> DetectedProject:
        scrivx = _find_scrivx(Path(input_path))
        entries = _read_binder(scrivx) if scrivx else []
        data_dir = _data_dir(scrivx) if scrivx else None
        chapters = [
            DetectedChapter(
                title=entry.title,
                position=index,
                word_count=0,
                content_preview=(_read_synopsis(data_dir, entry.uuid) or "")[:200],
            )
            for index, entry in enumerate(entries)
        ]
        warnings: list[str] = []
        if not entries:
            warnings.append("No manuscript documents found in the Scrivener binder.")
        return DetectedProject(
            format_name=self.format_name,
            source_identifier=_source_identifier(scrivx),
            title=(scrivx.stem if scrivx else Path(input_path).name) or "Untitled",
            author="Unknown",
            language=None,
            chapters=chapters,
            assets=[],
            warnings=warnings,
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

        scrivx = _find_scrivx(Path(input_path))
        if scrivx is None:
            raise ValueError("No .scrivx index found in the Scrivener project.")
        entries = _read_binder(scrivx)
        data_dir = _data_dir(scrivx)

        session: Session = SessionLocal()
        try:
            if duplicate_action == "overwrite" and existing_book_id:
                _hard_delete_book(session, existing_book_id)

            title = overrides.get("title") or detected.title or scrivx.stem or "Untitled"
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

            for position, entry in enumerate(entries):
                markdown = _document_markdown(data_dir, entry)
                sanitized = sanitize_import_markdown(markdown, book.language)
                synopsis = _read_synopsis(data_dir, entry.uuid)
                session.add(
                    Chapter(
                        book_id=book.id,
                        title=entry.title,
                        content=md_to_html(sanitized),
                        position=position,
                        chapter_type=ChapterType.CHAPTER.value,
                        synopsis=synopsis,
                    )
                )

            session.commit()
            return book.id
        finally:
            session.close()


# --- helpers -----------------------------------------------------------


def _find_scrivx(root: Path) -> Path | None:
    """Locate the ``.scrivx`` index at the root or one directory deep.

    A ZIP of a ``.scriv`` bundle can extract either flat (the ``.scrivx``
    sits at the root) or nested (``<extract>/<project>.scriv/...``), so we
    check both depths and return the first match deterministically.
    """
    direct = sorted(root.glob("*.scrivx"))
    if direct:
        return direct[0]
    nested = sorted(root.glob("*/*.scrivx"))
    return nested[0] if nested else None


def _data_dir(scrivx: Path) -> Path:
    return scrivx.parent / "Files" / "Data"


def _read_binder(scrivx: Path) -> list[BinderEntry]:
    try:
        return parse_binder(scrivx.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        return []


def _rtf_path(data_dir: Path, uuid: str) -> Path | None:
    """Return the document RTF path (Scrivener 3, then Scrivener 2 layout)."""
    if not uuid:
        return None
    scriv3 = data_dir / uuid / "content.rtf"
    if scriv3.is_file():
        return scriv3
    scriv2 = data_dir.parent / "Docs" / f"{uuid}.rtf"
    return scriv2 if scriv2.is_file() else None


def _read_synopsis(data_dir: Path | None, uuid: str) -> str | None:
    if data_dir is None or not uuid:
        return None
    path = data_dir / uuid / "synopsis.txt"
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    return text or None


def _document_markdown(data_dir: Path, entry: BinderEntry) -> str:
    rtf = _rtf_path(data_dir, entry.uuid)
    if rtf is None:
        return ""
    return _rtf_to_markdown(rtf)


def _rtf_to_markdown(rtf_path: Path) -> str:
    """Convert one RTF document to Markdown via Pandoc. Patched in tests."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "out.md"
        subprocess.run(
            ["pandoc", "-f", "rtf", "-t", "gfm", "-o", str(out), str(rtf_path)],
            check=True,
            capture_output=True,
            timeout=60,
        )
        return out.read_text(encoding="utf-8") if out.is_file() else ""


def _source_identifier(scrivx: Path | None) -> str:
    if scrivx is None:
        return "scrivener:unknown"
    try:
        digest = hashlib.sha256(scrivx.read_bytes()).hexdigest()
    except OSError:
        return "scrivener:unreadable"
    return f"sha256:{digest}"
