"""Restore a .bgb full-data backup archive into the database."""

import json
import logging
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.backup_history import BackupHistory
from app.models import Article, ArticleAsset, Asset, Book, Chapter, ChapterType, Publication
from app.services.backup.archive_utils import find_articles_dir, find_books_dir, find_manifest
from app.services.backup.serializer import (
    restore_article_from_data,
    restore_book_from_data,
    restore_publication_from_data,
)

logger = logging.getLogger(__name__)
_history = BackupHistory()

# Manifest versions this build understands end-to-end. Newer values are
# accepted with a warning; the additive segment-discovery (books/,
# articles/, ...) keeps a 1.0 reader compatible with a 2.0 writer and
# a 2.0 reader compatible with a hypothetical 3.0 writer that only
# adds segments.
_KNOWN_MANIFEST_VERSIONS = {"1.0", "2.0"}


def import_backup_archive(file: UploadFile, db: Session) -> dict[str, int]:
    """Restore a .bgb backup file into the DB.

    Returns ``{"imported_books": N, "imported_articles": M}``.

    Backwards-compat: legacy backups (manifest version 1.0) have no
    ``articles/`` segment. Their absence is silently treated as
    "0 articles imported"; restore proceeds for the books segment as
    before. Manifest ``version`` 1.0 and 2.0 are both accepted.
    """
    _validate_bgb_filename(file.filename)
    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_restore_"))
    try:
        extracted = _extract_bgb(file, tmp_dir)
        _validate_backup_manifest(extracted)
        books_dir = _require_books_dir(extracted)

        imported_books = 0
        for book_dir in sorted(books_dir.iterdir()):
            if _restore_book_from_dir(db, book_dir):
                imported_books += 1

        # Articles segment (manifest version 2.0+). Missing directory is
        # the legacy 1.0 case - treat as zero articles, do not raise.
        imported_articles = 0
        articles_dir = find_articles_dir(extracted)
        if articles_dir is not None:
            for article_dir in sorted(articles_dir.iterdir()):
                if _restore_article_from_dir(db, article_dir):
                    imported_articles += 1

        db.commit()
        _history.add(
            action="restore",
            book_count=imported_books,
            filename=file.filename or "backup.bgb",
        )
        return {
            "imported_books": imported_books,
            "imported_articles": imported_articles,
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# --- Validation helpers ---


def _validate_bgb_filename(filename: str | None) -> None:
    if not filename:
        raise HTTPException(status_code=400, detail="No file provided")
    if filename.endswith(".bgb"):
        return
    if filename.endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="Das ist eine ZIP-Datei. Für Projekt-Import nutze den 'Import'-Button. "
            "Für Backup-Restore wird eine .bgb-Datei erwartet (erstellt über 'Backup').",
        )
    raise HTTPException(
        status_code=400,
        detail="Datei muss eine .bgb-Datei sein (Bibliogon Backup)",
    )


def _extract_bgb(file: UploadFile, tmp_dir: Path) -> Path:
    """Save the upload to disk, unzip it, return the extracted directory."""
    zip_path = tmp_dir / "backup.bgb"
    with open(zip_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    extracted = tmp_dir / "extracted"
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extracted)
    except zipfile.BadZipFile as e:
        raise HTTPException(status_code=400, detail="Beschaedigte .bgb-Datei") from e
    return extracted


def _validate_backup_manifest(extracted: Path) -> None:
    manifest = find_manifest(extracted)
    if not manifest:
        return
    manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
    if manifest_data.get("format") != "bibliogon-backup":
        raise HTTPException(
            status_code=400,
            detail="Ungültige Backup-Datei. Die Datei hat kein gültiges Bibliogon-Backup-Format.",
        )
    version = str(manifest_data.get("version", "1.0"))
    if version not in _KNOWN_MANIFEST_VERSIONS:
        # Forward-compat: don't reject. Future major bumps may add
        # new segments this reader does not know about; the additive
        # find_*_dir() helpers will simply not see them and the
        # restore proceeds with the segments we do recognize.
        logger.warning(
            "Backup manifest version %r is newer than this build "
            "supports (%s). Restoring known segments only; please "
            "upgrade Bibliogon to read the full archive.",
            version,
            sorted(_KNOWN_MANIFEST_VERSIONS),
        )


def _require_books_dir(extracted: Path) -> Path:
    books_dir = find_books_dir(extracted)
    if not books_dir:
        raise HTTPException(
            status_code=400,
            detail="Ungültige Backup-Datei: kein 'books'-Verzeichnis gefunden. "
            "Ist das vielleicht ein Projekt-ZIP? Dann nutze den 'Import'-Button.",
        )
    return books_dir


# --- Per-book restore ---


def _restore_book_from_dir(db: Session, book_dir: Path) -> bool:
    """Restore one book directory. Returns True if a book was added or
    revived from the trash (soft-delete).

    Behavior:
    - Directory malformed or no book.json: return False.
    - Book id exists and is NOT soft-deleted: skip as already-imported.
    - Book id exists and IS soft-deleted: clear `deleted_at`, replace
      the book's scalar fields with the backup snapshot, wipe + re-add
      chapters + assets, count as one restored book.
    - Book id does not exist: create fresh.
    """
    if not book_dir.is_dir():
        return False
    book_json = book_dir / "book.json"
    if not book_json.exists():
        return False

    book_data = json.loads(book_json.read_text(encoding="utf-8"))
    existing = db.query(Book).filter(Book.id == book_data["id"]).first()
    if existing is not None and existing.deleted_at is None:
        return False  # live record: import is idempotent, skip
    if existing is not None and existing.deleted_at is not None:
        # Soft-deleted (trash): revive by hard-deleting the stale row
        # and re-inserting via the same path as a fresh import. This
        # avoids the landmine of partial attribute updates interacting
        # with SQLAlchemy's unit of work for NOT-NULL columns the
        # backup does not carry (ai_tokens_used, created_at,
        # updated_at) and keeps the revived row consistent with the
        # backup snapshot.
        db.query(Chapter).filter(Chapter.book_id == book_data["id"]).delete()
        db.query(Asset).filter(Asset.book_id == book_data["id"]).delete()
        db.delete(existing)
        db.flush()

    book = restore_book_from_data(book_data)
    db.add(book)
    _restore_chapters(db, book_dir / "chapters", book_data["id"])
    _restore_assets(db, book_dir, book_data["id"])
    return True

    book = restore_book_from_data(book_data)
    db.add(book)
    _restore_chapters(db, book_dir / "chapters", book_data["id"])
    _restore_assets(db, book_dir, book_data["id"])
    return True


def _restore_article_from_dir(db: Session, article_dir: Path) -> bool:
    """Restore one article directory. Returns True if an article was
    added or revived from the trash.

    Mirrors :func:`_restore_book_from_dir` semantics:
    - Directory malformed or no article.json: return False.
    - Article id exists and is NOT soft-deleted: skip (idempotent).
    - Article id exists and IS soft-deleted: hard-delete the stale
      row + cascading children, then re-insert from the backup
      snapshot. Same shape as the books revive path.
    - Article id does not exist: insert fresh.

    On insertion the publications and article-assets travel with the
    article via ``_restore_publications`` + ``_restore_article_assets``.
    """
    if not article_dir.is_dir():
        return False
    article_json = article_dir / "article.json"
    if not article_json.exists():
        return False

    article_data = json.loads(article_json.read_text(encoding="utf-8"))
    existing = db.query(Article).filter(Article.id == article_data["id"]).first()
    if existing is not None and existing.deleted_at is None:
        return False
    if existing is not None and existing.deleted_at is not None:
        db.query(Publication).filter(Publication.article_id == article_data["id"]).delete()
        db.query(ArticleAsset).filter(ArticleAsset.article_id == article_data["id"]).delete()
        db.delete(existing)
        db.flush()

    article = restore_article_from_data(article_data)
    db.add(article)
    db.flush()
    _restore_publications(db, article_dir, article_data["id"])
    _restore_article_assets(db, article_dir, article_data["id"])
    return True


def _restore_publications(db: Session, article_dir: Path, article_id: str) -> None:
    pubs_json = article_dir / "publications.json"
    if not pubs_json.exists():
        return
    payload = json.loads(pubs_json.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return
    for pub_data in payload:
        # Coerce article_id to the row we just (re-)inserted to defend
        # against a backup whose article id was edited by hand.
        pub_data["article_id"] = article_id
        db.add(restore_publication_from_data(pub_data))


def _restore_article_assets(db: Session, article_dir: Path, article_id: str) -> None:
    """Recreate ArticleAsset rows + copy files into ``uploads/articles/{id}/``.

    Asset paths in the manifest are informational; the destination is
    regenerated from the canonical ``uploads/articles/`` layout used
    by ``article_assets.py``. Mirrors how ``_restore_assets`` rebuilds
    book asset paths.
    """
    assets_json = article_dir / "assets.json"
    if not assets_json.exists():
        return

    base_uploads = Path("uploads") / "articles" / article_id
    assets_src_dir = article_dir / "assets"
    assets_meta: list[dict[str, Any]] = json.loads(assets_json.read_text(encoding="utf-8"))
    for meta in assets_meta:
        asset_type = meta.get("asset_type", "featured_image")
        dest_dir = base_uploads / asset_type
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / meta["filename"]

        src_file = assets_src_dir / meta["filename"]
        if src_file.exists():
            shutil.copy2(src_file, dest_path)

        db.add(
            ArticleAsset(
                article_id=article_id,
                filename=meta["filename"],
                asset_type=asset_type,
                path=str(dest_path),
            )
        )


def _restore_chapters(db: Session, chapters_dir: Path, book_id: str) -> None:
    if not chapters_dir.exists():
        return
    for ch_file in sorted(chapters_dir.glob("*.json")):
        ch_data = json.loads(ch_file.read_text(encoding="utf-8"))
        db.add(
            Chapter(
                id=ch_data["id"],
                book_id=book_id,
                title=ch_data["title"],
                content=ch_data.get("content", ""),
                position=ch_data.get("position", 0),
                chapter_type=ch_data.get("chapter_type", ChapterType.CHAPTER.value),
            )
        )


def _restore_assets(db: Session, book_dir: Path, book_id: str) -> None:
    """Recreate Asset rows and copy files into the uploads directory."""
    assets_json = book_dir / "assets.json"
    if not assets_json.exists():
        return

    from app.routers.assets import UPLOAD_DIR

    assets_src_dir = book_dir / "assets"
    assets_meta: list[dict[str, Any]] = json.loads(assets_json.read_text(encoding="utf-8"))
    for meta in assets_meta:
        asset_type = meta.get("asset_type", "figure")
        dest_dir = UPLOAD_DIR / book_id / asset_type
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / meta["filename"]

        src_file = assets_src_dir / meta["filename"]
        if src_file.exists():
            shutil.copy2(src_file, dest_path)

        db.add(
            Asset(
                book_id=book_id,
                filename=meta["filename"],
                asset_type=asset_type,
                path=str(dest_path),
            )
        )
