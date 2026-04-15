"""Tests for pandoc_runner helper functions."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import yaml

from bibliogon_export.pandoc_runner import (
    MissingImagesError,
    PandocError,
    _find_output_file,
    _read_export_settings,
    _resolve_cover_path,
    _resolve_output_file,
    _resolve_section_order,
    _run_epubcheck,
)
from manuscripta import (
    ManuscriptaImageError,
    ManuscriptaLayoutError,
    ManuscriptaPandocError,
)
from manuscripta.enums.book_type import BookType


# --- _read_export_settings ---


class TestReadExportSettings:

    def test_returns_empty_dict_when_file_missing(self, tmp_path: Path):
        """Returns {} when config/export-settings.yaml does not exist."""
        result = _read_export_settings(tmp_path)
        assert result == {}

    def test_returns_parsed_yaml_when_file_exists(self, tmp_path: Path):
        """Parses and returns the YAML content."""
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        settings = {"section_order": {"ebook": ["chapters"]}, "toc_depth": 3}
        (config_dir / "export-settings.yaml").write_text(
            yaml.dump(settings), encoding="utf-8"
        )

        result = _read_export_settings(tmp_path)

        assert result == settings

    def test_returns_empty_dict_when_file_is_empty(self, tmp_path: Path):
        """Returns {} when the YAML file exists but is empty."""
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        (config_dir / "export-settings.yaml").write_text("", encoding="utf-8")

        result = _read_export_settings(tmp_path)

        assert result == {}


# --- _resolve_section_order ---


class TestResolveSectionOrder:

    def test_keeps_chapters_entry_always(self, tmp_path: Path):
        """The 'chapters' entry is always kept even without a matching file."""
        (tmp_path / "manuscript").mkdir()

        export_cfg = {"section_order": {"ebook": ["chapters"]}}
        result = _resolve_section_order(tmp_path, export_cfg, BookType.EBOOK, "epub")

        assert "chapters" in result

    def test_drops_entries_whose_md_file_does_not_exist(self, tmp_path: Path):
        """Entries whose .md file is missing under manuscript/ are filtered out."""
        manuscript = tmp_path / "manuscript"
        front_matter = manuscript / "front-matter"
        front_matter.mkdir(parents=True)
        (front_matter / "preface.md").touch()

        export_cfg = {
            "section_order": {
                "ebook": [
                    "front-matter/preface.md",
                    "front-matter/missing.md",
                    "chapters",
                ]
            }
        }
        result = _resolve_section_order(tmp_path, export_cfg, BookType.EBOOK, "epub")

        assert "front-matter/preface.md" in result
        assert "front-matter/missing.md" not in result
        assert "chapters" in result

    @patch("bibliogon_export.pandoc_runner.pick_section_order")
    def test_uses_pick_section_order_fallback(self, mock_pick, tmp_path: Path):
        """Falls back to pick_section_order when config has no section_order."""
        (tmp_path / "manuscript").mkdir()
        mock_pick.return_value = ["chapters"]

        result = _resolve_section_order(tmp_path, {}, BookType.EBOOK, "epub")

        mock_pick.assert_called_once_with(BookType.EBOOK, "epub")
        assert result == ["chapters"]


# --- _resolve_output_file ---


class TestResolveOutputFile:

    def test_uses_explicit_output_file_from_settings(self):
        """Uses export_defaults.output_file when set."""
        cfg = {"export_defaults": {"output_file": "my-book"}}
        assert _resolve_output_file(cfg, "fallback") == "my-book"

    def test_falls_back_to_project_dir_name_when_unset(self):
        """Falls back to the project directory name when output_file is missing."""
        assert _resolve_output_file({}, "fallback-name") == "fallback-name"

    def test_falls_back_when_output_file_is_empty_string(self):
        """Empty string is treated as unset."""
        cfg = {"export_defaults": {"output_file": ""}}
        assert _resolve_output_file(cfg, "fallback-name") == "fallback-name"


# --- run_pandoc exception narrowing ---


class TestRunPandocExceptionHandling:

    def _scaffold(self, tmp_path: Path) -> Path:
        proj = tmp_path / "proj"
        for d in ("manuscript", "config", "assets", "output"):
            (proj / d).mkdir(parents=True)
        return proj

    @patch("bibliogon_export.pandoc_runner.run_export")
    def test_image_error_becomes_missing_images_error(
        self, mock_run_export, tmp_path: Path
    ):
        """ManuscriptaImageError is narrowed to MissingImagesError with .unresolved."""
        from bibliogon_export.pandoc_runner import run_pandoc

        proj = self._scaffold(tmp_path)
        mock_run_export.side_effect = ManuscriptaImageError(
            ["assets/figures/missing.png", "assets/figures/also-missing.jpg"]
        )

        with pytest.raises(MissingImagesError) as exc_info:
            run_pandoc(proj, "pdf", {"settings": {}})

        assert exc_info.value.unresolved == [
            "assets/figures/missing.png",
            "assets/figures/also-missing.jpg",
        ]
        assert isinstance(exc_info.value.cause, ManuscriptaImageError)
        assert "missing.png" in str(exc_info.value)

    @patch("bibliogon_export.pandoc_runner.run_export")
    def test_pandoc_error_preserves_returncode_and_stderr(
        self, mock_run_export, tmp_path: Path
    ):
        """ManuscriptaPandocError attributes survive into PandocError.cause."""
        from bibliogon_export.pandoc_runner import run_pandoc

        proj = self._scaffold(tmp_path)
        mock_run_export.side_effect = ManuscriptaPandocError(
            returncode=1, stderr="latex: undefined control sequence", cmd=["pandoc", "..."]
        )

        with pytest.raises(PandocError) as exc_info:
            run_pandoc(proj, "pdf", {"settings": {}})

        assert isinstance(exc_info.value.cause, ManuscriptaPandocError)
        assert exc_info.value.cause.returncode == 1
        assert "undefined control sequence" in exc_info.value.cause.stderr

    @patch("bibliogon_export.pandoc_runner.run_export")
    def test_layout_error_becomes_pandoc_error(
        self, mock_run_export, tmp_path: Path
    ):
        """ManuscriptaLayoutError is wrapped without losing the .cause chain."""
        from bibliogon_export.pandoc_runner import run_pandoc

        proj = self._scaffold(tmp_path)
        mock_run_export.side_effect = ManuscriptaLayoutError(
            proj, missing=["manuscript", "config"]
        )

        with pytest.raises(PandocError) as exc_info:
            run_pandoc(proj, "pdf", {"settings": {}})

        assert isinstance(exc_info.value.cause, ManuscriptaLayoutError)
        assert not isinstance(exc_info.value, MissingImagesError)


# --- _resolve_cover_path ---


class TestResolveCoverPath:

    def test_returns_none_when_no_cover_found(self, tmp_path: Path):
        """Returns None when neither explicit nor fallback cover exists."""
        result = _resolve_cover_path(tmp_path, None)
        assert result is None

    def test_finds_cover_png_in_assets(self, tmp_path: Path):
        """Discovers cover.png via the fallback glob in assets/covers/."""
        covers_dir = tmp_path / "assets" / "covers"
        covers_dir.mkdir(parents=True)
        cover_file = covers_dir / "cover.png"
        cover_file.touch()

        result = _resolve_cover_path(tmp_path, None)

        assert result == str(cover_file)

    def test_uses_explicit_relative_cover_path(self, tmp_path: Path):
        """Uses an explicit relative cover_path when the file exists."""
        covers_dir = tmp_path / "assets" / "covers"
        covers_dir.mkdir(parents=True)
        custom_cover = covers_dir / "custom.jpg"
        custom_cover.touch()

        result = _resolve_cover_path(tmp_path, "assets/covers/custom.jpg")

        assert result == str(tmp_path / "assets" / "covers" / "custom.jpg")

    def test_uses_explicit_absolute_cover_path(self, tmp_path: Path):
        """Uses an explicit absolute cover_path when the file exists."""
        cover_file = tmp_path / "absolute_cover.png"
        cover_file.touch()

        result = _resolve_cover_path(tmp_path, str(cover_file))

        assert result == str(cover_file)


# --- _find_output_file ---


class TestFindOutputFile:

    def test_returns_path_when_output_file_exists(self, tmp_path: Path):
        """Returns the path when the output file is present."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        epub_file = output_dir / "my-book.epub"
        epub_file.touch()

        result = _find_output_file(tmp_path, "epub")

        assert result == epub_file

    def test_raises_pandoc_error_when_no_output_file(self, tmp_path: Path):
        """Raises PandocError when no output file matches the format."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()

        with pytest.raises(PandocError, match="No output file found"):
            _find_output_file(tmp_path, "epub")


# --- _run_epubcheck ---


class TestRunEpubcheck:

    @patch("shutil.which", return_value=None)
    def test_skips_when_epubcheck_not_found(self, _mock_which, tmp_path: Path):
        """Skips silently when epubcheck binary is not installed."""
        epub_path = tmp_path / "test.epub"
        epub_path.touch()

        # Should not raise
        _run_epubcheck(epub_path)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/bin/epubcheck")
    def test_logs_valid_when_returncode_zero(
        self, _mock_which, mock_run, tmp_path: Path
    ):
        """Logs valid message when epubcheck returns 0."""
        mock_run.return_value = MagicMock(returncode=0, stderr="", stdout="")
        epub_path = tmp_path / "test.epub"
        epub_path.touch()

        _run_epubcheck(epub_path)

        mock_run.assert_called_once()
        # No JSON report should be written for valid EPUBs
        assert not (tmp_path / "test.epubcheck.json").exists()

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/bin/epubcheck")
    def test_writes_json_report_on_errors(
        self, _mock_which, mock_run, tmp_path: Path
    ):
        """Writes a JSON report when epubcheck finds errors."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stderr="ERROR: some error\nWARNING: some warning\n",
            stdout="",
        )
        epub_path = tmp_path / "test.epub"
        epub_path.touch()

        _run_epubcheck(epub_path)

        report_path = epub_path.with_suffix(".epubcheck.json")
        assert report_path.exists()

        report = json.loads(report_path.read_text(encoding="utf-8"))
        assert report["valid"] is False
        assert report["error_count"] == 1
        assert report["warning_count"] == 1
        assert len(report["errors"]) == 1
        assert len(report["warnings"]) == 1
