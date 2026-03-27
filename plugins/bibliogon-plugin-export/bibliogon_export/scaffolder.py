"""Scaffold write-book-template directory structure from book data.

Uses manuscripta's project structure and writes TipTap-JSON content as Markdown.
"""

import json
import re
from pathlib import Path
from typing import Any

import yaml

from .tiptap_to_md import tiptap_to_markdown


def scaffold_project(
    book: dict[str, Any],
    chapters: list[dict[str, Any]],
    output_dir: Path,
    export_settings: dict[str, Any] | None = None,
) -> Path:
    """Create manuscripta-compatible project structure for a book.

    Creates the standard directory layout that manuscripta expects,
    writes metadata.yaml, export-settings.yaml, and converts all
    chapters from TipTap-JSON to Markdown.

    Args:
        book: Book metadata dict (title, subtitle, author, language, etc.)
        chapters: List of chapter dicts (title, content as TipTap JSON, position).
        output_dir: Base directory to create project in.

    Returns:
        Path to the created project directory.
    """
    slug = _slugify(book["title"])
    project_dir = output_dir / slug

    # Create manuscripta directory structure
    dirs = [
        "manuscript/chapters",
        "manuscript/front-matter",
        "manuscript/back-matter",
        "assets/covers",
        "assets/author",
        "assets/figures/diagrams",
        "assets/figures/infographics",
        "config",
        "output",
    ]
    for d in dirs:
        (project_dir / d).mkdir(parents=True, exist_ok=True)

    # Write config/metadata.yaml (manuscripta format)
    _write_metadata(project_dir / "config" / "metadata.yaml", book)

    # Write config/export-settings.yaml (manuscripta format) from plugin config
    _write_export_settings(project_dir / "config" / "export-settings.yaml", export_settings)

    # Write chapters as Markdown
    for chapter in chapters:
        _write_chapter(project_dir / "manuscript" / "chapters", chapter)

    # Write placeholder front-matter and back-matter
    _write_placeholder(
        project_dir / "manuscript" / "front-matter" / "toc.md",
        "# Table of Contents\n",
    )
    _write_placeholder(
        project_dir / "manuscript" / "back-matter" / "about-the-author.md",
        f"# About the Author\n\n{book.get('author', '')}\n",
    )

    return project_dir


def _write_metadata(path: Path, book: dict[str, Any]) -> None:
    """Write config/metadata.yaml in manuscripta format."""
    metadata: dict[str, Any] = {
        "title": book["title"],
        "author": book.get("author", ""),
        "lang": book.get("language", "de"),
    }
    if book.get("subtitle"):
        metadata["subtitle"] = book["subtitle"]
    if book.get("series"):
        metadata["series"] = book["series"]
    if book.get("series_index") is not None:
        metadata["series_index"] = book["series_index"]
    if book.get("description"):
        metadata["description"] = book["description"]

    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(metadata, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def _write_export_settings(path: Path, export_settings: dict[str, Any] | None = None) -> None:
    """Write config/export-settings.yaml in manuscripta format.

    Uses the plugin config settings if provided, otherwise sensible defaults.
    """
    # Write the export settings directly from plugin config if available.
    # This is a 1:1 pass-through to manuscripta's export-settings.yaml format.
    if export_settings:
        # Only write manuscripta-relevant keys (exclude plugin-only keys)
        manuscripta_keys = [
            "formats", "toc_depth", "epub_skip_toc_files",
            "section_order", "export_defaults",
        ]
        settings = {k: v for k, v in export_settings.items() if k in manuscripta_keys}
    else:
        settings = {
            "formats": {
                "markdown": "gfm",
                "pdf": "pdf",
                "epub": "epub",
                "docx": "docx",
                "html": "html",
            },
            "toc_depth": 2,
            "section_order": {
                "ebook": [
                    "front-matter/toc.md",
                    "front-matter/foreword.md",
                    "front-matter/preface.md",
                    "chapters",
                    "back-matter/epilogue.md",
                    "back-matter/glossary.md",
                    "back-matter/appendix.md",
                    "back-matter/acknowledgments.md",
                    "back-matter/about-the-author.md",
                    "back-matter/bibliography.md",
                    "back-matter/imprint.md",
                ],
            },
        }

    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(settings, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def _write_chapter(chapters_dir: Path, chapter: dict[str, Any]) -> None:
    """Write a single chapter as Markdown file."""
    position = chapter.get("position", 0)
    title = chapter.get("title", "Untitled")
    content = chapter.get("content", "")

    filename = f"{position + 1:02d}-{_slugify(title)}.md"
    filepath = chapters_dir / filename

    md_body = _content_to_markdown(content)

    md = f"# {title}\n\n{md_body}\n"
    filepath.write_text(md, encoding="utf-8")


def _content_to_markdown(content: Any) -> str:
    """Convert content (TipTap JSON, JSON string, or plain text) to Markdown."""
    if isinstance(content, dict):
        return tiptap_to_markdown(content)

    if isinstance(content, str):
        try:
            doc = json.loads(content)
            if isinstance(doc, dict) and doc.get("type") == "doc":
                return tiptap_to_markdown(doc)
        except (json.JSONDecodeError, TypeError):
            pass
        return content

    return str(content)


def _write_placeholder(path: Path, content: str) -> None:
    """Write a placeholder file if it does not exist."""
    if not path.exists():
        path.write_text(content, encoding="utf-8")


def _slugify(text: str) -> str:
    """Convert text to a filesystem-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[äÄ]", "ae", text)
    text = re.sub(r"[öÖ]", "oe", text)
    text = re.sub(r"[üÜ]", "ue", text)
    text = re.sub(r"[ß]", "ss", text)
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")
