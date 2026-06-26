"""Tests for the KDP package metadata.json document (#13 / SEO).

Covers the package ``metadata.json`` enrichment without running the
full manuscript pipeline: the metadata document is built by the pure,
DB-free ``build_kdp_metadata_document`` seam and round-tripped through a
real ZIP to assert the file lands in the archive.
"""

from __future__ import annotations

import json
import zipfile
from datetime import datetime
from pathlib import Path

from bibliogon_kdp.package import build_kdp_metadata_document

_BOOK = {
    "title": "Mein Buch",
    "subtitle": "Ein Untertitel",
    "author": "Asterios Raptis",
    "description": "Beschreibung.",
    "language": "de",
    "series": None,
    "series_index": None,
    "isbn_ebook": "978-1-111-11111-1",
    "isbn_paperback": "978-2-222-22222-2",
    "isbn_hardcover": "978-3-333-33333-3",
    "keywords": ["a", "b"],
    "categories": ["Literature & Fiction"],
}


def _write_metadata_zip(metadata: dict, tmp_path: Path) -> Path:
    """Write ``metadata`` into a ZIP exactly as the package builder does."""
    zip_path = tmp_path / "kdp-package.zip"
    payload = json.dumps(metadata, indent=2, ensure_ascii=False)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("metadata.json", payload)
    return zip_path


class TestKdpPackageMetadata:

    def test_zip_contains_metadata_json(self, tmp_path: Path) -> None:
        metadata = build_kdp_metadata_document(_BOOK, format_kind="paperback")
        zip_path = _write_metadata_zip(metadata, tmp_path)
        with zipfile.ZipFile(zip_path) as zf:
            assert "metadata.json" in zf.namelist()

    def test_metadata_has_title_and_author(self, tmp_path: Path) -> None:
        metadata = build_kdp_metadata_document(_BOOK, format_kind="paperback")
        zip_path = _write_metadata_zip(metadata, tmp_path)
        with zipfile.ZipFile(zip_path) as zf:
            parsed = json.loads(zf.read("metadata.json").decode("utf-8"))
        assert parsed["title"] == "Mein Buch"
        assert parsed["author"] == "Asterios Raptis"

    def test_provenance_fields_populated(self) -> None:
        metadata = build_kdp_metadata_document(
            _BOOK, format_kind="paperback", trim_size="6x9", page_count=123
        )
        assert metadata["isbn"] == "978-2-222-22222-2"
        assert metadata["format"] == "Taschenbuch"
        assert metadata["trim_size"] == "6x9"
        assert metadata["page_count"] == 123
        assert metadata["generated_by"].startswith("Bibliogon v")
        # generated_at is a valid ISO-8601 timestamp.
        datetime.fromisoformat(metadata["generated_at"])

    def test_ebook_format_label_and_isbn(self) -> None:
        metadata = build_kdp_metadata_document(_BOOK, format_kind="ebook")
        assert metadata["format"] == "eBook"
        assert metadata["isbn"] == "978-1-111-11111-1"
        # eBook has no trim size.
        assert metadata["trim_size"] is None

    def test_hardcover_isbn_falls_back_to_paperback(self) -> None:
        book = {**_BOOK, "isbn_hardcover": None}
        metadata = build_kdp_metadata_document(book, format_kind="hardcover")
        assert metadata["format"] == "Hardcover"
        assert metadata["isbn"] == "978-2-222-22222-2"

    def test_empty_fields_become_null_no_crash(self) -> None:
        sparse = {
            "title": "",
            "author": "",
            "language": "de",
            "isbn_ebook": "",
            "isbn_paperback": "",
            "isbn_hardcover": "",
            "keywords": [],
            "categories": [],
        }
        metadata = build_kdp_metadata_document(
            sparse, format_kind="paperback", page_count=None
        )
        assert metadata["isbn"] is None
        assert metadata["page_count"] is None
        assert metadata["trim_size"] is None
        assert metadata["generated_by"].startswith("Bibliogon v")
