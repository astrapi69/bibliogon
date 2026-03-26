"""Tests for KDP cover validator."""

from pathlib import Path

from bibliogon_kdp.cover_validator import (
    CoverValidationResult,
    generate_kdp_metadata,
    validate_cover,
)

DEFAULT_REQUIREMENTS = {
    "min_width": 625,
    "min_height": 1000,
    "max_width": 10000,
    "max_height": 10000,
    "min_dpi": 300,
    "aspect_ratio_min": 1.5,
    "aspect_ratio_max": 1.8,
    "max_file_size_mb": 50,
    "allowed_formats": ["jpg", "jpeg", "tiff", "png"],
}


class TestCoverValidationResult:

    def test_empty_is_valid(self) -> None:
        result = CoverValidationResult()
        assert result.is_valid

    def test_with_error_is_invalid(self) -> None:
        result = CoverValidationResult()
        result.errors.append("Some error")
        assert not result.is_valid

    def test_to_dict(self) -> None:
        result = CoverValidationResult()
        result.warnings.append("Low DPI")
        result.info["width"] = 800
        d = result.to_dict()
        assert d["valid"] is True
        assert "Low DPI" in d["warnings"]
        assert d["info"]["width"] == 800


class TestValidateCover:

    def test_missing_file(self, tmp_path: Path) -> None:
        result = validate_cover(tmp_path / "nonexistent.jpg", DEFAULT_REQUIREMENTS)
        assert not result.is_valid
        assert any("not found" in e.lower() for e in result.errors)

    def test_wrong_format(self, tmp_path: Path) -> None:
        bmp_file = tmp_path / "cover.bmp"
        bmp_file.write_bytes(b"fake bmp data")
        result = validate_cover(bmp_file, DEFAULT_REQUIREMENTS)
        assert any("Unsupported format" in e for e in result.errors)

    def test_valid_extension(self, tmp_path: Path) -> None:
        jpg_file = tmp_path / "cover.jpg"
        jpg_file.write_bytes(b"fake jpg data")
        result = validate_cover(jpg_file, DEFAULT_REQUIREMENTS)
        # May have errors from Pillow failing to open fake data,
        # but should not have format error
        format_errors = [e for e in result.errors if "Unsupported format" in e]
        assert len(format_errors) == 0


class TestGenerateKdpMetadata:

    def test_basic_metadata(self) -> None:
        book = {
            "title": "My Book",
            "subtitle": "A Subtitle",
            "author": "Author Name",
            "description": "A description",
            "language": "de",
        }
        meta = generate_kdp_metadata(book, categories=["Literature & Fiction"])
        assert meta["title"] == "My Book"
        assert meta["language"] == "German"
        assert "Literature & Fiction" in meta["categories"]

    def test_keywords_max_7(self) -> None:
        book = {"title": "Test", "author": "A"}
        keywords = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
        meta = generate_kdp_metadata(book, keywords=keywords)
        assert len(meta["keywords"]) == 7

    def test_language_mapping(self) -> None:
        for lang, expected in [("en", "English"), ("fr", "French"), ("el", "Greek")]:
            book = {"title": "T", "author": "A", "language": lang}
            meta = generate_kdp_metadata(book)
            assert meta["language"] == expected

    def test_series_info(self) -> None:
        book = {
            "title": "Book 2",
            "author": "A",
            "series": "My Series",
            "series_index": 2,
        }
        meta = generate_kdp_metadata(book)
        assert meta["series"] == "My Series"
        assert meta["series_number"] == 2
