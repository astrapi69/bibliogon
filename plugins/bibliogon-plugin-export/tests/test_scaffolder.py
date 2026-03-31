"""Tests for write-book-template scaffolder."""

import json
from pathlib import Path

import yaml

from bibliogon_export.scaffolder import scaffold_project


class TestScaffolder:

    def _sample_book(self) -> dict:
        return {
            "title": "Mein Testbuch",
            "subtitle": "Ein Untertitel",
            "author": "Test Author",
            "language": "de",
            "series": "Testserie",
            "series_index": 1,
            "description": "Ein Testbuch",
        }

    def _sample_chapters(self) -> list[dict]:
        return [
            {
                "title": "Erstes Kapitel",
                "content": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "heading",
                            "attrs": {"level": 2},
                            "content": [{"type": "text", "text": "Abschnitt 1"}],
                        },
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "Es war einmal..."}],
                        },
                    ],
                },
                "position": 1,
            },
            {
                "title": "Zweites Kapitel",
                "content": "Einfacher Text als Fallback",
                "position": 2,
            },
        ]

    def test_creates_directory_structure(self, tmp_path: Path) -> None:
        project_dir = scaffold_project(self._sample_book(), self._sample_chapters(), tmp_path)

        assert project_dir.exists()
        assert (project_dir / "manuscript" / "chapters").is_dir()
        assert (project_dir / "manuscript" / "front-matter").is_dir()
        assert (project_dir / "manuscript" / "back-matter").is_dir()
        assert (project_dir / "assets" / "covers").is_dir()
        assert (project_dir / "assets" / "figures" / "diagrams").is_dir()
        assert (project_dir / "config").is_dir()
        assert (project_dir / "output").is_dir()

    def test_writes_metadata_yaml(self, tmp_path: Path) -> None:
        book = self._sample_book()
        project_dir = scaffold_project(book, [], tmp_path)

        metadata_path = project_dir / "config" / "metadata.yaml"
        assert metadata_path.exists()

        # metadata.yaml has --- delimiters for Pandoc, use safe_load_all to handle
        docs = list(yaml.safe_load_all(metadata_path.read_text()))
        metadata = docs[0]
        assert metadata["title"] == "Mein Testbuch"
        assert metadata["subtitle"] == "Ein Untertitel"
        assert metadata["author"] == "Test Author"
        assert metadata["lang"] == "de"
        assert metadata["series"] == "Testserie"
        assert metadata["series_index"] == 1

    def test_writes_chapter_files(self, tmp_path: Path) -> None:
        project_dir = scaffold_project(
            self._sample_book(), self._sample_chapters(), tmp_path
        )

        chapters_dir = project_dir / "manuscript" / "chapters"
        files = sorted(chapters_dir.glob("*.md"))
        assert len(files) == 2

        # First chapter (TipTap JSON content)
        ch1 = files[0].read_text()
        assert ch1.startswith("# Erstes Kapitel")
        assert "## Abschnitt 1" in ch1
        assert "Es war einmal..." in ch1

        # Second chapter (plain text fallback)
        ch2 = files[1].read_text()
        assert ch2.startswith("# Zweites Kapitel")
        assert "Einfacher Text als Fallback" in ch2

    def test_chapter_filenames_use_position_and_slug(self, tmp_path: Path) -> None:
        project_dir = scaffold_project(
            self._sample_book(), self._sample_chapters(), tmp_path
        )

        chapters_dir = project_dir / "manuscript" / "chapters"
        files = sorted(f.name for f in chapters_dir.glob("*.md"))
        assert files[0] == "02-erstes-kapitel.md"
        assert files[1] == "03-zweites-kapitel.md"

    def test_writes_placeholder_files(self, tmp_path: Path) -> None:
        project_dir = scaffold_project(self._sample_book(), [], tmp_path)

        toc = project_dir / "manuscript" / "front-matter" / "toc.md"
        assert toc.exists()

        about = project_dir / "manuscript" / "back-matter" / "about-the-author.md"
        assert about.exists()
        assert "Test Author" in about.read_text()

    def test_project_dir_uses_slugified_title(self, tmp_path: Path) -> None:
        book = {"title": "Mein Buecher-Test", "author": "Author"}
        project_dir = scaffold_project(book, [], tmp_path)
        assert project_dir.name == "mein-buecher-test"

    def test_umlaut_slugification(self, tmp_path: Path) -> None:
        book = {"title": "Aeusserst ueble Oeffnung", "author": "Author"}
        project_dir = scaffold_project(book, [], tmp_path)
        # ae, ue, oe handling
        assert "ae" in project_dir.name or "oe" in project_dir.name

    def test_chapter_with_json_string_content(self, tmp_path: Path) -> None:
        """Test that JSON string content is parsed correctly."""
        tiptap_json = json.dumps({
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "JSON string content"}],
                }
            ],
        })
        chapters = [{"title": "Test", "content": tiptap_json, "position": 1}]
        project_dir = scaffold_project({"title": "Test", "author": "A"}, chapters, tmp_path)

        ch_file = list((project_dir / "manuscript" / "chapters").glob("*.md"))[0]
        assert "JSON string content" in ch_file.read_text()
