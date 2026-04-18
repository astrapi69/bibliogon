"""Import single Markdown files or ZIPs of plain Markdown files."""

import shutil
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models import Book, Chapter, ChapterType
from app.services.backup.markdown_utils import (
    extract_title,
    md_to_html,
    sanitize_import_markdown,
)


def import_single_markdown(file: UploadFile, db: Session) -> dict[str, Any]:
    """Import a single .md file as a new book with one chapter."""
    content = file.file.read().decode("utf-8")
    filename = file.filename or "untitled.md"
    title = extract_title(content, filename.replace(".md", ""))

    book = Book(title=title, author="Unknown", language="de")
    db.add(book)
    db.flush()

    sanitized = sanitize_import_markdown(content, book.language)
    db.add(
        Chapter(
            book_id=book.id,
            title=title,
            content=md_to_html(sanitized),
            position=0,
            chapter_type=ChapterType.CHAPTER.value,
        )
    )
    db.commit()
    db.refresh(book)

    return {"book_id": book.id, "title": book.title, "chapter_count": 1}


def import_plain_markdown_zip(
    extracted: Path,
    db: Session,
    tmp_dir: Path,
) -> dict[str, Any]:
    """Import a ZIP of plain Markdown files (no write-book-template structure).

    Each .md file becomes a chapter; the book title is derived from the first
    file (single-file case) or the extracted directory name.
    """
    md_files = sorted(extracted.rglob("*.md"))
    if not md_files:
        raise HTTPException(
            status_code=400,
            detail="Keine Markdown-Dateien im ZIP gefunden. "
            "Erwartet wird ein write-book-template Projekt oder eine Sammlung von .md Dateien.",
        )

    book_title = _derive_book_title(md_files, extracted)
    book = Book(title=book_title, author="Unknown", language="de")
    db.add(book)
    db.flush()

    for position, md_file in enumerate(md_files):
        content = md_file.read_text(encoding="utf-8")
        sanitized = sanitize_import_markdown(content, book.language)
        db.add(
            Chapter(
                book_id=book.id,
                title=extract_title(content, md_file.stem),
                content=md_to_html(sanitized),
                position=position,
                chapter_type=ChapterType.CHAPTER.value,
            )
        )

    db.commit()
    db.refresh(book)
    shutil.rmtree(tmp_dir, ignore_errors=True)

    return {"book_id": book.id, "title": book.title, "chapter_count": len(md_files)}


def _derive_book_title(md_files: list[Path], extracted: Path) -> str:
    """Single file -> its H1, otherwise the extracted directory name."""
    first_title = extract_title(md_files[0].read_text(encoding="utf-8"), md_files[0].stem)
    if len(md_files) == 1:
        return first_title
    if extracted.name and extracted.name != "extracted":
        return extracted.name
    return md_files[0].stem.replace("-", " ").title()
