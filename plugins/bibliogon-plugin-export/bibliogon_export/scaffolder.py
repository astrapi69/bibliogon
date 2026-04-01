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
        # <figure><img/><figcaption> is preserved natively from import
        if content.strip().startswith("<"):
            return _html_to_markdown(content)
        return content

    return str(content)


def _html_to_markdown(html: str) -> str:
    """Convert HTML back to Markdown for export using an element-based parser."""
    from html.parser import HTMLParser

    class _MD(HTMLParser):
        def __init__(self):
            super().__init__()
            self.out: list[str] = []
            self.list_depth = 0
            self.li_text: list[str] = []  # text content of current <li>
            self.li_flushed = False  # whether current <li> text was already written
            self.tag_stack: list[str] = []

        def _buf(self) -> list[str]:
            """Return current write buffer: li_text if inside <li>, else out."""
            return self.li_text if "li" in self.tag_stack else self.out

        def _flush_li(self):
            """Flush the current <li> text before nested list starts."""
            if self.li_flushed or not self.li_text:
                return
            indent = "  " * max(0, self.list_depth - 1)
            text = "".join(self.li_text).strip()
            if text:
                self.out.append(f"{indent}- {text}\n")
            self.li_text = []
            self.li_flushed = True

        def handle_starttag(self, tag, attrs):
            self.tag_stack.append(tag)
            a = dict(attrs)
            if tag in ("ul", "ol"):
                # Flush parent <li> before starting nested list
                if self.list_depth > 0:
                    self._flush_li()
                self.list_depth += 1
            elif tag == "li":
                self.li_text = []
                self.li_flushed = False
            elif tag == "a":
                self._buf().append("[")
                self._href = a.get("href", "")
            elif tag == "figure":
                self._in_figure = True
                self._figure_buf: list[str] = []
            elif tag == "figcaption":
                self._in_figcaption = True
                self._figcaption_buf: list[str] = []
            elif tag == "img":
                src = a.get("src", "")
                alt = a.get("alt", "")
                img_html = f'  <img src="{src}" alt="{alt}" />'
                if getattr(self, "_in_figure", False):
                    self._figure_buf.append(img_html)
                else:
                    self._buf().append(f'\n<figure>\n{img_html}\n</figure>\n')
            elif tag == "br":
                self._buf().append("  \n")
            elif tag == "hr":
                self.out.append("\n***\n")
            elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
                self.out.append(f"\n{'#' * int(tag[1])} ")

        def handle_endtag(self, tag):
            if self.tag_stack and self.tag_stack[-1] == tag:
                self.tag_stack.pop()
            if tag in ("ul", "ol"):
                self.list_depth -= 1
            elif tag == "li":
                if not self.li_flushed:
                    self._flush_li()
                self.li_text = []
                self.li_flushed = False
            elif tag == "a":
                href = getattr(self, "_href", "")
                self._buf().append(f"]({href})")
            elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
                self.out.append("\n")
            elif tag == "figure":
                fig = "\n<figure>\n" + "\n".join(getattr(self, "_figure_buf", [])) + "\n</figure>\n"
                self.out.append(fig)
                self._in_figure = False
            elif tag == "figcaption":
                caption = "".join(getattr(self, "_figcaption_buf", [])).strip()
                if getattr(self, "_in_figure", False):
                    self._figure_buf.append(f"  <figcaption>\n    {caption}\n  </figcaption>")
                self._in_figcaption = False
            elif tag == "p":
                if "li" not in self.tag_stack:
                    self.out.append("\n")

        def handle_data(self, data):
            if getattr(self, "_in_figcaption", False):
                self._figcaption_buf.append(data)
                return
            buf = self._buf()
            if "strong" in self.tag_stack:
                buf.append(f"**{data}**")
            elif "em" in self.tag_stack:
                buf.append(f"*{data}*")
            elif "blockquote" in self.tag_stack and "p" in self.tag_stack:
                buf.append(f"> {data}")
            elif "code" in self.tag_stack:
                buf.append(f"`{data}`")
            else:
                buf.append(data)

    parser = _MD()
    parser.feed(html)
    text = "".join(parser.out)
    # Clean up extra blank lines
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
