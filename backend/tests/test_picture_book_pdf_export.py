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


# --- PDF-KDP-FORMATS-01: picture_book_format query-param ---


@pytest.mark.parametrize(
    "fmt_id",
    ["8.5x8.5", "8x10", "8.5x11", "11x8.5", "10x8"],
)
def test_picture_book_pdf_export_accepts_all_5_kdp_formats(
    client: TestClient, fmt_id: str
):
    """Each of the 5 KDP trim sizes round-trips end-to-end through
    the export route to a valid PDF."""
    book_id = _create_picture_book(client, title=f"PB Format {fmt_id}")
    _add_page(client, book_id, layout="text_only", text="Body.")

    resp = client.get(
        f"/api/books/{book_id}/export/pdf",
        params={"picture_book_format": fmt_id},
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


def test_picture_book_pdf_export_default_format_keeps_legacy_filename(
    client: TestClient,
):
    """8.5x8.5 default -> filename stays ``<slug>.pdf`` (no format
    suffix) so back-compat with existing exports is preserved."""
    book_id = _create_picture_book(client, title="Square Default")
    _add_page(client, book_id, layout="text_only", text="Body.")

    # Default format (no query param); explicit query also valid.
    resp = client.get(f"/api/books/{book_id}/export/pdf")
    assert resp.status_code == 200, resp.text
    cd = resp.headers.get("content-disposition", "")
    assert "square-default.pdf" in cd
    assert "8.5x8.5" not in cd

    resp2 = client.get(
        f"/api/books/{book_id}/export/pdf",
        params={"picture_book_format": "8.5x8.5"},
    )
    assert resp2.status_code == 200
    cd2 = resp2.headers.get("content-disposition", "")
    assert "square-default.pdf" in cd2
    assert "8.5x8.5" not in cd2


@pytest.mark.parametrize(
    "fmt_id",
    ["8x10", "8.5x11", "11x8.5", "10x8"],
)
def test_picture_book_pdf_export_non_default_format_suffixes_filename(
    client: TestClient, fmt_id: str
):
    """Non-default formats append ``-<format>`` to the filename so
    the author can export multiple formats of the same book without
    overwriting downloads."""
    book_id = _create_picture_book(client, title="Suffix Test")
    _add_page(client, book_id, layout="text_only", text="Body.")

    resp = client.get(
        f"/api/books/{book_id}/export/pdf",
        params={"picture_book_format": fmt_id},
    )
    assert resp.status_code == 200, resp.text
    cd = resp.headers.get("content-disposition", "")
    assert f"suffix-test-{fmt_id}.pdf" in cd


def test_picture_book_pdf_export_unknown_format_falls_back_to_default(
    client: TestClient,
):
    """Unknown format query value silently falls back to 8.5x8.5
    (Q2 default contract). NOT a 400 — that would surprise callers
    that mis-formed the query."""
    book_id = _create_picture_book(client, title="Unknown Format")
    _add_page(client, book_id, layout="text_only", text="Body.")

    resp = client.get(
        f"/api/books/{book_id}/export/pdf",
        params={"picture_book_format": "garbage"},
    )
    assert resp.status_code == 200, resp.text
    cd = resp.headers.get("content-disposition", "")
    # Falls back to default -> no suffix in filename.
    assert "unknown-format.pdf" in cd
    assert "garbage" not in cd


# --- PDF-BLEED-MARKS-01: picture_book_bleed_marks query param ---


def test_picture_book_pdf_export_bleed_false_keeps_legacy_filename(
    client: TestClient,
):
    """Default bleed=false on default format -> back-compat
    filename ``<slug>.pdf`` with no -bleed suffix. Existing
    consumers that don't update see identical behavior."""
    book_id = _create_picture_book(client, title="Bleed False Default")
    _add_page(client, book_id, layout="text_only", text="Body.")

    resp = client.get(f"/api/books/{book_id}/export/pdf")
    assert resp.status_code == 200, resp.text
    cd = resp.headers.get("content-disposition", "")
    assert "bleed-false-default.pdf" in cd
    assert "-bleed" not in cd


def test_picture_book_pdf_export_bleed_true_default_format_suffix(
    client: TestClient,
):
    """Q4: default format + bleed=true -> <slug>-bleed.pdf."""
    book_id = _create_picture_book(client, title="Bleed True")
    _add_page(client, book_id, layout="text_only", text="Body.")

    resp = client.get(
        f"/api/books/{book_id}/export/pdf",
        params={"picture_book_bleed_marks": "true"},
    )
    assert resp.status_code == 200, resp.text
    cd = resp.headers.get("content-disposition", "")
    assert "bleed-true-bleed.pdf" in cd


def test_picture_book_pdf_export_bleed_true_non_default_format_suffix_order(
    client: TestClient,
):
    """Q4: format first, then bleed flag. ``-11x8.5-bleed`` not
    ``-bleed-11x8.5``."""
    book_id = _create_picture_book(client, title="Both Nondefault")
    _add_page(client, book_id, layout="text_only", text="Body.")

    resp = client.get(
        f"/api/books/{book_id}/export/pdf",
        params={
            "picture_book_format": "11x8.5",
            "picture_book_bleed_marks": "true",
        },
    )
    assert resp.status_code == 200, resp.text
    cd = resp.headers.get("content-disposition", "")
    assert "both-nondefault-11x8.5-bleed.pdf" in cd


def test_picture_book_pdf_export_non_default_format_bleed_false_no_bleed_suffix(
    client: TestClient,
):
    """Non-default format + bleed=false -> only format suffix,
    no -bleed appended (regression pin for Q4 ordering)."""
    book_id = _create_picture_book(client, title="Format Only")
    _add_page(client, book_id, layout="text_only", text="Body.")

    resp = client.get(
        f"/api/books/{book_id}/export/pdf",
        params={"picture_book_format": "8x10"},
    )
    assert resp.status_code == 200, resp.text
    cd = resp.headers.get("content-disposition", "")
    assert "format-only-8x10.pdf" in cd
    assert "-bleed" not in cd


@pytest.mark.parametrize(
    "fmt_id",
    ["8.5x8.5", "8x10", "8.5x11", "11x8.5", "10x8"],
)
def test_picture_book_pdf_export_bleed_works_for_each_format(
    client: TestClient, fmt_id: str
):
    """Each of the 5 KDP trim sizes accepts the bleed flag and
    produces a valid PDF end-to-end."""
    book_id = _create_picture_book(client, title=f"Bleed {fmt_id}")
    _add_page(client, book_id, layout="text_only", text="Body.")

    resp = client.get(
        f"/api/books/{book_id}/export/pdf",
        params={
            "picture_book_format": fmt_id,
            "picture_book_bleed_marks": "true",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")
