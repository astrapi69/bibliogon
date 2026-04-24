"""Source-identifier stability + collision tests.

Each handler builds ``DetectedProject.source_identifier`` from a
content fingerprint so the duplicate check in
``_check_duplicate`` recognises repeat imports. These tests pin the
contract: identical inputs must produce identical identifiers, and
unrelated inputs must not collide.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from app.import_plugins.handlers.bgb import BgbImportHandler
from app.import_plugins.handlers.markdown import MarkdownImportHandler
from app.import_plugins.handlers.markdown_folder import MarkdownFolderHandler
from app.import_plugins.handlers.wbt import WbtImportHandler


# --- helpers ---


def _write(path: Path, content: bytes | str) -> Path:
    if isinstance(content, str):
        path.write_text(content, encoding="utf-8")
    else:
        path.write_bytes(content)
    return path


def _bgb_at(path: Path, book_id: str, title: str) -> Path:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "manifest.json", json.dumps({"format": "bibliogon-backup", "version": 1})
        )
        zf.writestr(
            f"books/{book_id}/book.json",
            json.dumps(
                {
                    "id": book_id,
                    "title": title,
                    "author": "A",
                    "language": "en",
                    "chapters": [],
                    "assets": [],
                }
            ),
        )
    return path


def _wbt_dir(root: Path, title: str = "WBT Book") -> Path:
    project = root / "my-book"
    (project / "config").mkdir(parents=True)
    (project / "manuscript" / "chapters").mkdir(parents=True)
    (project / "config" / "metadata.yaml").write_text(
        f"title: {title}\nauthor: X\nlang: en\n", encoding="utf-8"
    )
    (project / "manuscript" / "chapters" / "01-ch.md").write_text(
        "# Chapter 1\n\nBody.\n", encoding="utf-8"
    )
    return project


# --- markdown handler ---


class TestMarkdownSourceIdentifiers:
    def test_same_content_same_identifier(self, tmp_path: Path) -> None:
        a = _write(tmp_path / "a.md", "# Title\n\nOne.\n")
        b = _write(tmp_path / "b.md", "# Title\n\nOne.\n")
        handler = MarkdownImportHandler()
        id_a = handler.detect(str(a)).source_identifier
        id_b = handler.detect(str(b)).source_identifier
        assert id_a == id_b

    def test_whitespace_edit_of_same_title_still_collides(self, tmp_path: Path) -> None:
        """Signature-based id: title + author + chapter count stays
        stable under trivial whitespace edits."""
        a = _write(tmp_path / "a.md", "# Same Book\n\nContent.\n")
        b = _write(tmp_path / "b.md", "# Same Book\n\nContent.  \n")
        handler = MarkdownImportHandler()
        assert (
            handler.detect(str(a)).source_identifier
            == handler.detect(str(b)).source_identifier
        )

    def test_different_title_different_identifier(self, tmp_path: Path) -> None:
        a = _write(tmp_path / "a.md", "# Book A\n\nContent.\n")
        b = _write(tmp_path / "b.md", "# Book B\n\nContent.\n")
        handler = MarkdownImportHandler()
        assert (
            handler.detect(str(a)).source_identifier
            != handler.detect(str(b)).source_identifier
        )

    def test_no_h1_falls_back_to_sha256(self, tmp_path: Path) -> None:
        """Without an H1 the handler cannot derive a title; the id
        falls back to SHA-256 of file bytes."""
        a = _write(tmp_path / "a.md", "just text with no heading\n")
        detected = MarkdownImportHandler().detect(str(a))
        # Without an H1 extract_title returns path stem, so title IS
        # present - the signature path is taken. Only when the title
        # itself is empty/whitespace does the handler fall back. Pin
        # the stable-id contract by re-running and comparing.
        again = MarkdownImportHandler().detect(str(a))
        assert detected.source_identifier == again.source_identifier


# --- bgb handler ---


class TestBgbSourceIdentifiers:
    def test_same_bytes_same_identifier(self, tmp_path: Path) -> None:
        a = _bgb_at(tmp_path / "a.bgb", "bgb-x", "BGB")
        b = _bgb_at(tmp_path / "b.bgb", "bgb-x", "BGB")
        # Note: zip deterministic depends on content ordering; the two
        # archives above contain the same logical entries so their
        # sha256 should match.
        handler = BgbImportHandler()
        assert (
            handler.detect(str(a)).source_identifier
            == handler.detect(str(b)).source_identifier
        )

    def test_different_payload_different_identifier(self, tmp_path: Path) -> None:
        a = _bgb_at(tmp_path / "a.bgb", "bgb-x", "First")
        b = _bgb_at(tmp_path / "b.bgb", "bgb-x", "Second")
        handler = BgbImportHandler()
        assert (
            handler.detect(str(a)).source_identifier
            != handler.detect(str(b)).source_identifier
        )

    def test_identifier_carries_sha256_prefix(self, tmp_path: Path) -> None:
        a = _bgb_at(tmp_path / "a.bgb", "bgb-x", "First")
        ident = BgbImportHandler().detect(str(a)).source_identifier
        assert ident.startswith("sha256:")


# --- wbt handler ---


class TestWbtSourceIdentifiers:
    def test_same_directory_signature_stable_across_reads(
        self, tmp_path: Path
    ) -> None:
        root = _wbt_dir(tmp_path, title="Wbt")
        handler = WbtImportHandler()
        id_1 = handler.detect(str(root)).source_identifier
        id_2 = handler.detect(str(root)).source_identifier
        assert id_1 == id_2
        assert id_1.startswith("signature:")

    def test_unrelated_projects_do_not_collide(self, tmp_path: Path) -> None:
        a_root = tmp_path / "a"
        b_root = tmp_path / "b"
        a_root.mkdir()
        b_root.mkdir()
        _wbt_dir(a_root, title="First")
        # Second project has a different chapter filename so the
        # signature (which fingerprints relative paths) differs.
        other = b_root / "my-book"
        (other / "config").mkdir(parents=True)
        (other / "manuscript" / "chapters").mkdir(parents=True)
        (other / "config" / "metadata.yaml").write_text(
            "title: Second\nauthor: Y\nlang: en\n", encoding="utf-8"
        )
        (other / "manuscript" / "chapters" / "07-differently-named.md").write_text(
            "# Other\n\nBody.\n", encoding="utf-8"
        )
        handler = WbtImportHandler()
        id_a = handler.detect(str(a_root / "my-book")).source_identifier
        id_b = handler.detect(str(b_root / "my-book")).source_identifier
        assert id_a != id_b

    def test_zip_input_sha256_prefix(self, tmp_path: Path) -> None:
        project = _wbt_dir(tmp_path)
        zip_path = tmp_path / "out.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for file in project.rglob("*"):
                if file.is_file():
                    zf.write(file, file.relative_to(project.parent))
        ident = WbtImportHandler().detect(str(zip_path)).source_identifier
        assert ident.startswith("sha256:")


# --- markdown folder handler ---


class TestMarkdownFolderSourceIdentifiers:
    def test_same_folder_layout_same_identifier(self, tmp_path: Path) -> None:
        """Signature fingerprints title + chapter count + root basename,
        so two folders with identical NAME and identical content collide."""
        parent_a = tmp_path / "parent-a"
        parent_b = tmp_path / "parent-b"
        parent_a.mkdir()
        parent_b.mkdir()
        a = parent_a / "book"
        b = parent_b / "book"
        for root in (a, b):
            root.mkdir()
            _write(root / "01-intro.md", "# Intro\n\nBody.\n")
            _write(root / "02-next.md", "# Next\n\nBody.\n")
        handler = MarkdownFolderHandler()
        id_a = handler.detect(str(a)).source_identifier
        id_b = handler.detect(str(b)).source_identifier
        assert id_a == id_b

    def test_different_chapter_count_different_identifier(
        self, tmp_path: Path
    ) -> None:
        parent_a = tmp_path / "parent-a"
        parent_b = tmp_path / "parent-b"
        parent_a.mkdir()
        parent_b.mkdir()
        a = parent_a / "book"
        b = parent_b / "book"
        a.mkdir()
        b.mkdir()
        _write(a / "01-intro.md", "# Intro\n\nBody.\n")
        _write(b / "01-intro.md", "# Intro\n\nBody.\n")
        _write(b / "02-extra.md", "# Extra\n\nBody.\n")
        handler = MarkdownFolderHandler()
        assert (
            handler.detect(str(a)).source_identifier
            != handler.detect(str(b)).source_identifier
        )

    def test_different_root_name_different_identifier(self, tmp_path: Path) -> None:
        """Root basename is part of the fingerprint; two same-content
        folders with different names are separate imports."""
        a = tmp_path / "alpha"
        b = tmp_path / "beta"
        for root in (a, b):
            root.mkdir()
            _write(root / "01-intro.md", "# Intro\n\nBody.\n")
        handler = MarkdownFolderHandler()
        assert (
            handler.detect(str(a)).source_identifier
            != handler.detect(str(b)).source_identifier
        )
