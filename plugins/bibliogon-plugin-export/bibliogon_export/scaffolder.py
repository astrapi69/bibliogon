"""Scaffold write-book-template directory structure from book data.

Uses manuscripta's project structure and writes TipTap-JSON content as Markdown.
"""

import json
import re
import shutil
from pathlib import Path
from typing import Any

import yaml

from .tiptap_to_md import tiptap_to_markdown


def scaffold_project(
    book: dict[str, Any],
    chapters: list[dict[str, Any]],
    output_dir: Path,
    export_settings: dict[str, Any] | None = None,
    assets: list[dict[str, Any]] | None = None,
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

    # Copy assets and build path mapping
    asset_path_map = _copy_assets(project_dir, assets or [], book.get("id", ""))

    # Write config/metadata.yaml (manuscripta format)
    _write_metadata(project_dir / "config" / "metadata.yaml", book)

    # Ensure export_defaults has output_file set to the book slug
    if export_settings is None:
        export_settings = {}
    defaults = export_settings.setdefault("export_defaults", {})
    if not defaults.get("output_file"):
        defaults["output_file"] = slug

    # Write config/export-settings.yaml (manuscripta format) from plugin config
    _write_export_settings(project_dir / "config" / "export-settings.yaml", export_settings)

    # Write chapters to correct directories based on chapter_type
    # Rewrite image paths in all chapter content before writing
    for chapter in chapters:
        content = chapter.get("content", "")
        if isinstance(content, str) and "/api/books/" in content and "/assets/file/" in content:
            chapter["content"] = _rewrite_image_paths_for_export(content, asset_path_map)

    has_toc = False
    for chapter in chapters:
        ch_type = chapter.get("chapter_type", "chapter")
        if ch_type == "toc":
            has_toc = True
            _write_special_chapter(
                project_dir / "manuscript" / "front-matter",
                "toc", chapter,
            )
        elif ch_type in _FRONT_MATTER_TYPES:
            filename = _FRONT_MATTER_TYPES[ch_type]
            _write_special_chapter(
                project_dir / "manuscript" / "front-matter",
                filename, chapter,
            )
        elif ch_type in _BACK_MATTER_TYPES:
            filename = _BACK_MATTER_TYPES[ch_type]
            _write_special_chapter(
                project_dir / "manuscript" / "back-matter",
                filename, chapter,
            )
        else:
            _write_chapter(project_dir / "manuscript" / "chapters", chapter)

    # Write placeholder TOC only if no TOC chapter exists
    if not has_toc:
        _write_placeholder(
            project_dir / "manuscript" / "front-matter" / "toc.md",
            "# Table of Contents\n",
        )
    _write_placeholder(
        project_dir / "manuscript" / "back-matter" / "about-the-author.md",
        f"# About the Author\n\n{book.get('author', '')}\n",
    )

    return project_dir


# Chapter type to filename mapping for front/back matter
_FRONT_MATTER_TYPES: dict[str, str] = {
    "preface": "preface",
    "foreword": "foreword",
}

_BACK_MATTER_TYPES: dict[str, str] = {
    "about_author": "about-the-author",
    "appendix": "appendix",
    "bibliography": "bibliography",
    "glossary": "glossary",
    "epilogue": "epilogue",
    "imprint": "imprint",
    "next_in_series": "next-in-series",
    "acknowledgments": "acknowledgments",
}


def _write_special_chapter(target_dir: Path, filename: str, chapter: dict[str, Any]) -> None:
    """Write a front-matter or back-matter chapter as Markdown file."""
    title = chapter.get("title", "Untitled")
    content = chapter.get("content", "")
    md_body = _content_to_markdown(content)
    md = _prepend_title(title, md_body)
    filepath = target_dir / f"{filename}.md"
    filepath.write_text(md, encoding="utf-8")


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
        # Pandoc expects YAML document markers (---) in metadata files
        f.write("---\n")
        yaml.dump(metadata, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        f.write("---\n")


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

    md = _prepend_title(title, md_body)
    filepath.write_text(md, encoding="utf-8")


def _prepend_title(title: str, md_body: str) -> str:
    """Prepend H1 title only if content doesn't already start with one."""
    stripped = md_body.lstrip()
    if stripped.startswith("# ") or stripped.startswith("<h1"):
        return f"{md_body}\n"
    return f"# {title}\n\n{md_body}\n"


def _content_to_markdown(content: Any) -> str:
    """Convert content (TipTap JSON, JSON string, HTML, or plain text) to Markdown."""
    if isinstance(content, dict):
        return tiptap_to_markdown(content)

    if isinstance(content, str):
        try:
            doc = json.loads(content)
            if isinstance(doc, dict) and doc.get("type") == "doc":
                return tiptap_to_markdown(doc)
        except (json.JSONDecodeError, TypeError):
            pass
        # If content is HTML, convert to markdown
        if content.strip().startswith("<"):
            return _html_to_markdown(content)
        return content

    return str(content)


def _html_to_markdown(html: str) -> str:
    """Convert HTML back to Markdown for export."""
    text = html
    # Headings
    for level in range(6, 0, -1):
        prefix = "#" * level
        text = re.sub(
            rf"<h{level}[^>]*>(.*?)</h{level}>",
            rf"{prefix} \1",
            text,
            flags=re.DOTALL,
        )
    # Bold / italic
    text = re.sub(r"<strong>(.*?)</strong>", r"**\1**", text)
    text = re.sub(r"<em>(.*?)</em>", r"*\1*", text)
    # Links
    text = re.sub(r'<a\s+href="([^"]*)"[^>]*>(.*?)</a>', r"[\2](\1)", text)
    # Images
    text = re.sub(r'<img\s+src="([^"]*)"(?:\s+alt="([^"]*)")?[^>]*/?\s*>', r"![\2](\1)", text)
    # Lists
    text = re.sub(r"<li>\s*<p>(.*?)</p>\s*</li>", r"- \1", text, flags=re.DOTALL)
    text = re.sub(r"<li>(.*?)</li>", r"- \1", text, flags=re.DOTALL)
    # Blockquote
    text = re.sub(r"<blockquote>\s*<p>(.*?)</p>\s*</blockquote>", r"> \1", text, flags=re.DOTALL)
    # Code
    text = re.sub(r"<code>(.*?)</code>", r"`\1`", text)
    # Paragraphs
    text = re.sub(r"<p>(.*?)</p>", r"\1\n", text, flags=re.DOTALL)
    # Horizontal rule (use *** not --- to avoid YAML front matter confusion)
    text = re.sub(r"<hr\s*/?>", "***", text)
    # Strip remaining tags
    text = re.sub(r"</?(?:ul|ol|div|span|br\s*/?)>", "", text)
    # Clean up whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


_ASSET_TYPE_TO_DIR = {
    "cover": "assets/covers",
    "figure": "assets/figures",
    "diagram": "assets/figures/diagrams",
    "table": "assets/figures",
}


def _copy_assets(
    project_dir: Path,
    assets: list[dict[str, Any]],
    book_id: str,
) -> dict[str, str]:
    """Copy asset files into the project and return a filename -> relative path map."""
    path_map: dict[str, str] = {}
    for asset in assets:
        filename = asset["filename"]
        asset_type = asset.get("asset_type", "figure")
        src = Path(asset["path"])
        if not src.exists():
            continue

        rel_dir = _ASSET_TYPE_TO_DIR.get(asset_type, "assets/figures")
        dest_dir = project_dir / rel_dir
        dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest_dir / filename)
        path_map[filename] = f"{rel_dir}/{filename}"

    return path_map


def _rewrite_image_paths_for_export(content: str, asset_path_map: dict[str, str]) -> str:
    """Rewrite /api/books/{id}/assets/file/{name} back to relative asset paths."""
    def replace_src(match: re.Match) -> str:
        src = match.group(1)
        # Extract filename from API path
        if "/assets/file/" in src:
            filename = src.rsplit("/", 1)[-1]
            if filename in asset_path_map:
                return f'src="{asset_path_map[filename]}"'
        return match.group(0)

    return re.sub(r'src="([^"]+)"', replace_src, content)


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
