"""Markdown helpers and chapter-type maps shared by all import paths."""

import re
from pathlib import Path

import markdown as _md
from sqlalchemy.orm import Session

from app.models import Chapter, ChapterType


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


def md_to_html(text: str) -> str:
    """Convert markdown to HTML for the TipTap editor.

    TipTap stores content as JSON internally but parses HTML via setContent().
    Storing imported markdown as HTML ensures the editor renders it correctly
    instead of showing raw markdown symbols.
    """
    if not text or not text.strip():
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
    return html


def import_special_chapters(
    db: Session,
    book_id: str,
    directory: Path,
    type_map: dict[str, ChapterType],
    base_position: int = 900,
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
        chapter = Chapter(
            book_id=book_id,
            title=title,
            content=md_to_html(content.strip()),
            position=base_position + count,
            chapter_type=chapter_type.value,
        )
        db.add(chapter)
        count += 1
    return count
