"""Handler-level audit for WBT metadata propagation (Bugs 2 + 3).

User reported after a manual smoke test:
- subtitle not imported
- CSS / back-cover description / author bio not visible

These tests pin where in the chain each field actually lands.
Driven at the handler layer (not through TestClient) to keep
the module out of the lifespan-accumulation path that has been
causing RecursionError regressions when too many orchestrator-
integration test modules are added. Handler-level coverage is
the right scope here: persistence lives in
``_import_project_root`` + ``_build_book``, not in routing.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest

from app.database import Base, SessionLocal, engine
from app.import_plugins.handlers.wbt import WbtImportHandler
from app.models import Book


@pytest.fixture(autouse=True)
def _fresh_schema() -> None:
    """Tables live on the shared in-memory SQLite. The autouse
    setup_db in conftest also does this per-test, but this module's
    handler calls open their own SessionLocal (not via TestClient
    lifespan), so mirroring the pattern keeps the module self-
    contained if run in isolation."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _wbt_zip_with_all_metadata(tmp_dir: Path) -> Path:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "book/config/metadata.yaml",
            "title: Full Metadata Book\n"
            "subtitle: A Subtitle Appears\n"
            "author: Test Author\n"
            "lang: en\n"
            "publisher: Test Press\n",
        )
        zf.writestr(
            "book/config/book-description.html",
            "<p>Promotional HTML description.</p>",
        )
        zf.writestr(
            "book/config/cover-back-page-description.md",
            "Compelling back-cover teaser.",
        )
        # Filename convention shipped by project_import.py:
        # cover-back-page-author-introduction.md.
        zf.writestr(
            "book/config/cover-back-page-author-introduction.md",
            "Short author bio paragraph.",
        )
        zf.writestr("book/config/styles.css", "body { color: red; }\n")
        zf.writestr(
            "book/manuscript/chapters/01-ch.md", "# Chapter 1\n\nBody.\n"
        )
    path = tmp_dir / "book.zip"
    path.write_bytes(buf.getvalue())
    return path


def _wbt_zip_sparse(tmp_dir: Path) -> Path:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "book/config/metadata.yaml",
            "title: Sparse Book\nauthor: T\nlang: en\n",
        )
        zf.writestr(
            "book/manuscript/chapters/01-ch.md", "# C1\n\nBody.\n"
        )
    path = tmp_dir / "sparse.zip"
    path.write_bytes(buf.getvalue())
    return path


def _execute_and_read_book(zip_path: Path) -> Book:
    handler = WbtImportHandler()
    detected = handler.detect(str(zip_path))
    book_id = handler.execute(
        str(zip_path),
        detected,
        overrides={},
        duplicate_action="create",
    )
    with SessionLocal() as session:
        book = session.query(Book).filter(Book.id == book_id).first()
        assert book is not None
        # Force all columns to load before the session closes.
        session.expunge(book)
        return book


# --- persistence (Bug 2 / 3 are NOT persistence bugs; these pin that) ---


def test_subtitle_lands_on_book_row(tmp_path: Path) -> None:
    book = _execute_and_read_book(_wbt_zip_with_all_metadata(tmp_path))
    assert book.subtitle == "A Subtitle Appears"


def test_html_description_lands_on_book_row(tmp_path: Path) -> None:
    book = _execute_and_read_book(_wbt_zip_with_all_metadata(tmp_path))
    assert "Promotional HTML description" in (book.html_description or "")


def test_backpage_description_lands_on_book_row(tmp_path: Path) -> None:
    book = _execute_and_read_book(_wbt_zip_with_all_metadata(tmp_path))
    assert "Compelling back-cover teaser" in (book.backpage_description or "")


def test_backpage_author_bio_lands_on_book_row(tmp_path: Path) -> None:
    book = _execute_and_read_book(_wbt_zip_with_all_metadata(tmp_path))
    assert "Short author bio" in (book.backpage_author_bio or "")


def test_custom_css_lands_on_book_row(tmp_path: Path) -> None:
    book = _execute_and_read_book(_wbt_zip_with_all_metadata(tmp_path))
    assert "color: red" in (book.custom_css or "")


# --- detect / DetectedProject (the actual user-facing bug) ---


def test_detect_surfaces_subtitle_to_the_wizard(tmp_path: Path) -> None:
    """DetectedProject.subtitle is populated so the preview panel
    can show it before import. Closes Bug 2."""
    zip_path = _wbt_zip_with_all_metadata(tmp_path)
    detected = WbtImportHandler().detect(str(zip_path))
    assert detected.subtitle == "A Subtitle Appears"


def test_detect_surfaces_has_flags_for_long_form_metadata(
    tmp_path: Path,
) -> None:
    """Long-form fields (HTML description, back-cover, CSS) are too
    big to render in the modal; the preview panel renders a badge
    per non-empty field based on these booleans. Closes Bug 3."""
    zip_path = _wbt_zip_with_all_metadata(tmp_path)
    detected = WbtImportHandler().detect(str(zip_path))
    assert detected.has_html_description is True
    assert detected.has_backpage_description is True
    assert detected.has_backpage_author_bio is True
    assert detected.has_custom_css is True


def test_detect_flags_absent_fields_as_false(tmp_path: Path) -> None:
    """When the WBT project has no back-cover / CSS, the has_*
    flags stay False so the preview does not render stale badges."""
    zip_path = _wbt_zip_sparse(tmp_path)
    detected = WbtImportHandler().detect(str(zip_path))
    assert detected.subtitle is None
    assert detected.has_html_description is False
    assert detected.has_backpage_description is False
    assert detected.has_backpage_author_bio is False
    assert detected.has_custom_css is False


def test_detect_defaults_are_safe_on_bare_model() -> None:
    """DetectedProject added four has_* booleans; check they default
    False so existing callers (bgb, markdown, office handlers) stay
    green without a source change."""
    from app.import_plugins.protocol import DetectedProject

    project = DetectedProject(
        format_name="bgb", source_identifier="sha256:abc"
    )
    assert project.subtitle is None
    assert project.has_html_description is False
    assert project.has_backpage_description is False
    assert project.has_backpage_author_bio is False
    assert project.has_custom_css is False
