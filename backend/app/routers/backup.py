"""Full-data backup and restore, plus write-book-template ZIP import."""

import json
import re as _re
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import markdown as _md

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

        # Book metadata (all fields)
        book_data = {
            "id": book.id,
            "title": book.title,
            "subtitle": book.subtitle,
            "author": book.author,
            "language": book.language,
            "series": book.series,
            "series_index": book.series_index,
            "description": book.description,
            "edition": book.edition,
            "publisher": book.publisher,
            "publisher_city": book.publisher_city,
            "publish_date": book.publish_date,
            "isbn_ebook": book.isbn_ebook,
            "isbn_paperback": book.isbn_paperback,
            "isbn_hardcover": book.isbn_hardcover,
            "asin_ebook": book.asin_ebook,
            "asin_paperback": book.asin_paperback,
            "asin_hardcover": book.asin_hardcover,
            "keywords": book.keywords,
            "html_description": book.html_description,
            "backpage_description": book.backpage_description,
            "backpage_author_bio": book.backpage_author_bio,
            "cover_image": book.cover_image,
            "custom_css": book.custom_css,
            "tts_engine": book.tts_engine,
            "tts_voice": book.tts_voice,
            "tts_language": book.tts_language,
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

        # Copy assets with metadata
        assets = db.query(Asset).filter(Asset.book_id == book.id).all()
        if assets:
            assets_dir = book_dir / "assets"
            assets_dir.mkdir()
            assets_meta = []
            for asset in assets:
                assets_meta.append({
                    "id": asset.id,
                    "filename": asset.filename,
                    "asset_type": asset.asset_type,
                    "path": asset.path,
                })
                src = Path(asset.path)
                if src.exists():
                    shutil.copy2(src, assets_dir / asset.filename)
            (book_dir / "assets.json").write_text(
                json.dumps(assets_meta, ensure_ascii=False, indent=2), encoding="utf-8"
            )

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


@router.post("/smart-import")
def smart_import(file: UploadFile, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Unified import: auto-detects file format and routes to the correct handler.

    Supported formats:
    - .bgb -> Backup Restore
    - .bgp -> Project Import
    - .zip with metadata.yaml -> write-book-template Import
    - .zip with .md files -> Markdown collection Import
    - .md -> Single chapter (creates new book)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename = file.filename.lower()

    # 1. .bgb -> Backup Restore
    if filename.endswith(".bgb"):
        result = import_backup(file, db)
        return {"type": "backup", "result": result}

    # 2. .bgp -> Project Import
    if filename.endswith(".bgp"):
        result = import_project(file, db)
        return {"type": "project", "result": result}

    # 3. .md -> Single markdown file
    if filename.endswith(".md"):
        result = _import_single_markdown(file, db)
        return {"type": "chapter", "result": result}

    # 4. .zip -> Analyze contents
    if filename.endswith(".zip"):
        tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_smart_import_"))
        try:
            zip_path = tmp_dir / "upload.zip"
            with open(zip_path, "wb") as f:
                shutil.copyfileobj(file.file, f)

            try:
                with zipfile.ZipFile(zip_path, "r") as zf:
                    names = zf.namelist()
            except zipfile.BadZipFile:
                raise HTTPException(status_code=400, detail="Corrupted ZIP file")

            def _reopen(name: str) -> UploadFile:
                """Create a fresh UploadFile from the saved zip for delegation."""
                fh = open(zip_path, "rb")
                return UploadFile(file=fh, filename=name)

            # Check for bgb structure (manifest.json with bibliogon-backup format)
            if any("manifest.json" in n for n in names):
                result = import_backup(_reopen("backup.bgb"), db)
                return {"type": "backup", "result": result}

            # Check for write-book-template (metadata.yaml)
            has_metadata = any(n.endswith("metadata.yaml") for n in names)
            if has_metadata:
                result = import_project(_reopen("project.bgp"), db)
                return {"type": "template", "result": result}

            # Check for loose .md files (markdown collection)
            md_files = [n for n in names if n.endswith(".md") and not n.startswith("__")]
            if md_files:
                with zipfile.ZipFile(zip_path, "r") as zf:
                    zf.extractall(tmp_dir / "extracted")
                result = _import_plain_markdown_zip(tmp_dir / "extracted", db, tmp_dir)
                return {"type": "markdown", "result": result}

            raise HTTPException(
                status_code=400,
                detail="ZIP contains no recognized content. Expected: metadata.yaml (write-book-template), .md files, or bibliogon backup.",
            )
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported file format: '{filename}'. Supported: .zip, .md, .bgb, .bgp",
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
                edition=book_data.get("edition"),
                publisher=book_data.get("publisher"),
                publisher_city=book_data.get("publisher_city"),
                publish_date=book_data.get("publish_date"),
                isbn_ebook=book_data.get("isbn_ebook"),
                isbn_paperback=book_data.get("isbn_paperback"),
                isbn_hardcover=book_data.get("isbn_hardcover"),
                asin_ebook=book_data.get("asin_ebook"),
                asin_paperback=book_data.get("asin_paperback"),
                asin_hardcover=book_data.get("asin_hardcover"),
                keywords=book_data.get("keywords"),
                html_description=book_data.get("html_description"),
                backpage_description=book_data.get("backpage_description"),
                backpage_author_bio=book_data.get("backpage_author_bio"),
                cover_image=book_data.get("cover_image"),
                custom_css=book_data.get("custom_css"),
                tts_engine=book_data.get("tts_engine"),
                tts_voice=book_data.get("tts_voice"),
                tts_language=book_data.get("tts_language"),
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

            # Restore assets
            assets_json = book_dir / "assets.json"
            assets_src_dir = book_dir / "assets"
            if assets_json.exists():
                from app.routers.assets import UPLOAD_DIR
                assets_meta = json.loads(assets_json.read_text(encoding="utf-8"))
                for meta in assets_meta:
                    src_file = assets_src_dir / meta["filename"]
                    # Restore file to uploads directory
                    asset_type = meta.get("asset_type", "figure")
                    dest_dir = UPLOAD_DIR / book_data["id"] / asset_type
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    dest_path = dest_dir / meta["filename"]
                    if src_file.exists():
                        shutil.copy2(src_file, dest_path)
                    asset = Asset(
                        book_id=book_data["id"],
                        filename=meta["filename"],
                        asset_type=asset_type,
                        path=str(dest_path),
                    )
                    db.add(asset)

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
    valid_ext = (
        file.filename.endswith(".bgp")
        or file.filename.endswith(".zip")
        or file.filename.endswith(".md")
    )
    if not valid_ext:
        raise HTTPException(
            status_code=400,
            detail="Datei muss eine .bgp/.zip-Datei (Projekt) oder .md-Datei (Markdown) sein",
        )

    # Single Markdown file import
    if file.filename.endswith(".md"):
        return _import_single_markdown(file, db)

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
            # Fallback: try plain Markdown import (ZIP with .md files, no project structure)
            return _import_plain_markdown_zip(extracted, db, tmp_dir)

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

        # Parse ISBN (supports both isbn.X and identifiers.isbn_X formats)
        isbn_raw = metadata.get("isbn", {})
        identifiers = metadata.get("identifiers", {})
        isbn_ebook = (
            (isbn_raw.get("ebook") if isinstance(isbn_raw, dict) else None)
            or identifiers.get("isbn_ebook")
        )
        isbn_pb = (
            (isbn_raw.get("paperback") if isinstance(isbn_raw, dict) else None)
            or identifiers.get("isbn_paperback")
        )
        isbn_hc = (
            (isbn_raw.get("hardcover") if isinstance(isbn_raw, dict) else None)
            or identifiers.get("isbn_hardcover")
        )

        # Parse ASIN (ebook, paperback, hardcover)
        asin_raw = metadata.get("asin", {})
        asin_ebook = asin_raw.get("ebook") if isinstance(asin_raw, dict) else None
        asin_pb = asin_raw.get("paperback") if isinstance(asin_raw, dict) else None
        asin_hc = asin_raw.get("hardcover") if isinstance(asin_raw, dict) else None

        # Parse keywords (from metadata or config/keywords.md)
        keywords_raw = metadata.get("keywords", [])
        keywords_str = json.dumps(keywords_raw) if isinstance(keywords_raw, list) and keywords_raw else None

        # Read additional config files
        config_dir = project_root / "config"
        html_desc = _read_file_if_exists(config_dir / "book-description.html")
        backpage_desc = _read_file_if_exists(config_dir / "cover-back-page-description.md")
        backpage_bio = _read_file_if_exists(config_dir / "cover-back-page-author-introduction.md")
        custom_css = _read_file_if_exists(config_dir / "styles.css")

        # Read export-settings.yaml for section ordering
        export_settings_path = config_dir / "export-settings.yaml"
        section_order: list[str] = []
        if export_settings_path.exists():
            with open(export_settings_path, "r", encoding="utf-8") as f:
                export_settings = yaml.safe_load(f) or {}
            # Use ebook order as default (most common)
            so = export_settings.get("section_order", {})
            section_order = so.get("ebook", so.get("paperback", []))
            if not isinstance(section_order, list):
                section_order = []

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
            isbn_ebook=isbn_ebook or None,
            isbn_paperback=isbn_pb or None,
            isbn_hardcover=isbn_hc or None,
            asin_ebook=asin_ebook,
            asin_paperback=asin_pb,
            asin_hardcover=asin_hc,
            keywords=keywords_str,
            html_description=html_desc,
            backpage_description=backpage_desc,
            backpage_author_bio=backpage_bio,
            cover_image=metadata.get("cover_image"),
            custom_css=custom_css,
        )
        db.add(book)
        db.flush()  # get book.id

        # Build file lookup maps
        manuscript_dir = project_root / "manuscript"
        front_dir = manuscript_dir / "front-matter"
        chapters_dir = manuscript_dir / "chapters"
        back_dir = manuscript_dir / "back-matter"

        # Import using section_order if available
        total_count = 0
        if section_order:
            total_count = _import_with_section_order(
                db, book.id, manuscript_dir, section_order,
            )
        else:
            # Fallback: alphabetical import per directory
            if front_dir.exists():
                total_count += _import_special_chapters(
                    db, book.id, front_dir, _FRONT_MATTER_MAP, base_position=0,
                )
            if chapters_dir.exists():
                pos = 100
                for md_file in sorted(chapters_dir.glob("*.md")):
                    if md_file.stem.endswith("-print"):
                        continue
                    content = md_file.read_text(encoding="utf-8")
                    title = _extract_title(content, md_file.stem)
                    body = content
                    chapter_type = _detect_chapter_type(md_file.stem)
                    chapter = Chapter(
                        book_id=book.id, title=title,
                        content=_md_to_html(body.strip()),
                        position=pos, chapter_type=chapter_type.value,
                    )
                    db.add(chapter)
                    pos += 1
                    total_count += 1
            if back_dir.exists():
                total_count += _import_special_chapters(
                    db, book.id, back_dir, _BACK_MATTER_MAP, base_position=900,
                )

        # Import assets (covers, figures, diagrams, etc.)
        assets_dir = project_root / "assets"
        asset_count = 0
        if assets_dir.exists():
            asset_count = _import_assets(db, book.id, assets_dir)

        # Rewrite image paths in chapter content to point to asset API
        if asset_count > 0:
            db.flush()  # ensure assets and chapters are queryable
            _rewrite_image_paths(db, book.id)

        # Set cover_image if found and not already set
        if not book.cover_image:
            db.flush()  # ensure assets are queryable
            cover_asset = (
                db.query(Asset)
                .filter(Asset.book_id == book.id, Asset.asset_type == "cover")
                .first()
            )
            if cover_asset:
                book.cover_image = cover_asset.path

        db.commit()
        db.refresh(book)

        return {
            "book_id": book.id,
            "title": book.title,
            "chapter_count": total_count,
            "asset_count": asset_count,
        }

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# --- Helpers ---

_FRONT_MATTER_MAP = {
    "toc": ChapterType.TABLE_OF_CONTENTS,
    "dedication": ChapterType.DEDICATION,
    "epigraph": ChapterType.EPIGRAPH,
    "preface": ChapterType.PREFACE,
    "foreword": ChapterType.FOREWORD,
    "prologue": ChapterType.PROLOGUE,
    "introduction": ChapterType.INTRODUCTION,
    "translators-note": ChapterType.PREFACE,
}

_BACK_MATTER_MAP = {
    "epilogue": ChapterType.EPILOGUE,
    "afterword": ChapterType.AFTERWORD,
    "about-the-author": ChapterType.ABOUT_AUTHOR,
    "acknowledgments": ChapterType.ACKNOWLEDGMENTS,
    "appendix": ChapterType.APPENDIX,
    "bibliography": ChapterType.BIBLIOGRAPHY,
    "endnotes": ChapterType.ENDNOTES,
    "glossary": ChapterType.GLOSSARY,
    "index": ChapterType.INDEX,
    "imprint": ChapterType.IMPRINT,
    "next-in-series": ChapterType.NEXT_IN_SERIES,
    "other-publications": ChapterType.NEXT_IN_SERIES,
}

# Combined map for all special sections (front + back matter)
_ALL_SPECIAL_MAP = {**_FRONT_MATTER_MAP, **_BACK_MATTER_MAP}

# Filename patterns for chapter type detection
_CHAPTER_FILENAME_PATTERNS = {
    "part": ChapterType.PART_INTRO,
    "part-intro": ChapterType.PART_INTRO,
    "interludium": ChapterType.INTERLUDE,
    "interlude": ChapterType.INTERLUDE,
}


def _import_single_markdown(file: UploadFile, db: Session) -> dict[str, Any]:
    """Import a single Markdown file as a new book with one chapter."""
    content = file.file.read().decode("utf-8")
    filename = file.filename or "untitled.md"
    title = _extract_title(content, filename.replace(".md", ""))

    book = Book(title=title, author="Unknown", language="de")
    db.add(book)
    db.flush()

    chapter = Chapter(
        book_id=book.id,
        title=title,
        content=_md_to_html(content),
        position=0,
        chapter_type=ChapterType.CHAPTER.value,
    )
    db.add(chapter)
    db.commit()
    db.refresh(book)

    return {"book_id": book.id, "title": book.title, "chapter_count": 1}


def _import_plain_markdown_zip(extracted: Path, db: Session, tmp_dir: Path) -> dict[str, Any]:
    """Import a ZIP containing plain Markdown files (no write-book-template structure).

    Each .md file becomes a chapter. The ZIP name or first file becomes the book title.
    """
    # Collect all .md files recursively
    md_files = sorted(extracted.rglob("*.md"))
    if not md_files:
        raise HTTPException(
            status_code=400,
            detail="Keine Markdown-Dateien im ZIP gefunden. "
                   "Erwartet wird ein write-book-template Projekt oder eine Sammlung von .md Dateien.",
        )

    # Derive book title from first file or directory name
    first_title = _extract_title(md_files[0].read_text(encoding="utf-8"), md_files[0].stem)
    book_title = first_title if len(md_files) == 1 else extracted.name
    # Clean up extracted dir name
    if book_title == "extracted":
        book_title = md_files[0].stem.replace("-", " ").title()

    book = Book(title=book_title, author="Unknown", language="de")
    db.add(book)
    db.flush()

    for position, md_file in enumerate(md_files):
        content = md_file.read_text(encoding="utf-8")
        title = _extract_title(content, md_file.stem)
        chapter = Chapter(
            book_id=book.id,
            title=title,
            content=_md_to_html(content),
            position=position,
            chapter_type=ChapterType.CHAPTER.value,
        )
        db.add(chapter)

    db.commit()
    db.refresh(book)
    shutil.rmtree(tmp_dir, ignore_errors=True)

    return {"book_id": book.id, "title": book.title, "chapter_count": len(md_files)}


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


def _import_with_section_order(
    db: Session,
    book_id: str,
    manuscript_dir: Path,
    section_order: list[str],
) -> int:
    """Import chapters following the section_order from export-settings.yaml.

    Section order entries are like:
        - front-matter/toc.md
        - front-matter/translators-note.md
        - front-matter/foreword.md
        - front-matter/preface.md
        - chapters                    (placeholder: all chapter files)
        - back-matter/epilogue.md
        - back-matter/about-the-author.md
    """
    count = 0
    position = 0
    imported_files: set[str] = set()

    for entry in section_order:
        entry = entry.strip()

        if entry == "chapters":
            # Import all chapter files in alphabetical order
            chapters_dir = manuscript_dir / "chapters"
            if chapters_dir.exists():
                for md_file in sorted(chapters_dir.glob("*.md")):
                    if md_file.stem.endswith("-print"):
                        continue
                    content = md_file.read_text(encoding="utf-8")
                    title = _extract_title(content, md_file.stem)
                    body = content
                    chapter_type = _detect_chapter_type(md_file.stem)
                    chapter = Chapter(
                        book_id=book_id, title=title,
                        content=_md_to_html(body.strip()),
                        position=position, chapter_type=chapter_type.value,
                    )
                    db.add(chapter)
                    position += 1
                    count += 1
        else:
            # Specific file: front-matter/foreword.md or back-matter/epilogue.md
            md_path = manuscript_dir / entry
            if not md_path.exists() or md_path.stem.endswith("-print"):
                continue

            stem = md_path.stem.lower()
            if stem in imported_files:
                continue
            imported_files.add(stem)

            # Determine chapter type from filename
            chapter_type = _ALL_SPECIAL_MAP.get(stem, ChapterType.CHAPTER)

            content = md_path.read_text(encoding="utf-8")
            title = _extract_title(content, stem)
            body = content

            chapter = Chapter(
                book_id=book_id, title=title,
                content=_md_to_html(body.strip()),
                position=position, chapter_type=chapter_type.value,
            )
            db.add(chapter)
            position += 1
            count += 1

    # Import any remaining files not in section_order
    for subdir, type_map in [
        (manuscript_dir / "front-matter", _FRONT_MATTER_MAP),
        (manuscript_dir / "back-matter", _BACK_MATTER_MAP),
    ]:
        if not subdir.exists():
            continue
        for md_file in sorted(subdir.glob("*.md")):
            stem = md_file.stem.lower()
            if stem.endswith("-print") or stem in imported_files:
                continue
            chapter_type_or_none = type_map.get(stem)
            if not chapter_type_or_none:
                continue
            chapter_type = chapter_type_or_none
            imported_files.add(stem)
            content = md_file.read_text(encoding="utf-8")
            title = _extract_title(content, stem)
            body = content
            chapter = Chapter(
                book_id=book_id, title=title,
                content=_md_to_html(body.strip()),
                position=position, chapter_type=chapter_type.value,
            )
            db.add(chapter)
            position += 1
            count += 1

    return count


def _rewrite_image_paths(db: Session, book_id: str) -> None:
    """Rewrite image src paths in chapter content to point to the asset API.

    Converts paths like:
        assets/figures/diagram.png  ->  /api/books/{id}/assets/file/diagram.png
        assets/logo/logo.png        ->  /api/books/{id}/assets/file/logo.png
    """
    import re

    # Build filename lookup
    assets = db.query(Asset).filter(Asset.book_id == book_id).all()
    known_filenames = {a.filename for a in assets}

    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).all()
    api_base = f"/api/books/{book_id}/assets/file"

    for ch in chapters:
        if "<img" not in ch.content:
            continue

        def replace_src(match: re.Match[str]) -> str:
            src: str = match.group(1)
            # Extract just the filename from any path
            filename = src.rsplit("/", 1)[-1] if "/" in src else src
            if filename in known_filenames:
                return f'src="{api_base}/{filename}"'
            return str(match.group(0))

        new_content = re.sub(r'src="([^"]+)"', replace_src, ch.content)
        if new_content != ch.content:
            ch.content = new_content


_ASSET_TYPE_MAP = {
    "covers": "cover",
    "figures": "figure",
    "diagrams": "diagram",
    "tables": "table",
    "logo": "figure",
    "author": "figure",
    "infographics": "figure",
}

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".tiff"}


def _import_assets(db: Session, book_id: str, assets_dir: Path) -> int:
    """Import images and other assets from the project's assets directory.

    Walks the assets directory tree, determines asset_type from folder name,
    and copies files to the uploads directory.
    """
    from app.routers.assets import UPLOAD_DIR

    count = 0
    for file_path in assets_dir.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in _IMAGE_EXTENSIONS:
            continue

        # Determine asset type from parent directory name
        rel = file_path.relative_to(assets_dir)
        parts = rel.parts
        folder_name = parts[0].lower() if parts else ""
        asset_type = _ASSET_TYPE_MAP.get(folder_name, "figure")

        # Check subdirectories (e.g. figures/diagrams/)
        if len(parts) > 2:
            subfolder = parts[1].lower()
            if subfolder in _ASSET_TYPE_MAP:
                asset_type = _ASSET_TYPE_MAP[subfolder]

        # Copy to uploads directory
        dest_dir = UPLOAD_DIR / book_id / asset_type
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / file_path.name
        shutil.copy2(file_path, dest_path)

        asset = Asset(
            book_id=book_id,
            filename=file_path.name,
            asset_type=asset_type,
            path=str(dest_path),
        )
        db.add(asset)
        count += 1

    return count


def _read_file_if_exists(path: Path) -> str | None:
    """Read file contents if it exists, otherwise return None."""
    if path.exists():
        text = path.read_text(encoding="utf-8").strip()
        return text if text else None
    return None


def _detect_chapter_type(stem: str) -> ChapterType:
    """Detect chapter type from filename stem.

    Examples:
        01-0-part-1-intro -> PART_INTRO
        05-1-interludium  -> INTERLUDE
        01-chapter        -> CHAPTER
    """
    import re
    # Strip leading numeric prefixes: "01-0-", "05-1-", "01-"
    cleaned = re.sub(r"^[\d]+(-[\d]+)?-", "", stem).lower()

    # Check for known patterns
    for pattern, chapter_type in _CHAPTER_FILENAME_PATTERNS.items():
        if cleaned.startswith(pattern):
            return chapter_type

    return ChapterType.CHAPTER


def _extract_title(content: str, fallback: str) -> str:
    """Extract title from first H1 heading or use fallback."""
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped[2:].strip()
    # Clean up fallback from filename like "01-chapter" or "01-0-part-1-intro"
    import re
    cleaned = re.sub(r"^[\d]+(-[\d]+)?-", "", fallback)
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


def _md_to_html(text: str) -> str:
    """Convert markdown to HTML for TipTap editor.

    TipTap stores content as JSON internally but can parse HTML via setContent().
    Storing imported markdown as HTML ensures the editor renders it correctly
    instead of showing raw markdown symbols.
    """
    if not text or not text.strip():
        return ""
    # Remove explicit anchor markers {#id} before conversion (Pandoc-specific)
    cleaned = _re.sub(r"\s*\{#[\w-]+\}", "", text)
    # Python's markdown library requires 4-space indent for nested lists,
    # but write-book-template uses 2-space indent. Double the indentation.
    cleaned = _re.sub(
        r"^( {2,})(?=-|\*|\d+\.)",
        lambda m: m.group(1) * 2,
        cleaned,
        flags=_re.MULTILINE,
    )
    html = _md.markdown(
        cleaned,
        extensions=["tables", "fenced_code", "attr_list"],
        output_format="html",
    )
    # Figure extension parses <figure> with figcaption natively.
    # But <figure> WITHOUT figcaption causes double rendering (both <figure> and <img> match).
    # Strip <figure> wrapper when there's no <figcaption>, keeping just <img>.
    html = _re.sub(
        r"<figure>\s*(<img[^>]*/>)\s*</figure>",
        r"\1",
        html,
    )
    return html


def _import_special_chapters(
    db: Session,
    book_id: str,
    directory: Path,
    type_map: dict[str, ChapterType],
    base_position: int = 900,
) -> int:
    """Import front-matter or back-matter files as special chapter types.

    Returns the number of imported chapters.
    """
    count = 0
    for md_file in sorted(directory.glob("*.md")):
        stem = md_file.stem.lower()
        # Skip print variants and explicitly skipped files
        if stem.endswith("-print"):
            continue
        chapter_type = type_map.get(stem)
        if not chapter_type:
            continue

        content = md_file.read_text(encoding="utf-8")
        title = _extract_title(content, stem)
        body = content

        chapter = Chapter(
            book_id=book_id,
            title=title,
            content=_md_to_html(body.strip()),
            position=base_position + count,
            chapter_type=chapter_type.value,
        )
        db.add(chapter)
        count += 1
    return count
