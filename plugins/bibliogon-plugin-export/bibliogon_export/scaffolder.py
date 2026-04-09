"""Scaffold write-book-template directory structure from book data.

Uses manuscripta's project structure and writes TipTap-JSON content as Markdown.
"""

import json
import re
import shutil
from pathlib import Path
from typing import Any

import yaml

from .html_to_markdown import html_to_markdown
from .tiptap_to_md import tiptap_to_markdown


# --- Top-level entry point ---


def scaffold_project(
    book: dict[str, Any],
    chapters: list[dict[str, Any]],
    output_dir: Path,
    export_settings: dict[str, Any] | None = None,
    assets: list[dict[str, Any]] | None = None,
) -> Path:
    """Create a manuscripta-compatible project structure for a book.

    Creates the standard directory layout, writes ``metadata.yaml`` and
    ``export-settings.yaml``, and converts all chapters from TipTap-JSON
    to Markdown into the right front/back/chapter directory.

    Args:
        book: Book metadata dict (title, subtitle, author, language, ...).
        chapters: List of chapter dicts (title, content, position, type).
        output_dir: Parent directory; the project is created underneath as
            a slugified subdir.
        export_settings: Optional plugin export settings (passed through to
            manuscripta's ``export-settings.yaml`` 1:1).
        assets: Optional list of asset dicts to copy into the project.

    Returns:
        Path to the created project directory.
    """
    slug = _slugify(book["title"])
    project_dir = _create_project_skeleton(output_dir / slug)

    asset_path_map = _copy_assets(project_dir, assets or [], book.get("id", ""))
    _rewrite_chapter_image_paths(chapters, asset_path_map)

    _write_metadata(project_dir / "config" / "metadata.yaml", book)
    _write_export_settings(
        project_dir / "config" / "export-settings.yaml",
        _ensure_output_file(export_settings, slug),
    )

    has_toc = _write_partitioned_chapters(project_dir / "manuscript", chapters)
    _write_placeholders(project_dir, book, has_toc)
    _write_styles_css(project_dir / "config" / "styles.css", book.get("custom_css"))

    return project_dir


# --- scaffold_project step helpers ---


def _create_project_skeleton(project_dir: Path) -> Path:
    """Create the manuscripta directory layout under ``project_dir``."""
    dirs = (
        "manuscript/chapters",
        "manuscript/front-matter",
        "manuscript/back-matter",
        "assets/covers",
        "assets/author",
        "assets/figures/diagrams",
        "assets/figures/infographics",
        "config",
        "output",
    )
    for d in dirs:
        (project_dir / d).mkdir(parents=True, exist_ok=True)
    return project_dir


def _ensure_output_file(
    export_settings: dict[str, Any] | None,
    slug: str,
) -> dict[str, Any]:
    """Return a settings dict with ``export_defaults.output_file`` set."""
    settings = dict(export_settings) if export_settings else {}
    defaults = settings.setdefault("export_defaults", {})
    if not defaults.get("output_file"):
        defaults["output_file"] = slug
    return settings


def _rewrite_chapter_image_paths(
    chapters: list[dict[str, Any]],
    asset_path_map: dict[str, str],
) -> None:
    """In-place rewrite ``/api/books/.../assets/file/...`` -> relative paths."""
    for chapter in chapters:
        content = chapter.get("content", "")
        if not isinstance(content, str):
            continue
        if "/api/books/" not in content or "/assets/file/" not in content:
            continue
        chapter["content"] = _rewrite_image_paths_for_export(content, asset_path_map)


def _write_partitioned_chapters(
    manuscript_dir: Path,
    chapters: list[dict[str, Any]],
) -> bool:
    """Dispatch each chapter into front-matter, back-matter or chapters/.

    Returns ``True`` if at least one chapter of type ``toc`` was written.
    """
    front_dir = manuscript_dir / "front-matter"
    back_dir = manuscript_dir / "back-matter"
    chapters_dir = manuscript_dir / "chapters"

    has_toc = False
    for chapter in chapters:
        ch_type = chapter.get("chapter_type", "chapter")
        if ch_type == "toc":
            has_toc = True
            _write_special_chapter(front_dir, "toc", chapter)
        elif ch_type in _FRONT_MATTER_TYPES:
            _write_special_chapter(front_dir, _FRONT_MATTER_TYPES[ch_type], chapter)
        elif ch_type in _BACK_MATTER_TYPES:
            _write_special_chapter(back_dir, _BACK_MATTER_TYPES[ch_type], chapter)
        else:
            _write_chapter(chapters_dir, chapter)
    return has_toc


def _write_placeholders(project_dir: Path, book: dict[str, Any], has_toc: bool) -> None:
    """Write the default TOC and about-the-author placeholders if missing."""
    if not has_toc:
        _write_placeholder(
            project_dir / "manuscript" / "front-matter" / "toc.md",
            "# Table of Contents\n",
        )
    _write_placeholder(
        project_dir / "manuscript" / "back-matter" / "about-the-author.md",
        f"# About the Author\n\n{book.get('author', '')}\n",
    )


def _write_styles_css(path: Path, custom_css: str | None) -> None:
    """Write default chapter-type CSS plus the book's custom CSS append."""
    css_parts = [_DEFAULT_CHAPTER_TYPE_CSS]
    if custom_css:
        css_parts.append(f"\n/* Custom CSS from book settings */\n{custom_css}\n")
    path.write_text("\n".join(css_parts), encoding="utf-8")


# Chapter type to filename mapping for front/back matter
_FRONT_MATTER_TYPES: dict[str, str] = {
    "dedication": "dedication",
    "epigraph": "epigraph",
    "preface": "preface",
    "foreword": "foreword",
    "prologue": "prologue",
    "introduction": "introduction",
}

_BACK_MATTER_TYPES: dict[str, str] = {
    "epilogue": "epilogue",
    "afterword": "afterword",
    "about_author": "about-the-author",
    "acknowledgments": "acknowledgments",
    "appendix": "appendix",
    "bibliography": "bibliography",
    "endnotes": "endnotes",
    "glossary": "glossary",
    "index": "index",
    "imprint": "imprint",
    "next_in_series": "next-in-series",
}


_DEFAULT_CHAPTER_TYPE_CSS = """\
/* Chapter type specific styles for EPUB/PDF export */

.dedication {
    text-align: center;
    margin-top: 30%;
    font-style: italic;
}

.dedication h1 {
    font-size: 1.2em;
    font-weight: normal;
    font-style: italic;
}

.epigraph {
    text-align: right;
    margin-top: 20%;
    margin-left: 30%;
    font-style: italic;
    font-size: 0.95em;
    color: #555;
}

.epigraph h1 {
    display: none;
}

.imprint {
    font-size: 0.85em;
    line-height: 1.6;
}

.imprint h1 {
    font-size: 1.1em;
}

.prologue h1,
.epilogue h1,
.afterword h1 {
    font-style: italic;
}

figcaption {
    text-align: center;
    font-style: italic;
    font-size: 0.9em;
    color: #666;
    margin-top: 0.5em;
}
"""


# Chapter type specific formatting wrappers for Pandoc/EPUB
_CHAPTER_TYPE_WRAPPERS: dict[str, tuple[str, str]] = {
    "dedication": ('<div class="dedication">\n\n', "\n\n</div>"),
    "epigraph": ('<div class="epigraph">\n\n', "\n\n</div>"),
    "imprint": ('<div class="imprint">\n\n', "\n\n</div>"),
    "prologue": ('<div class="prologue">\n\n', "\n\n</div>"),
    "epilogue": ('<div class="epilogue">\n\n', "\n\n</div>"),
    "afterword": ('<div class="afterword">\n\n', "\n\n</div>"),
}


def _write_special_chapter(target_dir: Path, filename: str, chapter: dict[str, Any]) -> None:
    """Write a front-matter or back-matter chapter as Markdown file."""
    title = chapter.get("title", "Untitled")
    content = chapter.get("content", "")
    ch_type = chapter.get("chapter_type", "chapter")
    md_body = _content_to_markdown(content)
    md = _prepend_title(title, md_body)
    # Wrap with chapter-type-specific div for Pandoc CSS targeting
    wrapper = _CHAPTER_TYPE_WRAPPERS.get(ch_type)
    if wrapper:
        md = wrapper[0] + md + wrapper[1]
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
    if book.get("ai_assisted"):
        metadata["ai-assisted"] = True

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
            return html_to_markdown(content)
        return content

    return str(content)


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
