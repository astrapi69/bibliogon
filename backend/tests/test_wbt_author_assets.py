"""Block 2 (author assets) tests.

Files under ``assets/author/`` (or ``assets/authors/``,
``assets/about-author/``) classify as ``purpose="author-asset"``
at detect-time and ``asset_type="author-asset"`` at execute-time.
The metadata editor's Design tab (frontend follow-up) renders
them separately from chapter figures.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app.import_plugins.handlers.wbt import WbtImportHandler, _purpose_from_path
from app.models import Asset
from app.services.backup.asset_utils import _classify_asset_type


def _wbt_with_author_assets(tmp_dir: Path) -> Path:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "book/config/metadata.yaml",
            "title: Author Assets\nauthor: A\nlang: en\n",
        )
        zf.writestr(
            "book/assets/covers/cover.png", b"\x89PNG\r\n\x1a\n"
        )
        zf.writestr(
            "book/assets/author/portrait.png", b"\x89PNG\r\n\x1a\n"
        )
        zf.writestr(
            "book/assets/author/signature.png", b"\x89PNG\r\n\x1a\n"
        )
        zf.writestr("book/manuscript/chapters/01.md", "# C\n\nBody.\n")
    path = tmp_dir / "book.zip"
    path.write_bytes(buf.getvalue())
    return path


# --- detect-time purpose ---


def test_detect_classifies_assets_author_as_author_asset(
    tmp_path: Path,
) -> None:
    zip_path = _wbt_with_author_assets(tmp_path)
    detected = WbtImportHandler().detect(str(zip_path))
    author_assets = [
        a for a in detected.assets if a.purpose == "author-asset"
    ]
    filenames = sorted(a.filename for a in author_assets)
    assert filenames == ["portrait.png", "signature.png"]


def test_purpose_from_path_recognizes_author_aliases() -> None:
    """All three directory name spellings classify as author-asset."""
    assert _purpose_from_path(Path("author/portrait.png")) == "author-asset"
    assert _purpose_from_path(Path("authors/signature.png")) == "author-asset"
    assert (
        _purpose_from_path(Path("about-author/bio.png")) == "author-asset"
    )


def test_detect_still_classifies_cover_separately(tmp_path: Path) -> None:
    """Adding author-asset must not affect cover classification."""
    zip_path = _wbt_with_author_assets(tmp_path)
    detected = WbtImportHandler().detect(str(zip_path))
    covers = [a for a in detected.assets if a.purpose == "cover"]
    assert len(covers) == 1
    assert covers[0].filename == "cover.png"


# --- execute-time asset_type ---


def test_execute_persists_author_assets_as_author_asset_type(
    tmp_path: Path,
) -> None:
    Base.metadata.create_all(bind=engine)
    zip_path = _wbt_with_author_assets(tmp_path)
    handler = WbtImportHandler()
    detected = handler.detect(str(zip_path))
    book_id = handler.execute(
        str(zip_path), detected, overrides={}, duplicate_action="create"
    )
    with SessionLocal() as session:
        author_rows = (
            session.query(Asset)
            .filter(
                Asset.book_id == book_id,
                Asset.asset_type == "author-asset",
            )
            .order_by(Asset.filename)
            .all()
        )
        filenames = [a.filename for a in author_rows]
        assert filenames == ["portrait.png", "signature.png"]


def test_classify_asset_type_direct() -> None:
    """Unit-level: the shared classifier returns author-asset."""
    assert (
        _classify_asset_type(Path("author/portrait.png")) == "author-asset"
    )
    assert (
        _classify_asset_type(Path("authors/signature.png"))
        == "author-asset"
    )


def test_author_assets_do_not_leak_into_figures(tmp_path: Path) -> None:
    """Regression: prior to this change assets/author/*.png landed with
    asset_type="figure" (the _ASSET_TYPE_MAP default). Make sure figures
    query returns zero author files after the reclassification."""
    Base.metadata.create_all(bind=engine)
    zip_path = _wbt_with_author_assets(tmp_path)
    handler = WbtImportHandler()
    detected = handler.detect(str(zip_path))
    book_id = handler.execute(
        str(zip_path), detected, overrides={}, duplicate_action="create"
    )
    with SessionLocal() as session:
        figures = (
            session.query(Asset)
            .filter(
                Asset.book_id == book_id,
                Asset.asset_type == "figure",
            )
            .all()
        )
        assert not any(
            f.filename in {"portrait.png", "signature.png"}
            for f in figures
        )
