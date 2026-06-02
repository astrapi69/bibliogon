"""Build a .bgb full-data backup archive.

BACKUP-COMPLETENESS-01 (v3.0): the archive carries EVERY per-book and
per-article child model plus the global content (authors + templates),
so a backup -> restore cycle preserves the entire database. The two
exceptions are deliberate and documented in ``_write_book_dir`` /
``export_backup_archive``: the ``AudioVoice`` cache (re-synced from
edge-TTS at startup) and ``GitSyncMapping`` (machine-local clone path).
"""

import json
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.backup_history import BackupHistory
from app.models import (
    ArcReviewer,
    Article,
    ArticleAsset,
    ArticleComment,
    ArticleImportSource,
    Asset,
    Author,
    Book,
    BookImportSource,
    BookPublishingState,
    BookTemplate,
    Chapter,
    ChapterLabel,
    ChapterTemplate,
    ChapterVersion,
    ComicBubble,
    ComicPanel,
    Page,
    Publication,
    StoryEntity,
    StoryEntityPageLink,
    WritingSession,
)
from app.paths import get_upload_dir
from app.services.backup.serializer import (
    serialize_article_asset_for_backup,
    serialize_article_for_backup,
    serialize_book_for_backup,
    serialize_publication_for_backup,
    serialize_row,
)

_history = BackupHistory()


def export_backup_archive(db: Session, include_audiobook: bool = False) -> tuple[Path, str]:
    """Export the whole database as a single .bgb archive.

    Args:
        db: SQLAlchemy session.
        include_audiobook: When true, also bundle the persisted
            ``uploads/{book_id}/audiobook/`` directories. Off by default
            because audiobook MP3s blow up the backup size by hundreds
            of megabytes; the user opts in via a checkbox in the UI.

    Returns the path to the .bgb file and the suggested download filename.

    Manifest contract:
        - ``version: "3.0"`` adds every per-book/per-article child model
          + a ``globals/`` segment (authors + templates).
        - ``version: "2.0"`` carried an ``articles/`` segment.
        - ``version: "1.0"`` (legacy) had only ``books/``.
        The restore side reads all three forms so old backups keep working.

    Intentionally NOT exported (not user content): ``AudioVoice`` (a cache
    re-synced from edge-TTS at startup) and ``GitSyncMapping`` (machine-local
    clone path the git-sync plugin re-establishes).
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

    _write_globals(db, backup_dir / "globals")

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
    """Write one book.json + all per-book child models + assets to ``book_dir``."""
    book_dir.mkdir(parents=True)
    _write_json(book_dir / "book.json", serialize_book_for_backup(book))
    _write_chapters(book_dir / "chapters", book.chapters)
    _write_assets(db, book.id, book_dir)
    _write_book_children(db, book.id, book_dir)
    if include_audiobook:
        _write_audiobook(book.id, book_dir)


def _write_book_children(db: Session, book_id: str, book_dir: Path) -> None:
    """Write every non-chapter, non-asset per-book child model (v3.0).

    Each is a flat ``<name>.json`` list of full-column row dicts, written
    only when non-empty. Comic panels/bubbles are reached through the
    book's pages; story-entity links through its entities.
    """
    chapter_ids = [c.id for c in db.query(Chapter.id).filter(Chapter.book_id == book_id)]
    page_ids = [p.id for p in db.query(Page.id).filter(Page.book_id == book_id)]
    panel_ids = (
        [p.id for p in db.query(ComicPanel.id).filter(ComicPanel.page_id.in_(page_ids))]
        if page_ids
        else []
    )
    entity_ids = [e.id for e in db.query(StoryEntity.id).filter(StoryEntity.book_id == book_id)]
    state_ids = [
        s.id
        for s in db.query(BookPublishingState.id).filter(BookPublishingState.book_id == book_id)
    ]

    sections: dict[str, list[Any]] = {
        "import_source.json": db.query(BookImportSource)
        .filter(BookImportSource.book_id == book_id)
        .all(),
        "chapter_labels.json": db.query(ChapterLabel).filter(ChapterLabel.book_id == book_id).all(),
        "chapter_versions.json": (
            db.query(ChapterVersion).filter(ChapterVersion.chapter_id.in_(chapter_ids)).all()
            if chapter_ids
            else []
        ),
        "writing_sessions.json": db.query(WritingSession)
        .filter(WritingSession.book_id == book_id)
        .all(),
        "pages.json": db.query(Page).filter(Page.book_id == book_id).all(),
        "comic_panels.json": (
            db.query(ComicPanel).filter(ComicPanel.page_id.in_(page_ids)).all() if page_ids else []
        ),
        "comic_bubbles.json": (
            db.query(ComicBubble).filter(ComicBubble.panel_id.in_(panel_ids)).all()
            if panel_ids
            else []
        ),
        "story_entities.json": db.query(StoryEntity).filter(StoryEntity.book_id == book_id).all(),
        "story_entity_page_links.json": (
            db.query(StoryEntityPageLink)
            .filter(StoryEntityPageLink.entity_id.in_(entity_ids))
            .all()
            if entity_ids
            else []
        ),
        "publishing_state.json": db.query(BookPublishingState)
        .filter(BookPublishingState.book_id == book_id)
        .all(),
        "arc_reviewers.json": (
            db.query(ArcReviewer).filter(ArcReviewer.publishing_state_id.in_(state_ids)).all()
            if state_ids
            else []
        ),
    }
    for filename, rows in sections.items():
        if rows:
            _write_json(book_dir / filename, [serialize_row(r) for r in rows])


def _write_article_dir(
    db: Session,
    article: Article,
    article_dir: Path,
) -> tuple[int, int]:
    """Write ``article.json`` + import_source + publications + comments +
    assets to ``article_dir``. Returns (publication_count, asset_count).

    Soft-deleted articles round-trip with their ``deleted_at`` field.
    """
    article_dir.mkdir(parents=True)
    _write_json(article_dir / "article.json", serialize_article_for_backup(article))

    import_source = (
        db.query(ArticleImportSource).filter(ArticleImportSource.article_id == article.id).first()
    )
    if import_source is not None:
        _write_json(article_dir / "import_source.json", serialize_row(import_source))

    publications = db.query(Publication).filter(Publication.article_id == article.id).all()
    if publications:
        _write_json(
            article_dir / "publications.json",
            [serialize_publication_for_backup(p) for p in publications],
        )

    comments = (
        db.query(ArticleComment).filter(ArticleComment.responds_to_article_id == article.id).all()
    )
    if comments:
        _write_json(article_dir / "comments.json", [serialize_row(c) for c in comments])

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


def _write_globals(db: Session, globals_dir: Path) -> None:
    """Write global (non per-book/article) user content: authors,
    book templates (+ their chapters), chapter templates, and any
    orphaned comments (comments whose article link is NULL).
    """
    authors = db.query(Author).all()
    book_templates = db.query(BookTemplate).options(joinedload(BookTemplate.chapters)).all()
    chapter_templates = db.query(ChapterTemplate).all()
    orphan_comments = (
        db.query(ArticleComment).filter(ArticleComment.responds_to_article_id.is_(None)).all()
    )

    if not (authors or book_templates or chapter_templates or orphan_comments):
        return
    globals_dir.mkdir(parents=True)

    if authors:
        _write_json(globals_dir / "authors.json", [serialize_row(a) for a in authors])
    if book_templates:
        _write_json(
            globals_dir / "book_templates.json",
            [
                {**serialize_row(t), "chapters": [serialize_row(c) for c in t.chapters]}
                for t in book_templates
            ],
        )
    if chapter_templates:
        _write_json(
            globals_dir / "chapter_templates.json",
            [serialize_row(t) for t in chapter_templates],
        )
    if orphan_comments:
        _write_json(
            globals_dir / "orphan_comments.json",
            [serialize_row(c) for c in orphan_comments],
        )


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
        _write_json(chapters_dir / f"{chapter.id}.json", serialize_row(chapter))


def _write_assets(db: Session, book_id: str, book_dir: Path) -> None:
    """Copy asset files and write assets.json next to them. Skipped if no assets."""
    assets = db.query(Asset).filter(Asset.book_id == book_id).all()
    if not assets:
        return

    assets_dir = book_dir / "assets"
    assets_dir.mkdir()
    _write_json(book_dir / "assets.json", [serialize_row(a) for a in assets])
    for asset in assets:
        src = Path(asset.path)
        if src.exists():
            shutil.copy2(src, assets_dir / asset.filename)


def _write_manifest(
    backup_dir: Path,
    *,
    book_count: int,
    article_count: int,
    publication_count: int,
    article_asset_count: int,
    include_audiobook: bool = False,
) -> None:
    """Write the backup manifest. Version 3.0 carries the full per-book/
    per-article child graph + globals; readers that only know 1.0/2.0
    still read ``book_count`` / ``article_count`` and ignore the rest.
    """
    _write_json(
        backup_dir / "manifest.json",
        {
            "format": "bibliogon-backup",
            "version": "3.0",
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
