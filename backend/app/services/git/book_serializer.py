"""Book -> filesystem serialization for the git-backup repo.

Extracted from ``services/git_backup.py`` (God-file split #9, 2026-06-14).
Writes a book's metadata + chapters into the per-book git working tree as
JSON (canonical) plus advisory Markdown side-files, and owns the
chapter-type -> section classification. Pure filesystem work: no git
operations, no domain exceptions. The Markdown converter is imported
lazily from ``bibliogon_export`` and is exception-tolerant so a missing
or broken export plugin never blocks a commit.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from app.models import Book, Chapter, ChapterType

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


def _write_book_state(book: Book, db: Any, repo_dir: Path) -> None:
    """Export book metadata and chapters to files inside ``repo_dir``.

    Layout (Phase 1):
        manuscript/front-matter/NN-<slug>.json
        manuscript/chapters/NN-<slug>.json
        manuscript/back-matter/NN-<slug>.json
        config/metadata.yaml
    """
    # Clear previous manuscript/ content so removed chapters drop from git.
    manuscript = repo_dir / "manuscript"
    for sub in ("front-matter", "chapters", "back-matter"):
        section_dir = manuscript / sub
        if section_dir.exists():
            for file in section_dir.glob("*.json"):
                file.unlink()
        section_dir.mkdir(parents=True, exist_ok=True)

    chapters = db.query(Chapter).filter(Chapter.book_id == book.id).order_by(Chapter.position).all()

    for index, chapter in enumerate(chapters, start=1):
        section = _section_for(chapter.chapter_type)
        stem = f"{index:02d}-{_slugify(chapter.title or 'untitled')}"
        tiptap_doc = _safe_load_json(chapter.content)
        payload = {
            "id": chapter.id,
            "title": chapter.title,
            "chapter_type": chapter.chapter_type,
            "position": chapter.position,
            "content": tiptap_doc,
        }
        json_path = manuscript / section / f"{stem}.json"
        json_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        # Phase 5: Markdown counterpart for readable diffs. JSON stays
        # canonical; MD is advisory and regenerated from JSON on every
        # commit. Failure to render MD must NEVER block the JSON
        # commit.
        md_path = manuscript / section / f"{stem}.md"
        md = _render_chapter_markdown(chapter.title, tiptap_doc)
        if md is not None:
            md_path.write_text(md, encoding="utf-8")
        elif md_path.exists():
            # Plugin gone mid-flight? Drop stale MD rather than keep a
            # diverging snapshot next to the JSON.
            md_path.unlink()

    config_dir = repo_dir / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "metadata.yaml").write_text(
        yaml.safe_dump(_book_metadata(book), sort_keys=True, allow_unicode=True),
        encoding="utf-8",
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


def _render_chapter_markdown(title: str | None, tiptap_doc: Any) -> str | None:
    """Render a chapter to Markdown. Returns None on any failure.

    Phase 5: reuses the export plugin's converter. The export plugin
    is a path-installed core dependency but the import is kept lazy +
    exception-tolerant so a disabled/broken plugin never blocks a
    commit - JSON is the canonical format, Markdown is advisory.
    """
    try:
        from bibliogon_export.tiptap_to_md import tiptap_to_markdown  # type: ignore[import-untyped]
    except ImportError:
        logger_ = logging.getLogger(__name__)
        logger_.info("bibliogon_export unavailable; skipping Markdown side-file")
        return None
    if not isinstance(tiptap_doc, dict) or tiptap_doc.get("type") != "doc":
        return None
    try:
        body = tiptap_to_markdown(tiptap_doc)
    except Exception as exc:  # noqa: BLE001 - render must not kill commit
        logger_ = logging.getLogger(__name__)
        logger_.warning("tiptap_to_markdown failed: %s", exc)
        return None
    header = f"# {title.strip()}\n\n" if title and title.strip() else ""
    return str(header + body.rstrip() + "\n")


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
