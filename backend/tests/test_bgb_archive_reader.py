"""Tests for app/import_plugins/handlers/bgb_archive_reader.py.

Pure .bgb ZIP parsing helpers (no DB, no session): keyword decoding,
file hashing, manifest validation, book-blob extraction, and counts.
Exercised against in-memory ZIP archives built per test.
"""

import io
import json
import zipfile

from app.import_plugins.handlers import bgb_archive_reader as reader


def _zip_with(entries: dict[str, bytes]) -> zipfile.ZipFile:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    buf.seek(0)
    return zipfile.ZipFile(buf, "r")


class TestParseKeywordsField:
    def test_none_returns_none(self):
        assert reader._parse_keywords_field(None) is None

    def test_list_is_stringified(self):
        assert reader._parse_keywords_field(["a", 1]) == ["a", "1"]

    def test_json_string_list(self):
        assert reader._parse_keywords_field('["x", "y"]') == ["x", "y"]

    def test_plain_non_json_string(self):
        assert reader._parse_keywords_field("just text") == ["just text"]

    def test_empty_string_is_none(self):
        assert reader._parse_keywords_field("   ") is None

    def test_json_scalar_wrapped_in_list(self):
        assert reader._parse_keywords_field('"solo"') == ["solo"]


class TestSha256OfFile:
    def test_hashes_file_contents(self, tmp_path):
        f = tmp_path / "blob.bin"
        f.write_bytes(b"hello world")
        import hashlib

        assert reader._sha256_of_file(f) == hashlib.sha256(b"hello world").hexdigest()


class TestValidateManifest:
    def test_missing_manifest_warns(self):
        zf = _zip_with({"book/book.json": b"{}"})
        warnings: list[str] = []
        reader._validate_manifest(zf, warnings)
        assert any("No manifest" in w for w in warnings)

    def test_invalid_json_manifest_warns(self):
        zf = _zip_with({"manifest.json": b"not json{"})
        warnings: list[str] = []
        reader._validate_manifest(zf, warnings)
        assert any("not valid JSON" in w for w in warnings)

    def test_wrong_format_warns(self):
        zf = _zip_with({"manifest.json": json.dumps({"format": "other"}).encode()})
        warnings: list[str] = []
        reader._validate_manifest(zf, warnings)
        assert any("Unexpected manifest format" in w for w in warnings)

    def test_correct_manifest_no_warning(self):
        zf = _zip_with({"manifest.json": json.dumps({"format": "bibliogon-backup"}).encode()})
        warnings: list[str] = []
        reader._validate_manifest(zf, warnings)
        assert warnings == []


class TestBookBlobsAndFirst:
    def test_book_blobs_skips_corrupt_entries(self):
        zf = _zip_with(
            {
                "books/1/book.json": json.dumps({"title": "Good"}).encode(),
                "books/2/book.json": b"broken{",
            }
        )
        blobs = reader._book_blobs(zf)
        assert blobs == [{"title": "Good"}]

    def test_first_book_blob_warns_when_none(self):
        zf = _zip_with({"manifest.json": b"{}"})
        warnings: list[str] = []
        assert reader._first_book_blob(zf, warnings) is None
        assert any("No book.json" in w for w in warnings)

    def test_first_book_blob_warns_on_multiple(self):
        zf = _zip_with(
            {
                "books/1/book.json": json.dumps({"title": "A"}).encode(),
                "books/2/book.json": json.dumps({"title": "B"}).encode(),
            }
        )
        warnings: list[str] = []
        first = reader._first_book_blob(zf, warnings)
        assert first == {"title": "A"}
        assert any("contains 2 books" in w for w in warnings)


class TestCounts:
    def test_article_count(self):
        zf = _zip_with(
            {
                "articles/1/article.json": b"{}",
                "articles/2/article.json": b"{}",
                "books/1/book.json": b"{}",
            }
        )
        assert reader._article_count(zf) == 2

    def test_book_count(self, tmp_path):
        path = tmp_path / "backup.bgb"
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("books/1/book.json", b"{}")
            zf.writestr("books/2/book.json", b"{}")
            zf.writestr("manifest.json", b"{}")
        assert reader._book_count(path) == 2
