"""Import a write-book-template project tree (thin orchestrator facade).

CIO-05 removed the UploadFile-based ``import_project_zip`` entry point
(it was only used by the legacy ``/api/backup/import-project`` +
``/api/backup/smart-import`` routes). Remaining helpers are consumed
by ``app.import_plugins.handlers.wbt.WbtImportHandler`` which runs
inside the CIO-01 orchestrator.

God-file split #1 (2026-06-14) carved the concern-specific logic into
sibling modules:

- ``project_metadata_parser``  metadata YAML parsing + Book construction
- ``project_stylesheet_loader``  custom-CSS discovery
- ``project_chapter_importer``  section-order / alphabetical chapter layouts
- ``project_asset_importer``  asset import + cover selection

This module keeps the orchestration entry point (``_import_project_root``)
and the two repair helpers (``backfill_custom_css_from_source``,
``backfill_cover``), and re-exports the previously module-local symbols that
external callers and tests still import from here (``wbt``,
``translation_import``, and several ``test_*`` modules reach in by name).
"""

import logging
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import Book
from app.services.backup.project_asset_importer import (
    _import_project_assets,
    _maybe_set_cover_from_assets,
)
from app.services.backup.project_chapter_importer import (
    _import_chapters,
    _read_section_order,
    import_with_section_order,
)
from app.services.backup.project_metadata_parser import (
    ProjectMetadata,
    _build_book,
    _parse_project_metadata,
    _read_metadata_yaml,
)
from app.services.backup.project_stylesheet_loader import _read_custom_css

logger = logging.getLogger(__name__)

__all__ = [
    "ProjectMetadata",
    "_import_project_root",
    "_read_metadata_yaml",
    "_parse_project_metadata",
    "_build_book",
    "_read_custom_css",
    "_read_section_order",
    "_import_chapters",
    "import_with_section_order",
    "_import_project_assets",
    "_maybe_set_cover_from_assets",
    "backfill_custom_css_from_source",
    "backfill_cover",
]


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


# --- Repair / backfill helpers ---


def backfill_custom_css_from_source(db: Session, book_id: str, source_project_root: Path) -> bool:
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
