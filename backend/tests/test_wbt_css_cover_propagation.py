"""Repro for user-reported CSS + cover propagation bug.

Scenario: import real WBT ZIP (das-erwachen-der-waechter
shape). Step 2 Summary shows CSS + cover detected. Step 3
Preview shows neither. After import, book.custom_css is None
and book.cover_image doesn't populate the dashboard thumbnail.

Previous fix (partial-extraction sentinel) did not address
this. Debug-first: trace detect -> preview data -> execute ->
Book row -> filesystem.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app.import_plugins.handlers.wbt import WbtImportHandler
from app.models import Asset, Book
from app.routers.assets import UPLOAD_DIR


def _broken_shape_zip(tmp_dir: Path) -> Path:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "das-erwachen/config/metadata.yaml",
            "title: Das Erwachen\nauthor: Draven Quantum\nlang: de\n",
        )
        zf.writestr(
            "das-erwachen/config/styles.css",
            "body { color: black; font-family: serif; }\n",
        )
        zf.writestr(
            "das-erwachen/config/character-profile/aida-ramic.md",
            "# Aida\n\nNotes.\n",
        )
        # Cover at canonical location.
        zf.writestr(
            "das-erwachen/assets/covers/cover.png",
            b"\x89PNG\r\n\x1a\n" + b"\x00" * 16,
        )
        # Stray top-level images.
        for i in range(1, 4):
            zf.writestr(
                f"das-erwachen/assets/chapter_{i:02d}_scene.jpg",
                b"\xff\xd8\xff\xe0",
            )
        zf.writestr(
            "das-erwachen/assets/image_prompts.json",
            '[{"c": 1}]',
        )
        zf.writestr("das-erwachen/assets/author/portrait.png", b"\x89PNG")
        zf.writestr(
            "das-erwachen/manuscript/chapters/01-flimmern.md",
            "# Flimmern\n\nDer Anfang.\n",
        )
    path = tmp_dir / "broken.zip"
    path.write_bytes(buf.getvalue())
    return path


def test_detect_populates_custom_css_field(tmp_path: Path) -> None:
    zip_path = _broken_shape_zip(tmp_path)
    detected = WbtImportHandler().detect(str(zip_path))
    assert detected.custom_css is not None, (
        "DetectedProject.custom_css must carry CSS content so the "
        "wizard's PreviewPanel can show it."
    )
    assert "color: black" in detected.custom_css


def test_detect_populates_cover_image_field(tmp_path: Path) -> None:
    """DetectedProject.cover_image should name the cover file so the
    preview + downstream code can resolve it. The Summary step reads
    from detected.assets (which works) but the Preview and post-import
    code paths need the scalar field too."""
    zip_path = _broken_shape_zip(tmp_path)
    detected = WbtImportHandler().detect(str(zip_path))
    # Either the scalar cover_image is set, or the assets list has a
    # cover entry - assert at least one of these is true, then tighten
    # the assertion once we know which is broken.
    cover_assets = [a for a in detected.assets if a.purpose == "cover"]
    assert cover_assets, "cover asset missing from detected.assets"
    # Scalar cover_image: may or may not be populated depending on
    # whether metadata.yaml names a cover-image key.
    print(f"detected.cover_image = {detected.cover_image!r}")


def test_execute_persists_custom_css_to_book_row(tmp_path: Path) -> None:
    Base.metadata.create_all(bind=engine)
    zip_path = _broken_shape_zip(tmp_path)
    handler = WbtImportHandler()
    detected = handler.detect(str(zip_path))
    book_id = handler.execute(
        str(zip_path), detected, overrides={}, duplicate_action="create"
    )
    with SessionLocal() as session:
        book = session.query(Book).filter(Book.id == book_id).one()
        assert "color: black" in (book.custom_css or "")


def test_execute_persists_cover_image_to_book_row(
    tmp_path: Path, monkeypatch
) -> None:
    """book.cover_image must populate so the dashboard can render the
    thumbnail. If assets import path copies the cover but never sets
    the column, this test fails."""
    monkeypatch.setattr(
        "app.routers.assets.UPLOAD_DIR", tmp_path / "uploads"
    )
    # Also patch at the asset_utils import site if it re-imports.
    Base.metadata.create_all(bind=engine)
    zip_path = _broken_shape_zip(tmp_path)
    handler = WbtImportHandler()
    detected = handler.detect(str(zip_path))
    book_id = handler.execute(
        str(zip_path), detected, overrides={}, duplicate_action="create"
    )
    with SessionLocal() as session:
        book = session.query(Book).filter(Book.id == book_id).one()
        cover_assets = (
            session.query(Asset)
            .filter(Asset.book_id == book_id, Asset.asset_type == "cover")
            .all()
        )
        print(f"book.cover_image = {book.cover_image!r}")
        print(f"cover assets = {[a.path for a in cover_assets]}")
        assert book.cover_image is not None, (
            f"book.cover_image is None even though {len(cover_assets)} "
            "cover asset(s) imported"
        )


def test_stale_cover_image_override_does_not_clobber_upload_path(
    tmp_path: Path, monkeypatch
) -> None:
    """Regression for the das-erwachen-der-waechter bug: metadata.yaml
    names a cover file that DOES NOT exist in the ZIP (e.g.
    ``cover_image: "assets/covers/das_erwachen_der_waechter.jpg"``)
    while the actual file is ``assets/covers/cover.png``.

    Pre-fix the wizard emitted this stale hint as a per-field override.
    ``apply_book_overrides`` then set ``book.cover_image`` to the
    dangling hint, overwriting the valid uploads/<id>/cover/<file>
    path that ``_maybe_set_cover_from_assets`` had written.

    The fix lives on the frontend: PreviewPanel force-sets
    ``cover_image`` include=false so it is NEVER emitted in overrides.
    This test pins the backend contract: when overrides do NOT contain
    cover_image, the handler's post-import path survives.
    """
    monkeypatch.setattr(
        "app.routers.assets.UPLOAD_DIR", tmp_path / "uploads"
    )
    Base.metadata.create_all(bind=engine)
    zip_path = _broken_shape_zip(tmp_path)
    handler = WbtImportHandler()
    detected = handler.detect(str(zip_path))
    # Wizard emits everything EXCEPT cover_image.
    overrides = {
        "title": "Das Erwachen",
        "author": "Draven Quantum",
        "language": "de",
    }
    book_id = handler.execute(
        str(zip_path), detected, overrides=overrides, duplicate_action="create"
    )
    with SessionLocal() as session:
        book = session.query(Book).filter(Book.id == book_id).one()
        # Path is the full uploads path, not a dangling basename.
        assert book.cover_image is not None
        assert "cover.png" in book.cover_image
        # cover.png is the actual file basename.
        basename = book.cover_image.rsplit("/", 1)[-1]
        assert basename == "cover.png"
