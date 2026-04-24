"""End-to-end audit for WBT metadata propagation (Bugs 2 + 3).

User reported after a manual smoke test:
- subtitle not imported
- CSS / back-cover description / author bio not visible

These tests pin where in the chain each field actually lands.
Ground-truth reference: run this before any fix to see which
fields reach the Book row today vs which are silently dropped.
"""

from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _wbt_zip_with_all_metadata() -> bytes:
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
        # cover-back-page-author-introduction.md (NOT author-bio.md).
        zf.writestr(
            "book/config/cover-back-page-author-introduction.md",
            "Short author bio paragraph.",
        )
        zf.writestr("book/config/styles.css", "body { color: red; }\n")
        zf.writestr(
            "book/manuscript/chapters/01-ch.md", "# Chapter 1\n\nBody.\n"
        )
    return buf.getvalue()


def _import(client: TestClient) -> dict:
    raw = _wbt_zip_with_all_metadata()
    detect = client.post(
        "/api/import/detect",
        files=[("files", ("book.zip", raw, "application/zip"))],
    )
    assert detect.status_code == 200, detect.text
    body = detect.json()
    execute = client.post(
        "/api/import/execute",
        json={
            "temp_ref": body["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert execute.status_code == 200, execute.text
    book_id = execute.json()["book_id"]
    book = client.get(f"/api/books/{book_id}").json()
    return {"detect": body["detected"], "book": book}


def test_subtitle_lands_on_book_row(client: TestClient) -> None:
    result = _import(client)
    assert result["book"]["subtitle"] == "A Subtitle Appears", (
        "project_import.py reads 'subtitle' from metadata.yaml and "
        "sets it on Book; if this fails the backend chain is broken"
    )


def test_html_description_lands_on_book_row(client: TestClient) -> None:
    result = _import(client)
    assert "Promotional HTML description" in (
        result["book"].get("html_description") or ""
    )


def test_backpage_description_lands_on_book_row(client: TestClient) -> None:
    result = _import(client)
    assert "Compelling back-cover teaser" in (
        result["book"].get("backpage_description") or ""
    )


def test_backpage_author_bio_lands_on_book_row(client: TestClient) -> None:
    result = _import(client)
    assert "Short author bio" in (
        result["book"].get("backpage_author_bio") or ""
    )


def test_custom_css_lands_on_book_row(client: TestClient) -> None:
    result = _import(client)
    assert "color: red" in (result["book"].get("custom_css") or "")


# --- DetectedProject (preview) side ---


def test_detect_surfaces_subtitle_to_the_wizard(client: TestClient) -> None:
    """DetectedProject.subtitle is populated at detect-time so the
    preview panel can show it before import. Closes Bug 2."""
    result = _import(client)
    assert result["detect"]["subtitle"] == "A Subtitle Appears"


def test_detect_surfaces_has_flags_for_long_form_metadata(
    client: TestClient,
) -> None:
    """Long-form fields (HTML description, back-cover, CSS) are too
    big to render in the modal; the preview panel renders a badge
    per non-empty field based on these booleans. Closes Bug 3."""
    result = _import(client)
    detected = result["detect"]
    assert detected["has_html_description"] is True
    assert detected["has_backpage_description"] is True
    assert detected["has_backpage_author_bio"] is True
    assert detected["has_custom_css"] is True


def test_detect_flags_absent_fields_as_false(client: TestClient) -> None:
    """When the WBT project has no back-cover / CSS, the has_*
    flags must be False so the preview does not render stale
    badges."""
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "book/config/metadata.yaml",
            "title: Sparse Book\nauthor: T\nlang: en\n",
        )
        zf.writestr(
            "book/manuscript/chapters/01-ch.md", "# C1\n\nBody.\n"
        )
    detect = client.post(
        "/api/import/detect",
        files=[("files", ("sparse.zip", buf.getvalue(), "application/zip"))],
    )
    assert detect.status_code == 200
    detected = detect.json()["detected"]
    assert detected["subtitle"] is None
    assert detected["has_html_description"] is False
    assert detected["has_backpage_description"] is False
    assert detected["has_backpage_author_bio"] is False
    assert detected["has_custom_css"] is False
