"""Build a .bgb full-data backup archive."""

import json
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.backup_history import BackupHistory
from app.models import Article, ArticleAsset, Asset, Book, Chapter, Publication
from app.paths import get_upload_dir
from app.services.backup.serializer import (
    serialize_article_asset_for_backup,
    serialize_article_for_backup,
    serialize_book_for_backup,
    serialize_publication_for_backup,
)

_history = BackupHistory()


def export_backup_archive(db: Session, include_audiobook: bool = False) -> tuple[Path, str]:
    """Export all books + articles + their related rows as a single
    .bgb archive.

    Args:
        db: SQLAlchemy session.
        include_audiobook: When true, also bundle the persisted
            ``uploads/{book_id}/audiobook/`` directories. Off by default
            because audiobook MP3s blow up the backup size by hundreds
            of megabytes; the user opts in via a checkbox in the UI.

    Returns the path to the .bgb file and the suggested download filename.

    Manifest contract:
        - ``version: "2.0"`` carries an ``articles/`` segment.
        - ``version: "1.0"`` (legacy) had only ``books/``; the restore
          side reads either form so old backups keep working.
    """
    books = db.query(Book).options(joinedload(Book.chapters)).all()
    articles = db.query(Article).all()

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_backup_"))
    backup_dir = tmp_dir / f"bibliogon-backup-{datetime.now(UTC).strftime('%Y-%m-%d')}"
    books_dir = backup_dir / "books"
    # Always materialise the books/ directory so the restore-side
    # ``_require_books_dir`` validator can rely on its presence even
    # when this install only has articles (zero-books edge case).
    books_dir.mkdir(parents=True)

    for book in books:
        _write_book_dir(db, book, books_dir / book.id, include_audiobook=include_audiobook)

    publication_count = 0
    article_asset_count = 0
    if articles:
        articles_dir = backup_dir / "articles"
        for article in articles:
            pubs, asset_count = _write_article_dir(db, article, articles_dir / article.id)
            publication_count += pubs
            article_asset_count += asset_count

    _write_manifest(
        backup_dir,
        book_count=len(books),
        article_count=len(articles),
        publication_count=publication_count,
        article_asset_count=article_asset_count,
        include_audiobook=include_audiobook,
    )
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


def _write_book_dir(
    db: Session,
    book: Book,
    book_dir: Path,
    include_audiobook: bool = False,
) -> None:
    """Write one book.json + chapters/ + (optional) assets/audiobook/ to ``book_dir``."""
    book_dir.mkdir(parents=True)
    _write_json(book_dir / "book.json", serialize_book_for_backup(book))
    _write_chapters(book_dir / "chapters", book.chapters)
    _write_assets(db, book.id, book_dir)
    if include_audiobook:
        _write_audiobook(book.id, book_dir)


def _write_article_dir(
    db: Session,
    article: Article,
    article_dir: Path,
) -> tuple[int, int]:
    """Write one ``article.json`` + ``publications.json`` + assets to
    ``article_dir``. Returns (publication_count, asset_count).

    Soft-deleted articles round-trip with their ``deleted_at`` field;
    the restore path keeps trashed articles trashed. Mirrors the
    books-side behaviour where ``Book.deleted_at`` survives the round
    trip too.
    """
    article_dir.mkdir(parents=True)
    _write_json(article_dir / "article.json", serialize_article_for_backup(article))

    publications = db.query(Publication).filter(Publication.article_id == article.id).all()
    if publications:
        _write_json(
            article_dir / "publications.json",
            [serialize_publication_for_backup(p) for p in publications],
        )

    assets = db.query(ArticleAsset).filter(ArticleAsset.article_id == article.id).all()
    if assets:
        assets_dir = article_dir / "assets"
        assets_dir.mkdir()
        _write_json(
            article_dir / "assets.json",
            [serialize_article_asset_for_backup(a) for a in assets],
        )
        for asset in assets:
            src = Path(asset.path)
            if src.exists():
                shutil.copy2(src, assets_dir / asset.filename)

    return len(publications), len(assets)


def _write_audiobook(book_id: str, book_dir: Path) -> None:
    """Copy ``uploads/{book_id}/audiobook/`` into the backup if present.

    Walked manually rather than ``shutil.copytree`` so we can skip the
    metadata.json (it gets re-created on restore from the surviving
    layout) and silently ignore an absent directory.
    """
    source = get_upload_dir() / book_id / "audiobook"
    if not source.exists():
        return
    target = book_dir / "audiobook"
    shutil.copytree(source, target)


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
        assets_meta.append(
            {
                "id": asset.id,
                "filename": asset.filename,
                "asset_type": asset.asset_type,
                "path": asset.path,
            }
        )
        src = Path(asset.path)
        if src.exists():
            shutil.copy2(src, assets_dir / asset.filename)
    _write_json(book_dir / "assets.json", assets_meta)


def _write_manifest(
    backup_dir: Path,
    *,
    book_count: int,
    article_count: int,
    publication_count: int,
    article_asset_count: int,
    include_audiobook: bool = False,
) -> None:
    """Write the backup manifest. Version 2.0 carries the article
    facets; readers that only know 1.0 still read ``book_count`` and
    ``includes_audiobook`` so legacy tooling does not break.
    """
    _write_json(
        backup_dir / "manifest.json",
        {
            "format": "bibliogon-backup",
            "version": "2.0",
            "created_at": datetime.now(UTC).isoformat(),
            "book_count": book_count,
            "article_count": article_count,
            "publication_count": publication_count,
            "article_asset_count": article_asset_count,
            "includes_audiobook": include_audiobook,
        },
    )


def _build_bgb_archive(backup_dir: Path) -> Path:
    """ZIP the backup directory and rename .zip -> .bgb."""
    zip_path = shutil.make_archive(str(backup_dir), "zip", str(backup_dir))
    bgb_path = Path(zip_path.replace(".zip", ".bgb"))
    Path(zip_path).rename(bgb_path)
    return bgb_path


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
