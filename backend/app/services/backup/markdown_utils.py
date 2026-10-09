"""Markdown helpers and chapter-type maps shared by all import paths."""

import logging
import re
from pathlib import Path

import markdown as _md
from sqlalchemy.orm import Session

from app.models import Chapter, ChapterType

logger = logging.getLogger(__name__)


# --- Chapter type maps (filename stem -> ChapterType) ---

FRONT_MATTER_MAP: dict[str, ChapterType] = {
    "toc": ChapterType.TABLE_OF_CONTENTS,
    "dedication": ChapterType.DEDICATION,
    "epigraph": ChapterType.EPIGRAPH,
    "preface": ChapterType.PREFACE,
    "foreword": ChapterType.FOREWORD,
    "prologue": ChapterType.PROLOGUE,
    "introduction": ChapterType.INTRODUCTION,
    "translators-note": ChapterType.PREFACE,
}

BACK_MATTER_MAP: dict[str, ChapterType] = {
    "epilogue": ChapterType.EPILOGUE,
    "afterword": ChapterType.AFTERWORD,
    "about-the-author": ChapterType.ABOUT_AUTHOR,
    "acknowledgments": ChapterType.ACKNOWLEDGMENTS,
    "appendix": ChapterType.APPENDIX,
    "bibliography": ChapterType.BIBLIOGRAPHY,
    "endnotes": ChapterType.ENDNOTES,
    "glossary": ChapterType.GLOSSARY,
    "index": ChapterType.INDEX,
    "imprint": ChapterType.IMPRINT,
    "next-in-series": ChapterType.NEXT_IN_SERIES,
    "other-publications": ChapterType.NEXT_IN_SERIES,
}

ALL_SPECIAL_MAP: dict[str, ChapterType] = {**FRONT_MATTER_MAP, **BACK_MATTER_MAP}

# Filename patterns for free-form chapter type detection
_CHAPTER_FILENAME_PATTERNS: dict[str, ChapterType] = {
    "part": ChapterType.PART_INTRO,
    "part-intro": ChapterType.PART_INTRO,
    "interludium": ChapterType.INTERLUDE,
    "interlude": ChapterType.INTERLUDE,
}


# --- Pure helpers ---

# A leading YAML front-matter block: ``---`` on its own first line, any body,
# then a closing ``---`` line. Anchored to the very start of the document.
_FRONT_MATTER_RE = re.compile(r"\A---[ \t]*\r?\n.*?\r?\n---[ \t]*\r?\n?", re.DOTALL)


def strip_yaml_frontmatter(text: str) -> str:
    """Remove a leading YAML front-matter block from a markdown string.

    Returns the text unchanged when it does not start with a ``---`` block, so
    a chapter ``.md`` without front-matter imports exactly as before.

    Args:
        text: Raw markdown, possibly prefixed with a ``---``-fenced block.

    Returns:
        The markdown body with any leading front-matter block removed.
    """
    if not text.startswith("---"):
        return text
    return _FRONT_MATTER_RE.sub("", text, count=1)


def detect_chapter_type(stem: str) -> ChapterType:
    """Detect chapter type from filename stem.

    Examples:
        01-0-part-1-intro -> PART_INTRO
        05-1-interludium  -> INTERLUDE
        01-chapter        -> CHAPTER
    """
    cleaned = re.sub(r"^[\d]+(-[\d]+)?-", "", stem).lower()
    for pattern, chapter_type in _CHAPTER_FILENAME_PATTERNS.items():
        if cleaned.startswith(pattern):
            return chapter_type
    return ChapterType.CHAPTER


def extract_title(content: str, fallback: str) -> str:
    """Extract title from first H1 heading or use fallback."""
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped[2:].strip()
    cleaned = re.sub(r"^[\d]+(-[\d]+)?-", "", fallback)
    if not cleaned:
        cleaned = fallback
    return cleaned.replace("-", " ").strip().title()


def read_file_if_exists(path: Path) -> str | None:
    """Read file contents if it exists, otherwise return None."""
    if path.exists():
        text = path.read_text(encoding="utf-8").strip()
        return text if text else None
    return None


def sanitize_import_markdown(content: str, language: str) -> str:
    """Run the ``content_pre_import`` hook on raw markdown before conversion.

    Plugins (notably ms-tools) can transform the text, e.g. to strip invisible
    Unicode, normalize quotes/dashes, or fix Word/HTML artifacts. When no
    plugin provides a replacement the original content is returned unchanged.
    """
    if not content:
        return content
    try:
        from app.main import manager
    except ImportError:
        return content
    try:
        results = manager.call_hook(
            "content_pre_import", content=content, language=language or "de"
        )
    except Exception:
        logger.exception("content_pre_import hook failed")
        return content
    for result in results or []:
        if isinstance(result, str):
            return result
    return content


#: CSS properties the editor itself emits, derived from the extensions it
#: mounts rather than from a guess about what looks harmless (#988):
#: ``text-align`` from TextAlign on headings + paragraphs, ``color`` from
#: @tiptap/extension-color, ``background-color`` from Highlight with
#: multicolor, and ``width``/``min-width`` from resizable table columns.
#: Anything else in an imported style attribute arrived from an importer.
ALLOWED_STYLE_PROPERTIES: frozenset[str] = frozenset(
    {
        "text-align",
        "color",
        "background-color",
        "width",
        "min-width",
    }
)

#: One ``style`` attribute in any of the three forms HTML allows. The
#: quoted alternatives are quote-type-specific on purpose: one character
#: class excluding BOTH quotes would fail to match a double-quoted value
#: that contains an apostrophe, such as a font-family stack, and would
#: leave that attribute - declarations and all - unfiltered.
_STYLE_ATTR_RE = re.compile(
    r"""(?P<prefix>\sstyle\s*=\s*)"""
    r"""(?:"(?P<dq>[^"]*)"|'(?P<sq>[^']*)'|(?P<bare>[^\s>"']+))""",
    re.IGNORECASE,
)


def filter_style_declarations(value: str) -> str:
    """Return only the allowlisted declarations of one style attribute.

    Declarations split on ``;`` and match on the property name, lower-cased
    and stripped. A fragment without a colon is not a declaration and is
    dropped.
    """
    kept: list[str] = []
    for declaration in value.split(";"):
        if ":" not in declaration:
            continue
        prop, _, rest = declaration.partition(":")
        if prop.strip().lower() in ALLOWED_STYLE_PROPERTIES:
            kept.append(f"{prop.strip().lower()}: {rest.strip()}")
    return "; ".join(kept)


def filter_import_styles(html: str) -> str:
    """Rewrite every ``style`` attribute down to the allowlist (#988).

    Imported HTML lands in ``Chapter.content`` as HTML and stays HTML
    until someone opens and saves it in the editor (#787). Until then
    nothing has filtered it, so a declaration the author never wrote
    travels into the document that is rendered, exported and shipped to a
    store. No script executes - the schema and DOMPurify keep the
    dangerous attributes out - but ``position: fixed`` inside the editor,
    a ``background-image: url(...)`` that fetches from a third party when
    the chapter opens, and declarations that change a layout the author
    approved in the EPUB or print PDF all reach further than they look.

    Filtering happens on the IMPORT path so the stored document is the
    clean one; filtering at render time would leave the declaration in the
    database, where the next export would find it.

    An attribute left with nothing is removed entirely rather than left as
    ``style=""``. An unquoted value is re-emitted quoted, which is the
    same attribute in valid markup. A regex over the attribute VALUE is
    the right tool and not a violation of the "no regex for nested HTML"
    rule: it rewrites the contents of one attribute, which cannot nest
    and cannot contain the quote that delimits it. The document
    structure is never parsed.
    """
    if not html or "style" not in html.lower():
        return html

    def replace(match: re.Match[str]) -> str:
        raw = match.group("dq")
        quote = '"'
        if raw is None:
            raw = match.group("sq")
            quote = "'"
        if raw is None:
            raw = match.group("bare")
            quote = '"'
        filtered = filter_style_declarations(raw)
        if not filtered:
            return ""
        return f"{match.group('prefix')}{quote}{filtered}{quote}"

    return _STYLE_ATTR_RE.sub(replace, html)


def md_to_html(text: str) -> str:
    """Convert markdown to HTML for the TipTap editor.

    TipTap stores content as JSON internally but parses HTML via setContent().
    Storing imported markdown as HTML ensures the editor renders it correctly
    instead of showing raw markdown symbols.

    Raw HTML embedded in the markdown passes through the converter, so the
    result goes through ``filter_import_styles`` before it is returned
    (#988). This is where the markdown, markdown-folder, scrivener, office,
    git-sync and write-book-template importers converge; the ``.html``
    branch of the single-file handler filters its own markup.
    """
    if not text or not text.strip():
        return ""
    # Drop a leading YAML front-matter block (e.g. git-sync .md side-files,
    # Jekyll/Pandoc docs) so its keys never leak into the chapter body. A
    # .md without front-matter is returned unchanged by the strip.
    text = strip_yaml_frontmatter(text)
    if not text.strip():
        return ""
    # Remove explicit anchor markers {#id} before conversion (Pandoc-specific)
    cleaned = re.sub(r"\s*\{#[\w-]+\}", "", text)
    # Python's markdown library requires 4-space indent for nested lists,
    # but write-book-template uses 2-space indent. Double the indentation.
    cleaned = re.sub(
        r"^( {2,})(?=-|\*|\d+\.)",
        lambda m: m.group(1) * 2,
        cleaned,
        flags=re.MULTILINE,
    )
    html = _md.markdown(
        cleaned,
        extensions=["tables", "fenced_code", "attr_list"],
        output_format="html",
    )
    # Figure extension parses <figure> with figcaption natively.
    # But <figure> WITHOUT figcaption causes double rendering (both <figure>
    # and <img> match). Strip <figure> wrapper when there's no <figcaption>,
    # keeping just <img>.
    html = re.sub(
        r"<figure>\s*(<img[^>]*/>)\s*</figure>",
        r"\1",
        html,
    )
    return filter_import_styles(html)


def import_special_chapters(
    db: Session,
    book_id: str,
    directory: Path,
    type_map: dict[str, ChapterType],
    base_position: int = 900,
    language: str = "de",
) -> int:
    """Import front-matter or back-matter files as typed chapters.

    Returns the number of imported chapters.
    """
    count = 0
    for md_file in sorted(directory.glob("*.md")):
        stem = md_file.stem.lower()
        if stem.endswith("-print"):
            continue
        chapter_type = type_map.get(stem)
        if not chapter_type:
            continue

        content = md_file.read_text(encoding="utf-8")
        title = extract_title(content, stem)
        sanitized = sanitize_import_markdown(content.strip(), language)
        chapter = Chapter(
            book_id=book_id,
            title=title,
            content=md_to_html(sanitized),
            position=base_position + count,
            chapter_type=chapter_type.value,
        )
        db.add(chapter)
        count += 1
    return count
