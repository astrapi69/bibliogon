"""Asset import and cover selection for project imports.

Split out of ``project_import`` (God-file split #1, 2026-06-14). Holds the
asset concern: importing image files for a book, rewriting their src paths to
the asset API, and choosing a cover image. The backfill helper ``backfill_cover``
in ``project_import`` reuses :func:`_maybe_set_cover_from_assets`.
"""

from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Asset, Book
from app.services.backup.asset_utils import import_assets, rewrite_image_paths


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
        db.query(Asset)
        .filter(Asset.book_id == book.id, Asset.asset_type == "cover")
        .order_by(Asset.filename)
        .first()
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
