"""Integration tests for the KDP-package endpoint.

Covers KDP-PUBLISHING-WIZARD-01 Phase 1 C4 — the
``POST /api/kdp/package/{book_id}`` endpoint that produces the
KDP-ready ZIP. Validates the contract end-to-end through the
backend's TestClient with the in-memory DB.

Scope per A4 (Phase 1 MVP ZIP layout):

    metadata.json
    cover.{ext}                      (when cover present)
    cover-validation-report.json
    manuscript-ebook.epub             (prose only; best-effort)
    manuscript-paperback.pdf          (all book types; best-effort)
    publishing-state-snapshot.json
    README.txt

Manuscript generation involves Pandoc + WeasyPrint subprocesses
that aren't guaranteed to be available in the test environment
(no Pandoc on CI's Python image; WeasyPrint needs cairo). The
endpoint's contract is "produce a ZIP with the side files even
when manuscript generation partially fails". The package
builder logs warnings on per-format failures + ships the
remaining side files. The 4xx path (metadata-incomplete) is
the only hard fail.
"""

from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """Use the lifespan context so the plugin manager mounts the
    KDP routes — per the "TestClient must use lifespan context"
    lessons-learned rule. Without ``with TestClient(app) as c``,
    POST /api/kdp/package/* returns 404 because the plugin's
    router was never included."""
    with TestClient(app) as c:
        yield c


def _create_book(client: TestClient, title: str = "KDP-Test", author: str = "Aster") -> str:
    r = client.post(
        "/api/books",
        json={"title": title, "author": author, "language": "de"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _add_chapter(client: TestClient, book_id: str, title: str = "Kapitel 1") -> str:
    r = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": title, "content": '{"type":"doc","content":[]}'},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _patch_book_for_kdp(client: TestClient, book_id: str) -> None:
    """Patch the book with the editorial fields the metadata
    completeness check requires (title + author + language +
    description are mandatory; title + author + language are
    already set at create-time via _create_book)."""
    r = client.patch(
        f"/api/books/{book_id}",
        json={"description": "A description for KDP."},
    )
    assert r.status_code == 200, r.text


def test_package_endpoint_returns_zip_when_metadata_complete(client):
    """Happy path: book has all required metadata + at least one
    chapter (so the chapters check passes for prose). Endpoint
    returns 200 + application/zip. The ZIP carries the side
    files (metadata, validation report, state snapshot, README)
    even if manuscript generation fails on the test box (Pandoc
    may be absent)."""
    book_id = _create_book(client, title="KDP Happy Path")
    _add_chapter(client, book_id)
    _patch_book_for_kdp(client, book_id)

    r = client.post(f"/api/kdp/package/{book_id}")
    if r.status_code == 400 and b"Manuscript generation produced no output" in r.content:
        # Acceptable on a test box without Pandoc/WeasyPrint —
        # the endpoint's contract requires at least one
        # manuscript file to ship a meaningful package.
        return

    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    # ZIP filename includes the slug.
    assert "kdp-happy-path-kdp-package.zip" in r.headers.get("content-disposition", "")

    # Crack open the ZIP and verify the side files exist.
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(zf.namelist())
    assert "metadata.json" in names
    assert "cover-validation-report.json" in names
    assert "publishing-state-snapshot.json" in names
    assert "README.txt" in names
    # At least ONE manuscript file must be present (otherwise the
    # builder would have raised KdpPackageError before the ZIP
    # was bundled).
    assert any(n.startswith("manuscript-") for n in names), f"no manuscript-* in {names}"


def test_package_endpoint_400_when_metadata_incomplete(client):
    """No description + no chapters → check_metadata_completeness
    flags errors → endpoint returns 400 with a user-facing
    detail listing the offending fields."""
    book_id = _create_book(client, title="KDP Incomplete")
    # Deliberately don't add chapters or description.

    r = client.post(f"/api/kdp/package/{book_id}")
    assert r.status_code == 400, r.text
    detail = r.json()["detail"]
    assert "Metadata incomplete" in detail
    # The chapters + description errors should show up.
    assert "chapters" in detail or "description" in detail


def test_package_endpoint_404_on_unknown_book(client):
    r = client.post("/api/kdp/package/does-not-exist")
    assert r.status_code == 400
    assert "not found" in r.json()["detail"].lower()


def test_package_metadata_json_shape(client):
    """The metadata.json inside the ZIP matches the KDP-shape
    that ``generate_kdp_metadata`` produces. Pins the contract
    that a downstream listing-form-filling tool would consume."""
    book_id = _create_book(client, title="KDP Metadata Shape")
    _add_chapter(client, book_id)
    _patch_book_for_kdp(client, book_id)
    # Set categories + keywords + BISAC so the metadata.json
    # carries non-empty arrays.
    r = client.patch(
        f"/api/books/{book_id}",
        json={
            "categories": ["Fiction", "Romance"],
            "keywords": ["love", "story"],
            "bisac_codes": ["FIC027000"],
        },
    )
    assert r.status_code == 200

    r = client.post(f"/api/kdp/package/{book_id}")
    if r.status_code == 400 and b"Manuscript generation produced no output" in r.content:
        return  # tolerant of missing Pandoc

    assert r.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    with zf.open("metadata.json") as f:
        import json

        meta = json.load(f)
    assert meta["title"] == "KDP Metadata Shape"
    assert meta["author"] == "Aster"
    assert meta["language"] == "German"  # _map_language_to_kdp("de")
    assert meta["categories"] == ["Fiction", "Romance"]
    assert "love" in meta["keywords"]


def _fake_generators(monkeypatch):
    """Stub the prose EPUB + PDF generators so the manuscript
    decision can be exercised without Pandoc / WeasyPrint (absent on
    CI). Each stub writes a tiny real file + records its call. Returns
    ``(epub_calls, pdf_calls)`` lists for assertions."""
    from bibliogon_kdp import package as pkg

    epub_calls: list[bool] = []
    pdf_calls: list[tuple] = []

    def fake_epub(book_data, chapters, assets, out_dir):
        out = out_dir / "manuscript-ebook.epub"
        out.write_bytes(b"epub")
        epub_calls.append(True)
        return out

    def fake_pdf(book_data, chapters, out_dir, *, trim_size, margin, bleed_marks):
        pdf_calls.append((trim_size, margin, bleed_marks))
        out = out_dir / "manuscript-paperback.pdf"
        out.write_bytes(b"pdf")
        return out

    monkeypatch.setattr(pkg, "_generate_prose_epub", fake_epub)
    monkeypatch.setattr(pkg, "_generate_prose_pdf", fake_pdf)
    return epub_calls, pdf_calls


def test_ebook_kind_bundles_epub_without_pdf(client, monkeypatch):
    """eBook -> EPUB only, no PDF (#583). The prose PDF generator is
    never invoked and ``manuscript-paperback.pdf`` is absent from the
    ZIP."""
    from bibliogon_kdp.package import build_kdp_package

    book_id = _create_book(client, title="KDP Ebook Only")
    _add_chapter(client, book_id)
    _patch_book_for_kdp(client, book_id)
    _epub, pdf_calls = _fake_generators(monkeypatch)

    zip_path = build_kdp_package(book_id, format_kind="ebook")
    names = set(zipfile.ZipFile(zip_path).namelist())

    assert "manuscript-ebook.epub" in names
    assert "manuscript-paperback.pdf" not in names
    assert pdf_calls == []


def test_paperback_kind_renders_pdf_with_trim_and_bleed(client, monkeypatch):
    """Paperback 6x9 -> the prose PDF generator is called with the
    chosen trim + margin + bleed marks, and the PDF is bundled."""
    from bibliogon_kdp.package import build_kdp_package

    book_id = _create_book(client, title="KDP Paperback")
    _add_chapter(client, book_id)
    _patch_book_for_kdp(client, book_id)
    _epub, pdf_calls = _fake_generators(monkeypatch)

    zip_path = build_kdp_package(book_id, format_kind="paperback", trim_size="6x9", margin="normal")
    names = set(zipfile.ZipFile(zip_path).namelist())

    assert "manuscript-ebook.epub" in names
    assert "manuscript-paperback.pdf" in names
    assert pdf_calls == [("6x9", "normal", True)]


def test_hardcover_kind_renders_pdf_with_trim_and_bleed(client, monkeypatch):
    """Hardcover 8.5x11 -> the prose PDF generator is called with the
    8.5x11 trim + bleed marks."""
    from bibliogon_kdp.package import build_kdp_package

    book_id = _create_book(client, title="KDP Hardcover")
    _add_chapter(client, book_id)
    _patch_book_for_kdp(client, book_id)
    _epub, pdf_calls = _fake_generators(monkeypatch)

    build_kdp_package(book_id, format_kind="hardcover", trim_size="8.5x11", margin="wide")

    assert pdf_calls == [("8.5x11", "wide", True)]


def test_missing_format_defaults_to_paperback(client, monkeypatch):
    """A body-less call defaults to paperback (so the legacy EPUB + PDF
    bundle is preserved) and threads ``trim_size=None`` - which the
    WeasyPrint layer resolves to the 6x9 default (#583)."""
    from bibliogon_kdp.package import build_kdp_package

    book_id = _create_book(client, title="KDP Default Format")
    _add_chapter(client, book_id)
    _patch_book_for_kdp(client, book_id)
    _epub, pdf_calls = _fake_generators(monkeypatch)

    zip_path = build_kdp_package(book_id)
    names = set(zipfile.ZipFile(zip_path).namelist())

    assert "manuscript-paperback.pdf" in names
    assert pdf_calls == [(None, None, True)]


def test_package_endpoint_accepts_format_body(client, monkeypatch):
    """The route accepts the FormatStep body and threads it through.
    eBook over the wire -> the ZIP carries the EPUB but no PDF."""
    from bibliogon_kdp import package as pkg

    book_id = _create_book(client, title="KDP Body Ebook")
    _add_chapter(client, book_id)
    _patch_book_for_kdp(client, book_id)
    _fake_generators(monkeypatch)
    # The picture/comic branches are unaffected; only prose generators
    # are stubbed, which is the book_type created above.
    assert pkg  # keep the import meaningful for linters

    r = client.post(
        f"/api/kdp/package/{book_id}",
        json={"format_kind": "ebook", "trim_size": "6x9", "margin": "normal"},
    )
    assert r.status_code == 200, r.text
    names = set(zipfile.ZipFile(io.BytesIO(r.content)).namelist())
    assert "manuscript-ebook.epub" in names
    assert "manuscript-paperback.pdf" not in names


def test_package_state_snapshot_carries_book_id(client):
    """``publishing-state-snapshot.json`` MUST carry the book id
    so a future Phase-2 wizard rehydration can match a stored
    state to the right book."""
    book_id = _create_book(client, title="KDP State Snapshot")
    _add_chapter(client, book_id)
    _patch_book_for_kdp(client, book_id)

    r = client.post(f"/api/kdp/package/{book_id}")
    if r.status_code == 400 and b"Manuscript generation produced no output" in r.content:
        return

    assert r.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    with zf.open("publishing-state-snapshot.json") as f:
        import json

        snap = json.load(f)
    assert snap["id"] == book_id
    assert snap["title"] == "KDP State Snapshot"
    assert snap["book_type"] == "prose"
