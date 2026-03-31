"""Tests for project import (TOC, images, section ordering) and export behavior."""

import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_project_zip(
    chapters: dict[str, str] | None = None,
    front_matter: dict[str, str] | None = None,
    back_matter: dict[str, str] | None = None,
    metadata: str | None = None,
    export_settings: str | None = None,
    assets: dict[str, bytes] | None = None,
) -> io.BytesIO:
    """Create a write-book-template ZIP in memory for testing."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "test-book/config/metadata.yaml",
            metadata or "title: Test Book\nauthor: Test Author\nlang: en\n",
        )
        if export_settings:
            zf.writestr("test-book/config/export-settings.yaml", export_settings)
        for name, content in (chapters or {}).items():
            zf.writestr(f"test-book/manuscript/chapters/{name}", content)
        for name, content in (front_matter or {}).items():
            zf.writestr(f"test-book/manuscript/front-matter/{name}", content)
        for name, content in (back_matter or {}).items():
            zf.writestr(f"test-book/manuscript/back-matter/{name}", content)
        for name, data in (assets or {}).items():
            zf.writestr(f"test-book/assets/{name}", data)
    buf.seek(0)
    return buf


def _import_zip(buf: io.BytesIO) -> dict:
    r = client.post(
        "/api/backup/import-project",
        files={"file": ("test.zip", buf, "application/zip")},
    )
    assert r.status_code == 200
    return r.json()


def _cleanup(book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


# --- TOC Import ---


def test_toc_imported_as_toc_type():
    """Manual TOC file should be imported with chapter_type 'toc'."""
    buf = _create_project_zip(
        front_matter={
            "toc.md": "# Table of Contents\n\n- [Chapter 1](#chapter-1)\n",
            "preface.md": "# Preface\n\nSome text.\n",
        },
        chapters={"01-chapter.md": "# Chapter 1\n\nContent.\n"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    chapters = r.json()["chapters"]

    toc_chapters = [c for c in chapters if c["chapter_type"] == "toc"]
    assert len(toc_chapters) == 1, "Should have exactly one TOC chapter"
    assert "Table of Contents" in toc_chapters[0]["title"]

    _cleanup(book_id)


def test_toc_not_duplicated():
    """Only one TOC should exist - the manual one, no auto-generated duplicate."""
    buf = _create_project_zip(
        front_matter={
            "toc.md": "# Table of Contents\n\n- [Ch 1](#ch-1)\n",
        },
        chapters={"01-chapter.md": "# Ch 1\n\nContent.\n"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    chapters = r.json()["chapters"]

    toc_count = sum(1 for c in chapters if c["chapter_type"] == "toc")
    assert toc_count == 1, f"Expected 1 TOC, got {toc_count}"

    _cleanup(book_id)


def test_toc_print_skipped():
    """toc-print.md should be skipped during import."""
    buf = _create_project_zip(
        front_matter={
            "toc.md": "# TOC\n\n- [Ch 1](#ch-1)\n",
            "toc-print.md": "# TOC Print\n\nPrint version.\n",
        },
        chapters={"01-chapter.md": "# Ch 1\n\nContent.\n"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    chapters = r.json()["chapters"]
    titles = [c["title"] for c in chapters]
    assert "TOC Print" not in titles

    _cleanup(book_id)


# --- TOC Validation ---


def test_toc_validation_all_valid():
    """TOC links matching chapter headings should be valid."""
    buf = _create_project_zip(
        front_matter={
            "toc.md": "# TOC\n\n- [Chapter 1](#chapter-1)\n- [Overview](#overview)\n",
        },
        chapters={
            "01-chapter.md": "# Chapter 1\n\n## Overview\n\nContent.\n",
        },
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.post(f"/api/books/{book_id}/chapters/validate-toc")
    assert r.status_code == 200
    data = r.json()
    assert data["toc_found"] is True
    assert data["valid"] is True
    assert data["broken_count"] == 0

    _cleanup(book_id)


def test_toc_validation_broken_link():
    """TOC links to non-existent anchors should be reported as broken."""
    buf = _create_project_zip(
        front_matter={
            "toc.md": "# TOC\n\n- [Chapter 1](#chapter-1)\n- [Missing](#does-not-exist)\n",
        },
        chapters={"01-chapter.md": "# Chapter 1\n\nContent.\n"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.post(f"/api/books/{book_id}/chapters/validate-toc")
    data = r.json()
    assert data["valid"] is False
    assert data["broken_count"] == 1
    assert data["broken"][0]["anchor"] == "does-not-exist"

    _cleanup(book_id)


def test_toc_validation_no_toc():
    """Books without a TOC chapter should return toc_found=False."""
    buf = _create_project_zip(
        chapters={"01-chapter.md": "# Chapter 1\n\nContent.\n"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.post(f"/api/books/{book_id}/chapters/validate-toc")
    data = r.json()
    assert data["toc_found"] is False

    _cleanup(book_id)


# --- Section Order ---


def test_section_order_from_export_settings():
    """Import should follow section_order from export-settings.yaml."""
    buf = _create_project_zip(
        front_matter={
            "foreword.md": "# Foreword\n\nForeword text.\n",
            "preface.md": "# Preface\n\nPreface text.\n",
            "toc.md": "# TOC\n\n- Links\n",
        },
        chapters={"01-chapter.md": "# Chapter 1\n\nContent.\n"},
        back_matter={
            "epilogue.md": "# Epilogue\n\nEpilogue text.\n",
            "acknowledgments.md": "# Acknowledgments\n\nThanks.\n",
        },
        export_settings=(
            "section_order:\n"
            "  ebook:\n"
            "    - front-matter/toc.md\n"
            "    - front-matter/preface.md\n"
            "    - front-matter/foreword.md\n"
            "    - chapters\n"
            "    - back-matter/epilogue.md\n"
            "    - back-matter/acknowledgments.md\n"
        ),
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    chapters = sorted(r.json()["chapters"], key=lambda c: c["position"])
    types = [c["chapter_type"] for c in chapters]

    # TOC first, then preface, then foreword (as per export-settings)
    assert types[0] == "toc"
    assert types[1] == "preface"
    assert types[2] == "foreword"
    # Chapters in the middle
    assert types[3] == "chapter"
    # Back matter at the end
    assert types[4] == "epilogue"
    assert types[5] == "acknowledgments"

    _cleanup(book_id)


def test_acknowledgments_in_back_matter():
    """Acknowledgments should be imported as back-matter, not front-matter."""
    buf = _create_project_zip(
        chapters={"01-chapter.md": "# Chapter 1\n\nContent.\n"},
        back_matter={"acknowledgments.md": "# Acknowledgments\n\nThanks.\n"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    chapters = r.json()["chapters"]

    ack = [c for c in chapters if c["chapter_type"] == "acknowledgments"]
    assert len(ack) == 1
    ch = [c for c in chapters if c["chapter_type"] == "chapter"]
    assert len(ch) == 1
    # Acknowledgments should have higher position than chapters
    assert ack[0]["position"] > ch[0]["position"]

    _cleanup(book_id)


# --- Chapter Type Detection ---


def test_part_intro_detection():
    """Files like 01-0-part-1-intro.md should be detected as part_intro."""
    buf = _create_project_zip(
        chapters={
            "01-0-part-1-intro.md": "# Part 1: Introduction\n\nIntro text.\n",
            "01-chapter.md": "# Chapter 1\n\nContent.\n",
        },
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    chapters = r.json()["chapters"]

    part_intros = [c for c in chapters if c["chapter_type"] == "part_intro"]
    assert len(part_intros) == 1

    _cleanup(book_id)


def test_interlude_detection():
    """Files like 05-1-interludium.md should be detected as interlude."""
    buf = _create_project_zip(
        chapters={
            "05-1-interludium.md": "# Interlude\n\nInterlude text.\n",
        },
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    chapters = r.json()["chapters"]

    interludes = [c for c in chapters if c["chapter_type"] == "interlude"]
    assert len(interludes) == 1

    _cleanup(book_id)


# --- Asset Import ---


def test_assets_imported():
    """Images from assets/ should be imported and registered in DB."""
    buf = _create_project_zip(
        chapters={"01-chapter.md": "# Chapter 1\n\nContent.\n"},
        assets={
            "covers/cover.png": b"fake-png-data",
            "figures/diagram.png": b"fake-diagram-data",
        },
    )
    result = _import_zip(buf)
    book_id = result["book_id"]
    assert result.get("asset_count", 0) == 2

    r = client.get(f"/api/books/{book_id}/assets")
    assets = r.json()
    assert len(assets) == 2

    types = {a["asset_type"] for a in assets}
    assert "cover" in types
    assert "figure" in types

    _cleanup(book_id)


def test_image_paths_rewritten():
    """Image src paths should be rewritten to /api/books/{id}/assets/file/{name}."""
    buf = _create_project_zip(
        chapters={
            "01-chapter.md": "# Chapter 1\n\n![image](assets/figures/diagram.png)\n",
        },
        assets={
            "figures/diagram.png": b"fake-png-data",
        },
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    chapters = r.json()["chapters"]
    ch = [c for c in chapters if c["chapter_type"] == "chapter"][0]

    assert f"/api/books/{book_id}/assets/file/diagram.png" in ch["content"]
    assert "assets/figures/diagram.png" not in ch["content"]

    _cleanup(book_id)


def test_asset_file_serving():
    """Assets should be servable via the /assets/file/{filename} endpoint."""
    buf = _create_project_zip(
        chapters={"01-chapter.md": "# Chapter 1\n\nContent.\n"},
        assets={"figures/test-image.png": b"PNG-FAKE-DATA-12345"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}/assets/file/test-image.png")
    assert r.status_code == 200
    assert b"PNG-FAKE-DATA-12345" in r.content

    _cleanup(book_id)


# --- Markdown to HTML ---


def test_content_stored_as_html():
    """Imported markdown content should be converted to HTML."""
    buf = _create_project_zip(
        chapters={
            "01-chapter.md": "# Chapter 1\n\n## Section A\n\nSome **bold** text.\n",
        },
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    ch = [c for c in r.json()["chapters"] if c["chapter_type"] == "chapter"][0]

    assert "<h1>" in ch["content"] or "<h2>" in ch["content"]
    assert "<strong>bold</strong>" in ch["content"]
    assert "## Section A" not in ch["content"]  # raw MD should not be present

    _cleanup(book_id)


# --- Metadata Import ---


def test_isbn_identifiers_format():
    """ISBN from identifiers.isbn_X format should be imported."""
    buf = _create_project_zip(
        metadata=(
            "title: ISBN Test\n"
            "author: Author\n"
            "identifiers:\n"
            "  isbn_paperback: '9781234567890'\n"
            "  isbn_hardcover: '9780987654321'\n"
        ),
        chapters={"01-ch.md": "# Ch\n\nText.\n"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    book = r.json()
    assert book["isbn_paperback"] == "9781234567890"
    assert book["isbn_hardcover"] == "9780987654321"

    _cleanup(book_id)


def test_asin_all_variants():
    """All ASIN variants (ebook, paperback, hardcover) should be imported."""
    buf = _create_project_zip(
        metadata=(
            "title: ASIN Test\n"
            "author: Author\n"
            "asin:\n"
            "  ebook: B0AAAA\n"
            "  paperback: B0BBBB\n"
            "  hardcover: B0CCCC\n"
        ),
        chapters={"01-ch.md": "# Ch\n\nText.\n"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    book = r.json()
    assert book["asin_ebook"] == "B0AAAA"
    assert book["asin_paperback"] == "B0BBBB"
    assert book["asin_hardcover"] == "B0CCCC"

    _cleanup(book_id)


# --- Figcaption ---


def test_figcaption_stored_as_class():
    """Figcaption should be stored as <p class="figcaption"> for TipTap custom node."""
    buf = _create_project_zip(
        chapters={
            "01-chapter.md": (
                '# Chapter 1\n\n'
                '<figure>\n'
                '  <img src="assets/figures/test.png" alt="Test Image" />\n'
                '  <figcaption>\n'
                '    A description of the image.\n'
                '  </figcaption>\n'
                '</figure>\n\n'
                'Some text after.\n'
            ),
        },
        assets={"figures/test.png": b"fake-png"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    ch = [c for c in r.json()["chapters"] if c["chapter_type"] == "chapter"][0]

    # figcaption should be stored as <p class="figcaption">, not raw <figcaption>
    assert 'class="figcaption"' in ch["content"], \
        f"Expected figcaption class, got: {ch['content'][:300]}"
    # Should NOT contain raw <figcaption> or <figure> tags
    assert "<figcaption>" not in ch["content"]
    assert "<figure>" not in ch["content"]
    # Caption text should be present
    assert "A description of the image" in ch["content"]

    _cleanup(book_id)


def test_figure_without_caption():
    """Figure without figcaption should just be an <img> tag."""
    buf = _create_project_zip(
        chapters={
            "01-chapter.md": (
                '# Chapter 1\n\n'
                '<figure>\n'
                '  <img src="assets/figures/test.png" alt="Test" />\n'
                '</figure>\n\n'
                'Text after.\n'
            ),
        },
        assets={"figures/test.png": b"fake-png"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    ch = [c for c in r.json()["chapters"] if c["chapter_type"] == "chapter"][0]

    # Should contain <img> tag
    assert "<img" in ch["content"]
    # Should NOT contain <figure> wrapper (stripped for TipTap)
    assert "<figure>" not in ch["content"]
    # alt text should be in the tag attribute, not visible as text
    assert 'alt="Test"' in ch["content"]

    _cleanup(book_id)


def test_image_alt_not_visible_as_text():
    """Alt text from images should not appear as separate visible text."""
    buf = _create_project_zip(
        chapters={
            "01-chapter.md": (
                '# Chapter 1\n\n'
                '<figure>\n'
                '  <img src="assets/figures/test.png" alt="Hidden Alt Text" />\n'
                '</figure>\n\n'
                'Visible text.\n'
            ),
        },
        assets={"figures/test.png": b"fake-png"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    r = client.get(f"/api/books/{book_id}")
    ch = [c for c in r.json()["chapters"] if c["chapter_type"] == "chapter"][0]
    content = ch["content"]

    # alt should only appear inside the img tag attribute
    import re
    alt_outside_img = re.sub(r"<img[^>]*>", "", content)
    assert "Hidden Alt Text" not in alt_outside_img, \
        "Alt text should not appear as visible text outside <img> tag"

    _cleanup(book_id)


# --- Export roundtrip ---


def test_figcaption_roundtrip_export():
    """Figcaption should survive import -> export roundtrip as <figure><figcaption>."""
    buf = _create_project_zip(
        chapters={
            "01-chapter.md": (
                '# Chapter 1\n\n'
                '<figure>\n'
                '  <img src="assets/figures/test.png" alt="Test" />\n'
                '  <figcaption>My caption text.</figcaption>\n'
                '</figure>\n\n'
                'After image.\n'
            ),
        },
        assets={"figures/test.png": b"fake-png"},
    )
    result = _import_zip(buf)
    book_id = result["book_id"]

    # Get stored content
    r = client.get(f"/api/books/{book_id}")
    ch = [c for c in r.json()["chapters"] if c["chapter_type"] == "chapter"][0]

    # Import stores as <p class="figcaption">
    assert 'class="figcaption"' in ch["content"]

    # Now test export conversion
    from bibliogon_export.scaffolder import _content_to_markdown
    md = _content_to_markdown(ch["content"])

    # Export should restore <figure><figcaption>
    assert "<figure>" in md
    assert "<figcaption>" in md
    assert "My caption text" in md

    _cleanup(book_id)
