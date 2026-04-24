"""Helpers for importing a write-book-template project tree.

CIO-05 removed the UploadFile-based ``import_project_zip`` entry point
(it was only used by the legacy ``/api/backup/import-project`` +
``/api/backup/smart-import`` routes). Remaining helpers are consumed
by ``app.import_plugins.handlers.wbt.WbtImportHandler`` which runs
inside the CIO-01 orchestrator.
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.models import Asset, Book, Chapter, ChapterType
from app.services.backup.asset_utils import import_assets, rewrite_image_paths
from app.services.backup.markdown_utils import (
    ALL_SPECIAL_MAP,
    BACK_MATTER_MAP,
    FRONT_MATTER_MAP,
    detect_chapter_type,
    extract_title,
    import_special_chapters,
    md_to_html,
    read_file_if_exists,
    sanitize_import_markdown,
)

# --- Public entry point used by WbtImportHandler (CIO-02) -------------


def _import_project_root(db: Session, project_root: Path) -> dict[str, Any]:
    """Orchestrate metadata parsing, book creation, chapter and asset import."""
    metadata = _read_metadata_yaml(project_root / "config" / "metadata.yaml")
    project_meta = _parse_project_metadata(metadata, project_root)
    section_order = _read_section_order(project_root / "config" / "export-settings.yaml")

    book = _build_book(project_meta)
    db.add(book)
    db.flush()

    total_count = _import_chapters(
        db, book.id, project_root / "manuscript", section_order, book.language
    )
    asset_count = _import_project_assets(db, book.id, project_root / "assets")
    _maybe_set_cover_from_assets(db, book)

    db.commit()
    db.refresh(book)
    return {
        "book_id": book.id,
        "title": book.title,
        "chapter_count": total_count,
        "asset_count": asset_count,
    }


# --- Metadata parsing ---


@dataclass
class ProjectMetadata:
    """All fields needed to construct a Book from a write-book-template project."""

    title: str
    subtitle: str | None = None
    author: str = "Unknown"
    language: str = "de"
    series_name: str | None = None
    series_index: int | None = None
    description: str | None = None
    edition: str | None = None
    publisher: str | None = None
    publisher_city: str | None = None
    publish_date: str | None = None
    isbn_ebook: str | None = None
    isbn_paperback: str | None = None
    isbn_hardcover: str | None = None
    asin_ebook: str | None = None
    asin_paperback: str | None = None
    asin_hardcover: str | None = None
    keywords: str | None = None
    html_description: str | None = None
    backpage_description: str | None = None
    backpage_author_bio: str | None = None
    cover_image: str | None = None
    custom_css: str | None = None
    extras: dict[str, Any] = field(default_factory=dict)


def _read_metadata_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        # Project exports wrap metadata.yaml in Pandoc-style
        # `---` / `---` document markers, producing a stream of one
        # real document followed by an empty trailing document. Use
        # safe_load_all and pick the first non-empty document so both
        # shapes (bare + Pandoc-wrapped) work.
        for document in yaml.safe_load_all(f):
            if document:
                return document if isinstance(document, dict) else {}
    return {}


def _parse_project_metadata(metadata: dict[str, Any], project_root: Path) -> ProjectMetadata:
    """Convert a parsed metadata.yaml dict into a typed ProjectMetadata."""
    series_name, series_idx = _parse_series(metadata)
    isbn_ebook, isbn_pb, isbn_hc = _parse_isbn(metadata)
    asin_ebook, asin_pb, asin_hc = _parse_asin(metadata)

    config_dir = project_root / "config"
    return ProjectMetadata(
        title=metadata.get("title", project_root.name),
        subtitle=metadata.get("subtitle"),
        author=metadata.get("author", "Unknown"),
        language=_normalize_language(metadata.get("lang", metadata.get("language", "de"))),
        series_name=series_name,
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
        asin_paperback=asin_pb,
        asin_hardcover=asin_hc,
        keywords=_parse_keywords(metadata),
        html_description=read_file_if_exists(config_dir / "book-description.html"),
        backpage_description=read_file_if_exists(config_dir / "cover-back-page-description.md"),
        backpage_author_bio=read_file_if_exists(
            config_dir / "cover-back-page-author-introduction.md"
        ),
        # write-book-template / Pandoc ship this under the hyphenated
        # ``cover-image`` key; older Bibliogon exports and custom YAMLs
        # use the snake_case variant. Accept both plus a plain ``cover``
        # fallback so a metadata.yaml written by hand still lands a cover.
        cover_image=(
            metadata.get("cover-image")
            or metadata.get("cover_image")
            or metadata.get("cover")
        ),
        custom_css=_read_custom_css(config_dir, project_root),
    )


def _read_custom_css(config_dir: Path, project_root: Path) -> str | None:
    """Find a user-provided stylesheet anywhere in the project.

    Strategy (first non-empty file wins):

    1. List every file in ``config/`` and pick the first ``*.css``.
       write-book-template projects in the wild name this file in
       every possible way (``styles.css``, ``style.css``, ``custom.css``,
       ``book.css``, language-specific like ``styles-de.css``, and
       translated names such as ``stile.css``). A directory listing
       catches every one; the old hardcoded filename list missed them
       one by one.
    2. List ``assets/css/`` and ``assets/styles/`` the same way.
    3. Fall back to ``rglob("*.css")`` anywhere under ``project_root``
       (excluding ``node_modules``, ``__MACOSX``, ``.git``).

    Returns the content of the first match, or ``None`` if nothing
    turns up.
    """
    listed: list[str] = []

    for directory in (config_dir, project_root / "assets" / "css", project_root / "assets" / "styles"):
        if not directory.is_dir():
            continue
        for entry in sorted(directory.iterdir()):
            if entry.is_file() and entry.suffix.lower() == ".css":
                listed.append(str(entry))
                content = read_file_if_exists(entry)
                if content:
                    logger.warning("custom_css: picked directory scan %s", entry)
                    return content

    for css_path in sorted(project_root.rglob("*.css")):
        if any(
            segment in css_path.parts
            for segment in ("node_modules", "__MACOSX", ".git")
        ):
            continue
        listed.append(str(css_path))
        content = read_file_if_exists(css_path)
        if content:
            logger.warning("custom_css: picked rglob fallback %s", css_path)
            return content

    logger.warning(
        "custom_css: NO stylesheet for import. project_root=%s listed=%s",
        project_root,
        listed,
    )
    return None


def _normalize_language(lang: Any) -> str:
    """``en-US`` -> ``en``; pass-through for already short codes."""
    s = str(lang)
    return s.split("-")[0] if "-" in s else s


def _parse_series(metadata: dict[str, Any]) -> tuple[str | None, int | None]:
    series_raw = metadata.get("series")
    if isinstance(series_raw, dict):
        return series_raw.get("title"), series_raw.get("volume")
    if isinstance(series_raw, str):
        return series_raw, metadata.get("series_index")
    return None, None


def _parse_isbn(metadata: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """Supports both ``isbn.{ebook,paperback,hardcover}`` and ``identifiers.isbn_*``."""
    isbn_raw = metadata.get("isbn", {})
    identifiers = metadata.get("identifiers", {})

    def pick(key: str, fallback_key: str) -> str | None:
        primary = isbn_raw.get(key) if isinstance(isbn_raw, dict) else None
        return primary or identifiers.get(fallback_key) or None

    return (
        pick("ebook", "isbn_ebook"),
        pick("paperback", "isbn_paperback"),
        pick("hardcover", "isbn_hardcover"),
    )


def _parse_asin(metadata: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    asin_raw = metadata.get("asin", {})
    if not isinstance(asin_raw, dict):
        return None, None, None
    return asin_raw.get("ebook"), asin_raw.get("paperback"), asin_raw.get("hardcover")


def _parse_keywords(metadata: dict[str, Any]) -> str | None:
    keywords_raw = metadata.get("keywords", [])
    if isinstance(keywords_raw, list) and keywords_raw:
        return json.dumps(keywords_raw)
    return None


def _read_section_order(path: Path) -> list[str]:
    """Read ``section_order.ebook`` (or ``.paperback``) from export-settings.yaml."""
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        export_settings = yaml.safe_load(f) or {}
    so = export_settings.get("section_order", {})
    section_order = so.get("ebook", so.get("paperback", []))
    return section_order if isinstance(section_order, list) else []


def _build_book(meta: ProjectMetadata) -> Book:
    return Book(
        title=meta.title,
        subtitle=meta.subtitle,
        author=meta.author,
        language=meta.language,
        series=meta.series_name,
        series_index=meta.series_index,
        description=meta.description,
        edition=meta.edition,
        publisher=meta.publisher,
        publisher_city=meta.publisher_city,
        publish_date=meta.publish_date,
        isbn_ebook=meta.isbn_ebook,
        isbn_paperback=meta.isbn_paperback,
        isbn_hardcover=meta.isbn_hardcover,
        asin_ebook=meta.asin_ebook,
        asin_paperback=meta.asin_paperback,
        asin_hardcover=meta.asin_hardcover,
        keywords=meta.keywords,
        html_description=meta.html_description,
        backpage_description=meta.backpage_description,
        backpage_author_bio=meta.backpage_author_bio,
        cover_image=meta.cover_image,
        custom_css=meta.custom_css,
    )


# --- Chapter import ---


def _import_chapters(
    db: Session,
    book_id: str,
    manuscript_dir: Path,
    section_order: list[str],
    language: str = "de",
) -> int:
    """Pick the section-order or fallback layout based on what's available."""
    if section_order:
        return import_with_section_order(db, book_id, manuscript_dir, section_order, language)
    return _import_alphabetical_layout(db, book_id, manuscript_dir, language)


def _import_alphabetical_layout(
    db: Session,
    book_id: str,
    manuscript_dir: Path,
    language: str = "de",
) -> int:
    """Fallback when no export-settings.yaml exists: scan front/chapters/back."""
    front_dir = manuscript_dir / "front-matter"
    chapters_dir = manuscript_dir / "chapters"
    back_dir = manuscript_dir / "back-matter"

    total = 0
    if front_dir.exists():
        total += import_special_chapters(
            db, book_id, front_dir, FRONT_MATTER_MAP, base_position=0, language=language
        )
    if chapters_dir.exists():
        total += _import_main_chapters(
            db, book_id, chapters_dir, start_position=100, language=language
        )
    if back_dir.exists():
        total += import_special_chapters(
            db, book_id, back_dir, BACK_MATTER_MAP, base_position=900, language=language
        )
    return total


def _import_main_chapters(
    db: Session,
    book_id: str,
    chapters_dir: Path,
    start_position: int,
    language: str = "de",
) -> int:
    """Import all .md files in ``chapters_dir`` (skips ``*-print.md`` variants)."""
    count = 0
    position = start_position
    for md_file in sorted(chapters_dir.glob("*.md")):
        if md_file.stem.endswith("-print"):
            continue
        _add_chapter_from_file(db, book_id, md_file, position, language=language)
        position += 1
        count += 1
    return count


def import_with_section_order(
    db: Session,
    book_id: str,
    manuscript_dir: Path,
    section_order: list[str],
    language: str = "de",
) -> int:
    """Import chapters in the order specified by export-settings.yaml.

    Section order entries look like::

        - front-matter/toc.md
        - front-matter/preface.md
        - chapters                    (placeholder: all chapter files)
        - back-matter/epilogue.md

    Files in front/back-matter directories that aren't listed but match a
    known type still get imported at the end (preserves the old behavior).
    """
    state = _SectionOrderState(position=0, count=0)

    for entry in section_order:
        entry = entry.strip()
        if entry == "chapters":
            _import_chapter_placeholder(db, book_id, manuscript_dir / "chapters", state, language)
        else:
            _import_section_order_file(db, book_id, manuscript_dir / entry, state, language)

    _import_remaining_special_files(db, book_id, manuscript_dir, state, language)
    return state.count


@dataclass
class _SectionOrderState:
    position: int
    count: int
    imported_files: set[str] = field(default_factory=set)


def _import_chapter_placeholder(
    db: Session,
    book_id: str,
    chapters_dir: Path,
    state: _SectionOrderState,
    language: str = "de",
) -> None:
    if not chapters_dir.exists():
        return
    for md_file in sorted(chapters_dir.glob("*.md")):
        if md_file.stem.endswith("-print"):
            continue
        chapter_type = detect_chapter_type(md_file.stem)
        _add_chapter_from_file(db, book_id, md_file, state.position, chapter_type, language)
        state.position += 1
        state.count += 1


def _import_section_order_file(
    db: Session,
    book_id: str,
    md_path: Path,
    state: _SectionOrderState,
    language: str = "de",
) -> None:
    if not md_path.exists() or md_path.stem.endswith("-print"):
        return
    stem = md_path.stem.lower()
    if stem in state.imported_files:
        return
    state.imported_files.add(stem)

    chapter_type = ALL_SPECIAL_MAP.get(stem, ChapterType.CHAPTER)
    _add_chapter_from_file(db, book_id, md_path, state.position, chapter_type, language)
    state.position += 1
    state.count += 1


def _import_remaining_special_files(
    db: Session,
    book_id: str,
    manuscript_dir: Path,
    state: _SectionOrderState,
    language: str = "de",
) -> None:
    """Catch typed front/back-matter files that the section_order missed."""
    for subdir, type_map in (
        (manuscript_dir / "front-matter", FRONT_MATTER_MAP),
        (manuscript_dir / "back-matter", BACK_MATTER_MAP),
    ):
        if not subdir.exists():
            continue
        for md_file in sorted(subdir.glob("*.md")):
            stem = md_file.stem.lower()
            if stem.endswith("-print") or stem in state.imported_files:
                continue
            chapter_type = type_map.get(stem)
            if not chapter_type:
                continue
            state.imported_files.add(stem)
            _add_chapter_from_file(db, book_id, md_file, state.position, chapter_type, language)
            state.position += 1
            state.count += 1


def _add_chapter_from_file(
    db: Session,
    book_id: str,
    md_file: Path,
    position: int,
    chapter_type: ChapterType | None = None,
    language: str = "de",
) -> None:
    """Read a markdown file and add it as a Chapter row.

    When ``chapter_type`` is omitted, ``detect_chapter_type`` decides from the
    filename stem (used by the alphabetical-fallback layout).
    """
    content = md_file.read_text(encoding="utf-8")
    title = extract_title(content, md_file.stem)
    resolved_type = chapter_type or detect_chapter_type(md_file.stem)
    sanitized = sanitize_import_markdown(content.strip(), language)
    db.add(
        Chapter(
            book_id=book_id,
            title=title,
            content=md_to_html(sanitized),
            position=position,
            chapter_type=resolved_type.value,
        )
    )


# --- Asset import ---


def _import_project_assets(db: Session, book_id: str, assets_dir: Path) -> int:
    """Import images and rewrite image src paths to the asset API."""
    if not assets_dir.exists():
        return 0
    count = import_assets(db, book_id, assets_dir)
    if count > 0:
        db.flush()
        rewrite_image_paths(db, book_id)
    return count


def _maybe_set_cover_from_assets(db: Session, book: Book) -> None:
    """Populate ``book.cover_image`` from the imported assets.

    Strategy:

    1. If ``book.cover_image`` is set AND its basename matches an
       actual imported asset filename, keep it. This is the common
       case for Bibliogon-native exports.
    2. Otherwise (or if the metadata reference is stale - a frequent
       write-book-template pattern where ``metadata.yaml`` carries a
       translated or renamed cover-image path that doesn't match the
       file in ``assets/covers/``), fall back to the first cover-typed
       asset.
    3. Last resort: any asset whose filename contains ``cover``
       (case-insensitive).

    Step 1 was previously written as an unconditional early-return
    when ``book.cover_image`` was truthy. That skipped the validation
    entirely, so imports where the metadata key named a non-existent
    file ended up with a dead cover URL and no visible cover on the
    dashboard.
    """
    db.flush()
    known_filenames = {
        f for (f,) in db.query(Asset.filename).filter(Asset.book_id == book.id).all()
    }

    if book.cover_image:
        basename = book.cover_image.rsplit("/", 1)[-1]
        if basename in known_filenames:
            return
        # Metadata cover_image points at a file that never got
        # imported; fall through and pick a real one.

    cover_asset = (
        db.query(Asset).filter(Asset.book_id == book.id, Asset.asset_type == "cover").first()
    )
    if not cover_asset:
        cover_asset = (
            db.query(Asset)
            .filter(Asset.book_id == book.id, Asset.filename.ilike("%cover%"))
            .order_by(Asset.filename)
            .first()
        )
    if cover_asset:
        book.cover_image = cover_asset.path


def backfill_custom_css_from_source(
    db: Session, book_id: str, source_project_root: Path
) -> bool:
    """Populate ``book.custom_css`` for a previously-imported book
    by re-reading a stylesheet from the original source tree.

    Use when a Book row was imported before the partial-extraction
    hazard in ``WbtImportHandler._extracted_root`` was fixed (sentinel
    marker added): the row has custom_css=NULL because a crashed or
    interrupted extraction left a partial cache that was silently
    reused on the successful second attempt.

    ``source_project_root`` must be the write-book-template project
    root on disk (the directory that contains ``config/`` and
    ``manuscript/``). The orchestrator's staging directory is cleaned
    after execute, so callers need to re-extract the source ZIP
    themselves - the easiest path is just to re-run the import.

    Returns True iff a stylesheet was found and the column changed.
    Commits on success.
    """
    book = db.query(Book).filter(Book.id == book_id).first()
    if book is None:
        return False
    # Never overwrite a book that already has CSS. The backfill path
    # is repair-only; edits the user made after the broken import
    # must not be silently undone.
    if book.custom_css and book.custom_css.strip():
        return False
    config_dir = source_project_root / "config"
    css = _read_custom_css(config_dir, source_project_root)
    if css:
        book.custom_css = css
        db.commit()
        return True
    return False


def backfill_cover(db: Session, book_id: str) -> bool:
    """Repair ``book.cover_image`` for a previously-imported book.

    Public companion to ``asset_utils.backfill_image_paths``. Use it when
    the book already has cover assets on disk and in the DB but
    ``Book.cover_image`` stayed NULL (either because the importer missed
    a Pandoc-style ``cover-image`` key or because the cover asset was
    classified as ``figure`` before commit 3e91e5f widened the map).

    Returns True iff a cover was freshly set. Commits on success.
    """
    book = db.query(Book).filter(Book.id == book_id).first()
    if book is None:
        return False
    before = book.cover_image
    _maybe_set_cover_from_assets(db, book)
    if book.cover_image and book.cover_image != before:
        db.commit()
        return True
    return False
