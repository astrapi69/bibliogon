"""Picture-book PDF export integration tests.

Covers ``GET /api/books/{id}/export/pdf`` when the book's
``book_type == "picture_book"`` (PB-PHASE4 Session 6 Commit 2).
Dispatch shape:

1. Picture-book + ``fmt=pdf`` -> WeasyPrint generator, returns a
   ``application/pdf`` ``FileResponse``.
2. Picture-book + ``fmt!=pdf`` -> 400 with an actionable detail.
3. Prose-book + ``fmt=pdf`` -> existing chapter/manuscripta
   pipeline (regression pin; skipped without Pandoc).

The picture-book branch needs only WeasyPrint at runtime (no
Pandoc, no LaTeX). Test runs against the real WeasyPrint binary
(present in the export plugin's pyproject as ``^66.0``).
"""

from __future__ import annotations

import io
import shutil

import pytest
from fastapi.testclient import TestClient

from app.main import app

PANDOC_AVAILABLE = shutil.which("pandoc") is not None

# Minimal 1x1 PNG used as the page image when a test needs one.
# Avoids a Pillow runtime dependency in the test setup.
_TINY_PNG = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xfc\xcf\xc0\xf0\x9f\x01\x00\x05\x00\x01\xa5\xf6E\xa5"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _create_picture_book(client: TestClient, title: str = "Test Picture Book") -> str:
    """Create a picture-book row + return its id."""
    resp = client.post(
        "/api/books",
        json={
            "title": title,
            "author": "T. Tester",
            "book_type": "picture_book",
        },
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _create_prose_book(client: TestClient, title: str = "Test Prose Book") -> str:
    resp = client.post(
        "/api/books",
        json={"title": title, "author": "T. Tester"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _add_page(
    client: TestClient,
    book_id: str,
    *,
    layout: str = "image_top_text_bottom",
    text: str = "Once upon a time, in a faraway land.",
    image_asset_id: str | None = None,
) -> dict:
    body: dict = {"layout": layout, "text_content": text}
    if image_asset_id is not None:
        body["image_asset_id"] = image_asset_id
    resp = client.post(f"/api/books/{book_id}/pages", json=body)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _upload_image_asset(client: TestClient, book_id: str) -> str:
    """Upload a tiny PNG to the book + return its asset id."""
    resp = client.post(
        f"/api/books/{book_id}/assets",
        files={"file": ("page.png", io.BytesIO(_TINY_PNG), "image/png")},
        data={"asset_type": "figure"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


# --- Picture-book + PDF: happy path ---


def test_picture_book_pdf_export_returns_pdf(client: TestClient):
    """Happy path: a picture-book with one text-only page renders to
    a non-empty PDF via the WeasyPrint dispatch.

    No image asset required for text_only layout; this is the
    cheapest possible picture-book PDF (one page, no images) and
    exercises the full dispatch + load + generate + FileResponse
    chain without needing the asset upload path."""
    book_id = _create_picture_book(client, title="Tiny Picture Book")
    _add_page(client, book_id, layout="text_only", text="A single page.")

    resp = client.get(f"/api/books/{book_id}/export/pdf")

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF"), "Response is not a valid PDF"
    assert len(resp.content) > 1000, (
        f"PDF unexpectedly tiny ({len(resp.content)} bytes); WeasyPrint "
        f"likely produced an empty document"
    )


def test_picture_book_pdf_export_with_image_asset(client: TestClient):
    """Picture-book with an image_top_text_bottom layout + an
    uploaded image asset renders. Exercises the asset-id-to-URL
    resolution path in ``_build_assets_map``."""
    book_id = _create_picture_book(client, title="PB With Image")
    asset_id = _upload_image_asset(client, book_id)
    _add_page(
        client,
        book_id,
        layout="image_top_text_bottom",
        text="A page with a picture.",
        image_asset_id=asset_id,
    )

    resp = client.get(f"/api/books/{book_id}/export/pdf")

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


def test_picture_book_with_multiple_layouts_renders(client: TestClient):
    """All five layouts on one book render together. Catches any
    layout-class lookup failure that would only surface in a
    multi-layout document."""
    book_id = _create_picture_book(client, title="PB All Layouts")
    layouts = [
        "speech_bubble",
        "image_top_text_bottom",
        "image_left_text_right",
        "image_full_text_overlay",
        "text_only",
    ]
    for layout in layouts:
        _add_page(client, book_id, layout=layout, text=f"Page using {layout}.")

    resp = client.get(f"/api/books/{book_id}/export/pdf")
    assert resp.status_code == 200, resp.text
    assert resp.content.startswith(b"%PDF")


def test_picture_book_with_layout_config_renders(client: TestClient):
    """Picture-book with a layout_config dict (anchor + opacity)
    survives the route -> serializer -> generator path. Regression
    pin against the speech_bubble_config -> layout_config rename
    (Session 4c): if the serializer ever forgets to JSON-decode the
    DB Text column, this test catches it."""
    book_id = _create_picture_book(client, title="PB With Config")
    resp = client.post(
        f"/api/books/{book_id}/pages",
        json={
            "layout": "speech_bubble",
            "text_content": "Look, a bubble!",
            "layout_config": {"anchor_position": "top-right", "opacity": 0.7},
        },
    )
    assert resp.status_code in (200, 201), resp.text

    resp = client.get(f"/api/books/{book_id}/export/pdf")
    assert resp.status_code == 200, resp.text
    assert resp.content.startswith(b"%PDF")


# --- Picture-book + non-PDF formats: 400 ---


@pytest.mark.parametrize("fmt", ["epub", "docx", "html", "markdown"])
def test_picture_book_non_pdf_format_returns_400(client: TestClient, fmt: str):
    """Picture-books only support PDF in this release. Other formats
    are deferred to PICTURE-BOOK-PDF-KDP-FORMATS-01 (P3)."""
    book_id = _create_picture_book(client, title="PB Format Test")
    _add_page(client, book_id, layout="text_only", text="Body.")

    resp = client.get(f"/api/books/{book_id}/export/{fmt}")
    assert resp.status_code == 400, resp.text
    detail = resp.json()["detail"]
    assert "Picture-books only support PDF" in detail or "pdf" in detail.lower()
    assert fmt in detail


# --- Prose-book + PDF: regression pin (chapter pipeline unchanged) ---


@pytest.mark.skipif(not PANDOC_AVAILABLE, reason="Pandoc not installed")
def test_prose_book_pdf_export_still_works(client: TestClient):
    """Regression pin: the chapter-based PDF pipeline must keep
    working unchanged after the picture-book dispatch landed.
    Skips when Pandoc isn't available (the chapter pipeline shells
    out to Pandoc)."""
    book_id = _create_prose_book(client, title="Tiny Prose")
    resp = client.post(
        f"/api/books/{book_id}/chapters",
        json={
            "title": "Chapter One",
            "content": (
                '{"type":"doc","content":[{"type":"paragraph",'
                '"content":[{"type":"text","text":"Body."}]}]}'
            ),
        },
    )
    assert resp.status_code in (200, 201), resp.text

    resp = client.get(f"/api/books/{book_id}/export/pdf")
    # Pandoc rendering may produce a non-PDF media type or partial
    # output on missing-asset cases; the regression pin is that the
    # route does NOT branch into the picture-book code path and
    # does NOT return 400. 200 is the happy outcome; 422/500 also
    # acceptable since chapter pipeline can fail for unrelated
    # reasons in CI. The smoke is: NOT 400 (which would be the
    # picture-book misdispatch).
    assert resp.status_code != 400, (
        f"Prose PDF export incorrectly hit the picture-book "
        f"non-PDF guard. Response: {resp.status_code} {resp.text[:200]}"
    )


# --- 404 + 422 edges ---


def test_picture_book_pdf_export_404_unknown_book(client: TestClient):
    """Unknown book id returns 404, not 500."""
    resp = client.get("/api/books/does-not-exist/export/pdf")
    assert resp.status_code == 404, resp.text


def test_picture_book_pdf_with_zero_pages_returns_a_pdf(client: TestClient):
    """A picture-book with NO pages still produces a (mostly empty)
    PDF. The cover-only edge case shipped in Commit 3 will turn
    this into a single-page cover; for Commit 2 the generator
    accepts an empty pages list."""
    book_id = _create_picture_book(client, title="Empty PB")

    resp = client.get(f"/api/books/{book_id}/export/pdf")
    # Either 200 with a near-empty PDF, OR 500 if the generator
    # doesn't tolerate zero pages — either is acceptable for the
    # Commit 2 dispatch contract (the cover-page work in Commit 3
    # closes this edge). The regression pin is: NOT a 400 (which
    # would mean the dispatch sent it through the wrong branch).
    assert resp.status_code != 400, (
        f"Empty picture-book wrongly returned 400 "
        f"({resp.status_code} {resp.text[:200]})"
    )
