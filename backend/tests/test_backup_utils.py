"""Tests for backup utility functions (CW-11).

Covers pure functions from archive_utils, asset_utils, and markdown_utils
used during backup, restore, and project import operations.
"""

from pathlib import Path

import pytest

from app.models import ChapterType
from app.services.backup.archive_utils import (
    find_books_dir,
    find_manifest,
    find_project_root,
)
from app.services.backup.asset_utils import _classify_asset_type
from app.services.backup.markdown_utils import (
    detect_chapter_type,
    extract_title,
    md_to_html,
    read_file_if_exists,
)


# --- archive_utils ---


class TestFindManifest:
    """Tests for find_manifest()."""

    def test_find_manifest_at_root(self, tmp_path):
        """manifest.json at the root level is found."""
        (tmp_path / "manifest.json").write_text("{}", encoding="utf-8")
        assert find_manifest(tmp_path) == tmp_path / "manifest.json"

    def test_find_manifest_one_level_deep(self, tmp_path):
        """manifest.json inside a single subfolder is found."""
        subdir = tmp_path / "backup-folder"
        subdir.mkdir()
        (subdir / "manifest.json").write_text("{}", encoding="utf-8")
        assert find_manifest(tmp_path) == subdir / "manifest.json"

    def test_find_manifest_returns_none(self, tmp_path):
        """No manifest.json anywhere returns None."""
        (tmp_path / "other.txt").write_text("hello", encoding="utf-8")
        assert find_manifest(tmp_path) is None


class TestFindBooksDir:
    """Tests for find_books_dir()."""

    def test_find_books_dir_at_root(self, tmp_path):
        """books/ directory at the root level is found."""
        (tmp_path / "books").mkdir()
        assert find_books_dir(tmp_path) == tmp_path / "books"

    def test_find_books_dir_one_level_deep(self, tmp_path):
        """books/ directory inside a subfolder is found."""
        subdir = tmp_path / "archive"
        subdir.mkdir()
        (subdir / "books").mkdir()
        assert find_books_dir(tmp_path) == subdir / "books"

    def test_find_books_dir_returns_none(self, tmp_path):
        """No books/ directory returns None."""
        (tmp_path / "chapters").mkdir()
        assert find_books_dir(tmp_path) is None


class TestFindProjectRoot:
    """Tests for find_project_root()."""

    def test_find_project_root_by_manuscript(self, tmp_path):
        """Root with a manuscript/ directory is recognized as project root."""
        (tmp_path / "manuscript").mkdir()
        assert find_project_root(tmp_path) == tmp_path

    def test_find_project_root_by_metadata(self, tmp_path):
        """Root with config/metadata.yaml is recognized as project root."""
        (tmp_path / "config").mkdir()
        (tmp_path / "config" / "metadata.yaml").write_text("title: Test", encoding="utf-8")
        assert find_project_root(tmp_path) == tmp_path

    def test_find_project_root_one_level_deep(self, tmp_path):
        """Project root inside a subfolder (manuscript/ present) is found."""
        subdir = tmp_path / "my-book"
        subdir.mkdir()
        (subdir / "manuscript").mkdir()
        assert find_project_root(tmp_path) == subdir


# --- asset_utils ---


class TestClassifyAssetType:
    """Tests for _classify_asset_type()."""

    def test_classify_covers_folder(self):
        """Path inside covers/ folder is classified as 'cover'."""
        assert _classify_asset_type(Path("covers/book.png")) == "cover"

    def test_classify_figures_folder(self):
        """Path inside figures/ folder is classified as 'figure'."""
        assert _classify_asset_type(Path("figures/img.png")) == "figure"

    def test_classify_diagrams_subfolder(self):
        """Path inside figures/diagrams/ subfolder is classified as 'diagram'."""
        assert _classify_asset_type(Path("figures/diagrams/d.png")) == "diagram"

    def test_classify_unknown_folder(self):
        """Path inside an unknown folder defaults to 'figure'."""
        assert _classify_asset_type(Path("other/file.png")) == "figure"

    def test_classify_empty_path(self):
        """A bare filename with no folder defaults to 'figure'."""
        assert _classify_asset_type(Path("file.png")) == "figure"


# --- markdown_utils ---


class TestDetectChapterType:
    """Tests for detect_chapter_type()."""

    def test_detect_chapter_type_plain_chapter(self):
        """A numbered chapter stem maps to CHAPTER."""
        assert detect_chapter_type("01-chapter") == ChapterType.CHAPTER

    def test_detect_chapter_type_part_intro(self):
        """A part-intro stem maps to PART_INTRO."""
        assert detect_chapter_type("01-0-part-1-intro") == ChapterType.PART_INTRO

    def test_detect_chapter_type_interlude(self):
        """An interludium stem maps to INTERLUDE."""
        assert detect_chapter_type("05-1-interludium") == ChapterType.INTERLUDE

    def test_detect_chapter_type_unknown(self):
        """An unrecognized stem defaults to CHAPTER."""
        assert detect_chapter_type("random-name") == ChapterType.CHAPTER


class TestExtractTitle:
    """Tests for extract_title()."""

    def test_extract_title_from_h1(self):
        """An H1 heading in the content is extracted as the title."""
        content = "# My Title\nSome body text."
        assert extract_title(content, "fallback") == "My Title"

    def test_extract_title_fallback_from_stem(self):
        """Without an H1, the cleaned filename stem is used as fallback."""
        content = "No heading here, just text."
        result = extract_title(content, "01-my-chapter")
        assert result == "My Chapter"

    def test_extract_title_ignores_h2(self):
        """An H2 heading is not treated as a title; fallback is used instead."""
        content = "## Subtitle\nBody text."
        result = extract_title(content, "03-some-title")
        assert result == "Some Title"


class TestReadFileIfExists:
    """Tests for read_file_if_exists()."""

    def test_read_file_if_exists_returns_content(self, tmp_path):
        """An existing file with content returns its stripped text."""
        file_path = tmp_path / "note.md"
        file_path.write_text("Hello world", encoding="utf-8")
        assert read_file_if_exists(file_path) == "Hello world"

    def test_read_file_if_exists_returns_none_missing(self, tmp_path):
        """A non-existent file returns None."""
        assert read_file_if_exists(tmp_path / "missing.md") is None

    def test_read_file_if_exists_returns_none_empty(self, tmp_path):
        """A file with only whitespace returns None."""
        file_path = tmp_path / "blank.md"
        file_path.write_text("   \n  \n  ", encoding="utf-8")
        assert read_file_if_exists(file_path) is None


class TestMdToHtml:
    """Tests for md_to_html()."""

    def test_md_to_html_heading(self):
        """A markdown H1 heading is converted to an HTML h1 tag."""
        result = md_to_html("# Title")
        assert "<h1>Title</h1>" in result

    def test_md_to_html_empty(self):
        """An empty string returns an empty string."""
        assert md_to_html("") == ""
