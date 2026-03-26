"""Scaffold write-book-template directory structure from book data."""

import re
from pathlib import Path
from typing import Any

import yaml

from .tiptap_to_md import tiptap_to_markdown


def scaffold_project(book: dict[str, Any], chapters: list[dict[str, Any]], output_dir: Path) -> Path:
    """Create write-book-template directory structure for a book.

    Args:
        book: Book metadata dict (title, subtitle, author, language, etc.)
        chapters: List of chapter dicts (title, content as TipTap JSON, position).
        output_dir: Base directory to create project in.

    Returns:
        Path to the created project directory.
    """
    slug = _slugify(book["title"])
    project_dir = output_dir / slug

    # Create directory structure
    dirs = [
        "manuscript/chapters",
        "manuscript/front-matter",
        "manuscript/back-matter",
        "manuscript/figures",
        "manuscript/tables",
        "assets/covers",
        "assets/figures/diagrams",
        "assets/figures/infographics",
        "config",
        "output",
        "scripts",
    ]
    for d in dirs:
        (project_dir / d).mkdir(parents=True, exist_ok=True)

    # Write metadata.yaml
    _write_metadata(project_dir / "config" / "metadata.yaml", book)

    # Write chapters
    for chapter in chapters:
        _write_chapter(project_dir / "manuscript" / "chapters", chapter)

    # Write placeholder front-matter and back-matter
    _write_placeholder(project_dir / "manuscript" / "front-matter" / "toc.md", "# Table of Contents\n")
    _write_placeholder(project_dir / "manuscript" / "back-matter" / "about-the-author.md",
                       f"# About the Author\n\n{book.get('author', '')}\n")

    return project_dir


def _write_metadata(path: Path, book: dict[str, Any]) -> None:
    """Write config/metadata.yaml from book data."""
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


def _write_chapter(chapters_dir: Path, chapter: dict[str, Any]) -> None:
    """Write a single chapter as Markdown file."""
    position = chapter.get("position", 0)
    title = chapter.get("title", "Untitled")
    content = chapter.get("content", "")

    filename = f"{position:02d}-{_slugify(title)}.md"
    filepath = chapters_dir / filename

    # Convert content: TipTap JSON or plain text
    if isinstance(content, dict):
        md_body = tiptap_to_markdown(content)
    elif isinstance(content, str):
        # Try parsing as JSON
        try:
            import json
            doc = json.loads(content)
            if isinstance(doc, dict) and doc.get("type") == "doc":
                md_body = tiptap_to_markdown(doc)
            else:
                md_body = content
        except (json.JSONDecodeError, TypeError):
            md_body = content
    else:
        md_body = str(content)

    md = f"# {title}\n\n{md_body}\n"
    filepath.write_text(md, encoding="utf-8")


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
