"""Build a .bgb full-data backup archive."""

import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.backup_history import BackupHistory
from app.models import Asset, Book, Chapter
from app.services.backup.serializer import serialize_book_for_backup

_history = BackupHistory()


def export_backup_archive(db: Session) -> tuple[Path, str]:
    """Export all books, chapters and assets as a single .bgb archive.

    Returns the path to the .bgb file and the suggested download filename.
    """
    books = db.query(Book).options(joinedload(Book.chapters)).all()

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_backup_"))
    backup_dir = tmp_dir / f"bibliogon-backup-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    books_dir = backup_dir / "books"

    for book in books:
        _write_book_dir(db, book, books_dir / book.id)

    _write_manifest(backup_dir, len(books))
    bgb_path = _build_bgb_archive(backup_dir)

    _history.add(
        action="backup",
        book_count=len(books),
        chapter_count=sum(len(b.chapters) for b in books),
        file_size_bytes=bgb_path.stat().st_size,
        filename=f"{backup_dir.name}.bgb",
    )

    return bgb_path, f"{backup_dir.name}.bgb"


# --- Step helpers ---


def _write_book_dir(db: Session, book: Book, book_dir: Path) -> None:
    """Write one book.json + chapters/ + (optional) assets/ to ``book_dir``."""
    book_dir.mkdir(parents=True)
    _write_json(book_dir / "book.json", serialize_book_for_backup(book))
    _write_chapters(book_dir / "chapters", book.chapters)
    _write_assets(db, book.id, book_dir)


def _write_chapters(chapters_dir: Path, chapters: list[Chapter]) -> None:
    chapters_dir.mkdir()
    for chapter in chapters:
        _write_json(chapters_dir / f"{chapter.id}.json", _serialize_chapter(chapter))


def _serialize_chapter(chapter: Chapter) -> dict[str, Any]:
    return {
        "id": chapter.id,
        "title": chapter.title,
        "content": chapter.content,
        "position": chapter.position,
        "chapter_type": chapter.chapter_type,
        "created_at": chapter.created_at.isoformat(),
        "updated_at": chapter.updated_at.isoformat(),
    }


def _write_assets(db: Session, book_id: str, book_dir: Path) -> None:
    """Copy asset files and write assets.json next to them. Skipped if no assets."""
    assets = db.query(Asset).filter(Asset.book_id == book_id).all()
    if not assets:
        return

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
    _write_json(book_dir / "assets.json", assets_meta)


def _write_manifest(backup_dir: Path, book_count: int) -> None:
    _write_json(backup_dir / "manifest.json", {
        "format": "bibliogon-backup",
        "version": "1.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "book_count": book_count,
    })


def _build_bgb_archive(backup_dir: Path) -> Path:
    """ZIP the backup directory and rename .zip -> .bgb."""
    zip_path = shutil.make_archive(str(backup_dir), "zip", str(backup_dir))
    bgb_path = Path(zip_path.replace(".zip", ".bgb"))
    Path(zip_path).rename(bgb_path)
    return bgb_path


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
