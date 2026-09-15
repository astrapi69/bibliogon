"""Book -> filesystem serialization for the git-backup repo.

Extracted from ``services/git_backup.py`` (God-file split #9, 2026-06-14).
Writes a book's metadata + chapters into the per-book git working tree as
JSON (canonical) plus Markdown side-files, and owns the chapter-type ->
section classification. Pure filesystem work: no git operations.

A chapter whose Markdown cannot be rendered raises
``ChapterMarkdownError`` and aborts the write before any file changes.
That reverses an earlier deliberate choice - a render failure used to be
tolerated so it "never blocks a commit" - because the tolerance was
implemented as deleting the side-file, and it fired for every imported
chapter.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from app.exceptions import BibliogonError
from app.models import Book, Chapter, ChapterType
from app.services.html_text import content_to_plain_text

# ChapterType classification mirrors ``frontend/src/components/ChapterSidebar.tsx``.
# Keep in sync when new types land.
_FRONT_MATTER = {
    ChapterType.TABLE_OF_CONTENTS.value,
    ChapterType.DEDICATION.value,
    ChapterType.EPIGRAPH.value,
    ChapterType.PREFACE.value,
    ChapterType.FOREWORD.value,
    ChapterType.PROLOGUE.value,
    ChapterType.INTRODUCTION.value,
    ChapterType.HALF_TITLE.value,
    ChapterType.TITLE_PAGE.value,
    ChapterType.COPYRIGHT.value,
}
_BACK_MATTER = {
    ChapterType.EPILOGUE.value,
    ChapterType.AFTERWORD.value,
    ChapterType.FINAL_THOUGHTS.value,
    ChapterType.CONCLUSION.value,
    ChapterType.ABOUT_AUTHOR.value,
    ChapterType.ACKNOWLEDGMENTS.value,
    ChapterType.APPENDIX.value,
    ChapterType.BIBLIOGRAPHY.value,
    ChapterType.ENDNOTES.value,
    ChapterType.GLOSSARY.value,
    ChapterType.INDEX.value,
    ChapterType.IMPRINT.value,
    ChapterType.ALSO_BY_AUTHOR.value,
    ChapterType.NEXT_IN_SERIES.value,
    ChapterType.EXCERPT.value,
    ChapterType.CALL_TO_ACTION.value,
}

_GITIGNORE = """\
# Bibliogon: git tracks the source of the book, not build artifacts.
audiobook/
output/
temp/
.tmp/
*.epub
*.pdf
*.docx
"""


def _write_gitignore(repo_dir: Path) -> None:
    gitignore = repo_dir / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(_GITIGNORE, encoding="utf-8")


class ChapterMarkdownError(BibliogonError):
    """A chapter's Markdown side-file could not be rendered.

    Raised instead of skipping or deleting the file: a failed or empty
    extraction from real content must never trigger a destructive
    action. Names the chapter so the refusal is actionable.
    """

    status_code = 500


@dataclass(frozen=True)
class _ChapterFiles:
    """Everything one chapter writes, rendered before any file is touched."""

    section: str
    stem: str
    json_text: str
    markdown: str


def _write_book_state(book: Book, db: Any, repo_dir: Path) -> None:
    """Export book metadata and chapters to files inside ``repo_dir``.

    Layout (Phase 1):
        manuscript/front-matter/NN-<slug>.{json,md}
        manuscript/chapters/NN-<slug>.{json,md}
        manuscript/back-matter/NN-<slug>.{json,md}
        config/metadata.yaml

    Every chapter is rendered in memory FIRST. Only when all of them
    succeeded does anything on disk change - so a chapter that cannot be
    rendered aborts the whole write before the section directories are
    cleared, and no earlier chapter is left half-updated.

    Raises:
        ChapterMarkdownError: a chapter's Markdown could not be rendered.
    """
    chapters = db.query(Chapter).filter(Chapter.book_id == book.id).order_by(Chapter.position).all()
    rendered = [
        _render_chapter_files(chapter, index, book)
        for index, chapter in enumerate(chapters, start=1)
    ]

    manuscript = repo_dir / "manuscript"
    _clear_chapter_json(manuscript)
    for files in rendered:
        section_dir = manuscript / files.section
        (section_dir / f"{files.stem}.json").write_text(files.json_text, encoding="utf-8")
        (section_dir / f"{files.stem}.md").write_text(files.markdown, encoding="utf-8")

    config_dir = repo_dir / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "metadata.yaml").write_text(
        yaml.safe_dump(_book_metadata(book), sort_keys=True, allow_unicode=True),
        encoding="utf-8",
    )


def _clear_chapter_json(manuscript: Path) -> None:
    """Remove previous chapter JSON so removed chapters drop from git.

    Only ``*.json`` is cleared - a removed chapter's ``.md`` currently
    survives. Cleaning ``*.md`` here would be unsafe: in a repo whose
    working tree holds author-written Markdown (an adopted upstream
    history), a blanket glob would delete the author's manuscript. See
    #844 for the owned-file-only cleanup.
    """
    for sub in ("front-matter", "chapters", "back-matter"):
        section_dir = manuscript / sub
        if section_dir.exists():
            for file in section_dir.glob("*.json"):
                file.unlink()
        section_dir.mkdir(parents=True, exist_ok=True)


def _render_chapter_files(chapter: Chapter, index: int, book: Book) -> _ChapterFiles:
    """Render one chapter's JSON and Markdown in memory, writing nothing."""
    payload = {
        "id": chapter.id,
        "title": chapter.title,
        "chapter_type": chapter.chapter_type,
        "position": chapter.position,
        "content": _safe_load_json(chapter.content),
    }
    return _ChapterFiles(
        section=_section_for(chapter.chapter_type),
        stem=f"{index:02d}-{_slugify(chapter.title or 'untitled')}",
        json_text=json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
        markdown=_render_chapter_markdown(chapter, index, book),
    )


def _section_for(chapter_type: str | None) -> str:
    if chapter_type in _FRONT_MATTER:
        return "front-matter"
    if chapter_type in _BACK_MATTER:
        return "back-matter"
    return "chapters"


def _book_metadata(book: Book) -> dict[str, Any]:
    fields = (
        "id",
        "title",
        "subtitle",
        "author",
        "language",
        "series",
        "series_index",
        "description",
        "genre",
        "edition",
        "publisher",
        "publisher_city",
        "publish_date",
        "isbn_ebook",
        "isbn_paperback",
        "isbn_hardcover",
        "asin_ebook",
        "asin_paperback",
        "asin_hardcover",
    )
    return {field: getattr(book, field, None) for field in fields}


def _render_chapter_markdown(chapter: Chapter, index: int, book: Book) -> str:
    """Render a chapter to Markdown with a YAML front-matter block.

    Phase 5 + #14 (SEO): the body comes from the export plugin's
    ``content_to_markdown``, which handles every shape chapter content is
    stored in - a TipTap doc, a JSON string, HTML (an imported chapter
    stays HTML until it is opened and saved, #787), or plain text. The
    front-matter (title, chapter index, book title, author,
    last_modified, word_count) keeps diffs readable; the import path
    strips it back off (``services.backup.markdown_utils.strip_yaml_frontmatter``).

    This used to render only TipTap docs and return None for everything
    else, and the caller treated None as "delete the stale file" - so
    every imported chapter's ``.md`` was removed instead of written. A
    failed or empty extraction from real content now raises instead: it
    must never lead to a destructive action.

    What counts as a failed extraction is judged on TEXT, not on the raw
    stored string. A new chapter created in the editor is stored as
    ``{"type":"doc","content":[{"type":"paragraph"}]}`` - a non-empty
    string with no text in it - and must render to an empty body, not
    abort. Likewise an image-only chapter has no text but a non-empty
    Markdown body. The only failure is real text going in and nothing
    coming out:

    ======== ========= =====================
    text     Markdown  outcome
    ======== ========= =====================
    empty    empty     write (empty chapter)
    empty    present   write (e.g. image-only)
    present  present   write
    present  empty     abort
    ======== ========= =====================

    Raises:
        ChapterMarkdownError: the converter is unavailable, raised, or
            turned content with text in it into an empty body. The message
            names the chapter.
    """
    label = f"'{chapter.title or 'untitled'}' (id {chapter.id})"
    try:
        from bibliogon_export.scaffolder import (  # type: ignore[import-untyped]
            content_to_markdown,
        )
    except ImportError as exc:
        raise ChapterMarkdownError(
            f"Cannot write the Markdown side-file for chapter {label}: "
            "the export plugin that renders it is not installed."
        ) from exc

    try:
        body = content_to_markdown(chapter.content) if (chapter.content or "").strip() else ""
    except Exception as exc:  # noqa: BLE001 - re-raised with the chapter named
        raise ChapterMarkdownError(
            f"Cannot write the Markdown side-file for chapter {label}: rendering failed ({exc})."
        ) from exc

    if not str(body).strip() and content_to_plain_text(chapter.content).strip():
        raise ChapterMarkdownError(
            f"Cannot write the Markdown side-file for chapter {label}: its text "
            "rendered to an empty body. Refusing rather than writing an empty file."
        )

    front_matter = _render_chapter_frontmatter(chapter, index, book)
    title = chapter.title
    header = f"# {title.strip()}\n\n" if title and title.strip() else ""
    return str(front_matter + header + str(body).rstrip() + "\n")


def _render_chapter_frontmatter(chapter: Chapter, index: int, book: Book) -> str:
    """Build the leading YAML front-matter block for a chapter ``.md``.

    Args:
        chapter: The chapter being serialized.
        index: The chapter's 1-based position within the book.
        book: The owning book.

    Returns:
        A ``---``-fenced YAML block ending with a blank line. Empty
        string values are kept (never crash); ``last_modified`` is an
        ISO timestamp or None.
    """
    from app.services.writing_stats import count_words

    updated_at = getattr(chapter, "updated_at", None)
    fields = {
        "title": chapter.title or "",
        "chapter": index,
        "book": book.title or "",
        "author": book.author or "",
        "last_modified": updated_at.isoformat() if updated_at is not None else None,
        "word_count": count_words(chapter.content),
    }
    body = yaml.safe_dump(fields, sort_keys=False, allow_unicode=True).rstrip()
    return f"---\n{body}\n---\n\n"


def _safe_load_json(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return raw


_slug_re = re.compile(r"[^a-z0-9]+")


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = value.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    value = _slug_re.sub("-", value).strip("-")
    return value or f"ch-{int(datetime.now().timestamp())}"
