"""Full-data backup and restore, plus write-book-template ZIP import."""

import json
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Asset, Book, Chapter, ChapterType

router = APIRouter(prefix="/backup", tags=["backup"])


# --- Full-Data Backup ---


@router.get("/export")
def export_backup(db: Session = Depends(get_db)):
    """Export a full backup of all books, chapters, and assets as ZIP."""
    books = db.query(Book).options(joinedload(Book.chapters)).all()

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_backup_"))
    backup_dir = tmp_dir / f"bibliogon-backup-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    books_dir = backup_dir / "books"

    for book in books:
        book_dir = books_dir / book.id
        book_dir.mkdir(parents=True)

        # Book metadata
        book_data = {
            "id": book.id,
            "title": book.title,
            "subtitle": book.subtitle,
            "author": book.author,
            "language": book.language,
            "series": book.series,
            "series_index": book.series_index,
            "description": book.description,
            "created_at": book.created_at.isoformat(),
            "updated_at": book.updated_at.isoformat(),
        }
        (book_dir / "book.json").write_text(
            json.dumps(book_data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        # Chapters
        chapters_dir = book_dir / "chapters"
        chapters_dir.mkdir()
        for chapter in book.chapters:
            ch_data = {
                "id": chapter.id,
                "title": chapter.title,
                "content": chapter.content,
                "position": chapter.position,
                "chapter_type": chapter.chapter_type,
                "created_at": chapter.created_at.isoformat(),
                "updated_at": chapter.updated_at.isoformat(),
            }
            (chapters_dir / f"{chapter.id}.json").write_text(
                json.dumps(ch_data, ensure_ascii=False, indent=2), encoding="utf-8"
            )

        # Copy assets if they exist on disk
        assets = db.query(Asset).filter(Asset.book_id == book.id).all()
        if assets:
            assets_dir = book_dir / "assets"
            assets_dir.mkdir()
            for asset in assets:
                src = Path(asset.path)
                if src.exists():
                    shutil.copy2(src, assets_dir / asset.filename)

    # Manifest
    manifest = {
        "format": "bibliogon-backup",
        "version": "1.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "book_count": len(books),
    }
    (backup_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    # ZIP it with .bgb extension (Bibliogon Backup)
    zip_path = shutil.make_archive(str(backup_dir), "zip", str(backup_dir))
    bgb_path = zip_path.replace(".zip", ".bgb")
    Path(zip_path).rename(bgb_path)

    return FileResponse(
        path=bgb_path,
        media_type="application/octet-stream",
        filename=f"{backup_dir.name}.bgb",
    )


@router.post("/import")
def import_backup(file: UploadFile, db: Session = Depends(get_db)):
    """Import a full backup (.bgb file), restoring all books and chapters."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.endswith(".bgb"):
        if file.filename.endswith(".zip"):
            raise HTTPException(
                status_code=400,
                detail="Das ist eine ZIP-Datei. Fuer Projekt-Import nutze den 'Import'-Button. "
                       "Fuer Backup-Restore wird eine .bgb-Datei erwartet (erstellt ueber 'Backup').",
            )
        raise HTTPException(status_code=400, detail="Datei muss eine .bgb-Datei sein (Bibliogon Backup)")

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_restore_"))

    try:
        # Save and extract
        zip_path = tmp_dir / "backup.bgb"
        with open(zip_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmp_dir / "extracted")
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Beschaedigte .bgb-Datei")

        extracted = tmp_dir / "extracted"

        # Validate: must contain manifest.json (bibliogon-backup format)
        manifest_found = _find_manifest(extracted)
        if manifest_found:
            manifest_data = json.loads(manifest_found.read_text(encoding="utf-8"))
            if manifest_data.get("format") != "bibliogon-backup":
                raise HTTPException(
                    status_code=400,
                    detail="Ungueltige Backup-Datei. Die Datei hat kein gueltiges Bibliogon-Backup-Format.",
                )

        # Find the books directory (may be nested in backup dir)
        books_dir = _find_books_dir(extracted)
        if not books_dir:
            raise HTTPException(
                status_code=400,
                detail="Ungueltige Backup-Datei: kein 'books'-Verzeichnis gefunden. "
                       "Ist das vielleicht ein Projekt-ZIP? Dann nutze den 'Import'-Button.",
            )

        imported_count = 0
        for book_dir in sorted(books_dir.iterdir()):
            if not book_dir.is_dir():
                continue
            book_json = book_dir / "book.json"
            if not book_json.exists():
                continue

            book_data = json.loads(book_json.read_text(encoding="utf-8"))

            # Check if book already exists
            existing = db.query(Book).filter(Book.id == book_data["id"]).first()
            if existing:
                continue  # skip duplicates

            book = Book(
                id=book_data["id"],
                title=book_data["title"],
                subtitle=book_data.get("subtitle"),
                author=book_data["author"],
                language=book_data.get("language", "de"),
                series=book_data.get("series"),
                series_index=book_data.get("series_index"),
                description=book_data.get("description"),
            )
            db.add(book)

            # Import chapters
            chapters_dir = book_dir / "chapters"
            if chapters_dir.exists():
                for ch_file in sorted(chapters_dir.glob("*.json")):
                    ch_data = json.loads(ch_file.read_text(encoding="utf-8"))
                    chapter = Chapter(
                        id=ch_data["id"],
                        book_id=book_data["id"],
                        title=ch_data["title"],
                        content=ch_data.get("content", ""),
                        position=ch_data.get("position", 0),
                        chapter_type=ch_data.get("chapter_type", ChapterType.CHAPTER.value),
                    )
                    db.add(chapter)

            imported_count += 1

        db.commit()
        return {"imported_books": imported_count}

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# --- write-book-template Import ---


@router.post("/import-project")
def import_project(file: UploadFile, db: Session = Depends(get_db)):
    """Import a write-book-template project ZIP as a new book."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if file.filename.endswith(".bgb"):
        raise HTTPException(
            status_code=400,
            detail="Das ist eine Backup-Datei (.bgb). Fuer Backup-Restore nutze den 'Restore'-Button. "
                   "Fuer Projekt-Import wird eine .bgp- oder .zip-Datei erwartet.",
        )
    valid_ext = file.filename.endswith(".bgp") or file.filename.endswith(".zip")
    if not valid_ext:
        raise HTTPException(
            status_code=400,
            detail="Datei muss eine .bgp-Datei (Bibliogon Projekt) oder .zip-Datei (write-book-template) sein",
        )

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_import_"))

    try:
        zip_path = tmp_dir / "project.zip"
        with open(zip_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_dir / "extracted")

        extracted = tmp_dir / "extracted"

        # Check if this is accidentally a backup file
        if _find_manifest(extracted):
            raise HTTPException(
                status_code=400,
                detail="Das ist eine Backup-Datei, kein Projekt-ZIP. "
                       "Fuer Backup-Restore nutze den 'Restore'-Button.",
            )

        # Find the project root (contains config/metadata.yaml or manuscript/)
        project_root = _find_project_root(extracted)
        if not project_root:
            raise HTTPException(
                status_code=400,
                detail="Ungueltiges Projektformat: kein metadata.yaml oder manuscript/ gefunden. "
                       "Erwartet wird ein write-book-template Projekt.",
            )

        # Read metadata
        metadata_path = project_root / "config" / "metadata.yaml"
        metadata: dict[str, Any] = {}
        if metadata_path.exists():
            with open(metadata_path, "r", encoding="utf-8") as f:
                metadata = yaml.safe_load(f) or {}

        # Parse metadata (handle different formats)
        series_raw = metadata.get("series")
        series_name = None
        series_idx = None
        if isinstance(series_raw, dict):
            series_name = series_raw.get("title")
            series_idx = series_raw.get("volume")
        elif isinstance(series_raw, str):
            series_name = series_raw
            series_idx = metadata.get("series_index")

        lang = metadata.get("lang", metadata.get("language", "de"))
        if "-" in str(lang):
            lang = str(lang).split("-")[0]  # "en-US" -> "en"

        # Parse ISBN
        isbn_raw = metadata.get("isbn", {})
        isbn_ebook = isbn_raw.get("ebook") if isinstance(isbn_raw, dict) else None
        isbn_pb = isbn_raw.get("paperback") if isinstance(isbn_raw, dict) else None
        isbn_hc = isbn_raw.get("hardcover") if isinstance(isbn_raw, dict) else None

        asin_raw = metadata.get("asin", {})
        asin_ebook = asin_raw.get("ebook") if isinstance(asin_raw, dict) else None

        # Parse keywords
        keywords_raw = metadata.get("keywords", [])
        keywords_str = json.dumps(keywords_raw) if isinstance(keywords_raw, list) else None

        book = Book(
            title=metadata.get("title", project_root.name),
            subtitle=metadata.get("subtitle"),
            author=metadata.get("author", "Unknown"),
            language=lang,
            series=series_name,
            series_index=series_idx,
            description=metadata.get("description"),
            edition=metadata.get("edition"),
            publisher=metadata.get("publisher"),
            publisher_city=metadata.get("publisher_city"),
            publish_date=metadata.get("date"),
            isbn_ebook=isbn_ebook,
            isbn_paperback=isbn_pb,
            isbn_hardcover=isbn_hc,
            asin_ebook=asin_ebook,
            keywords=keywords_str,
            cover_image=metadata.get("cover_image"),
        )
        db.add(book)
        db.flush()  # get book.id

        # Import chapters from manuscript/chapters/
        chapters_dir = project_root / "manuscript" / "chapters"
        if chapters_dir.exists():
            for position, md_file in enumerate(sorted(chapters_dir.glob("*.md"))):
                content = md_file.read_text(encoding="utf-8")
                # Extract title from first H1 or filename
                title = _extract_title(content, md_file.stem)
                # Remove H1 from content body
                body = _remove_first_heading(content)

                chapter = Chapter(
                    book_id=book.id,
                    title=title,
                    content=body.strip(),
                    position=position,
                    chapter_type=ChapterType.CHAPTER.value,
                )
                db.add(chapter)

        # Import front-matter
        front_dir = project_root / "manuscript" / "front-matter"
        if front_dir.exists():
            _import_special_chapters(db, book.id, front_dir, _FRONT_MATTER_MAP)

        # Import back-matter
        back_dir = project_root / "manuscript" / "back-matter"
        if back_dir.exists():
            _import_special_chapters(db, book.id, back_dir, _BACK_MATTER_MAP)

        db.commit()
        db.refresh(book)

        return {
            "book_id": book.id,
            "title": book.title,
            "chapter_count": len(book.chapters),
        }

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# --- Helpers ---

_FRONT_MATTER_MAP = {
    "preface": ChapterType.PREFACE,
    "foreword": ChapterType.FOREWORD,
    "acknowledgments": ChapterType.ACKNOWLEDGMENTS,
}

_BACK_MATTER_MAP = {
    "about-the-author": ChapterType.ABOUT_AUTHOR,
    "appendix": ChapterType.APPENDIX,
    "bibliography": ChapterType.BIBLIOGRAPHY,
    "glossary": ChapterType.GLOSSARY,
    "epilogue": ChapterType.EPILOGUE,
    "imprint": ChapterType.IMPRINT,
    "next-in-series": ChapterType.NEXT_IN_SERIES,
    "acknowledgments": ChapterType.ACKNOWLEDGMENTS,
}


def _find_manifest(extracted: Path) -> Path | None:
    """Find manifest.json in extracted archive (indicates backup format)."""
    if (extracted / "manifest.json").exists():
        return extracted / "manifest.json"
    for child in extracted.iterdir():
        if child.is_dir() and (child / "manifest.json").exists():
            return child / "manifest.json"
    return None


def _find_books_dir(extracted: Path) -> Path | None:
    """Find the 'books' directory in extracted backup."""
    if (extracted / "books").is_dir():
        return extracted / "books"
    for child in extracted.iterdir():
        if child.is_dir():
            if (child / "books").is_dir():
                return child / "books"
    return None


def _find_project_root(extracted: Path) -> Path | None:
    """Find the write-book-template project root."""
    # Check direct children
    if (extracted / "manuscript").is_dir():
        return extracted
    if (extracted / "config" / "metadata.yaml").exists():
        return extracted
    # Check one level deeper (ZIP often contains a top-level folder)
    for child in extracted.iterdir():
        if child.is_dir():
            if (child / "manuscript").is_dir() or (child / "config" / "metadata.yaml").exists():
                return child
    return None


def _extract_title(content: str, fallback: str) -> str:
    """Extract title from first H1 heading or use fallback."""
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped[2:].strip()
    # Clean up fallback from filename like "01-chapter" or "01-0-part-1-intro"
    # Strip leading numeric prefixes (01-, 01-0-, etc.)
    import re
    cleaned = re.sub(r"^[\d]+-[\d]*-?", "", fallback)
    if not cleaned:
        cleaned = fallback
    return cleaned.replace("-", " ").strip().title()


def _remove_first_heading(content: str) -> str:
    """Remove the first H1 heading from markdown content."""
    lines = content.split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return "\n".join(lines[i + 1:])
    return content


def _import_special_chapters(
    db: Session,
    book_id: str,
    directory: Path,
    type_map: dict[str, ChapterType],
) -> None:
    """Import front-matter or back-matter files as special chapter types."""
    # Use high position numbers so they sort after regular chapters
    base_position = 900
    for md_file in sorted(directory.glob("*.md")):
        stem = md_file.stem.lower()
        # Skip print variants (toc-print, about-the-author-print, etc.)
        if stem.endswith("-print"):
            continue
        chapter_type = type_map.get(stem)
        if not chapter_type:
            continue

        content = md_file.read_text(encoding="utf-8")
        title = _extract_title(content, stem)
        body = _remove_first_heading(content)

        chapter = Chapter(
            book_id=book_id,
            title=title,
            content=body.strip(),
            position=base_position,
            chapter_type=chapter_type.value,
        )
        db.add(chapter)
        base_position += 1
