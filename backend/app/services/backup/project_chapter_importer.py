"""Chapter import for write-book-template project trees.

Split out of ``project_import`` (God-file split #1, 2026-06-14). Holds the
chapter-layout concern: reading ``section_order`` from export-settings.yaml,
the two import layouts (explicit section order vs alphabetical fallback), and
turning individual markdown files into :class:`~app.models.Chapter` rows.
"""

from dataclasses import dataclass, field
from pathlib import Path

import yaml
from sqlalchemy.orm import Session

from app.models import Chapter, ChapterType
from app.services.backup.markdown_utils import (
    ALL_SPECIAL_MAP,
    BACK_MATTER_MAP,
    FRONT_MATTER_MAP,
    detect_chapter_type,
    extract_title,
    import_special_chapters,
    md_to_html,
    sanitize_import_markdown,
)


def _read_section_order(path: Path) -> list[str]:
    """Read ``section_order.ebook`` (or ``.paperback``) from export-settings.yaml."""
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        export_settings = yaml.safe_load(f) or {}
    so = export_settings.get("section_order", {})
    section_order = so.get("ebook", so.get("paperback", []))
    return section_order if isinstance(section_order, list) else []


def _import_chapters(
    db: Session,
    book_id: str,
    manuscript_dir: Path,
    section_order: list[str],
    language: str = "de",
) -> int:
    """Pick the section-order or fallback layout based on what's available."""
    if section_order:
        return import_with_section_order(db, book_id, manuscript_dir, section_order, language)
    return _import_alphabetical_layout(db, book_id, manuscript_dir, language)


def _import_alphabetical_layout(
    db: Session,
    book_id: str,
    manuscript_dir: Path,
    language: str = "de",
) -> int:
    """Fallback when no export-settings.yaml exists: scan front/chapters/back."""
    front_dir = manuscript_dir / "front-matter"
    chapters_dir = manuscript_dir / "chapters"
    back_dir = manuscript_dir / "back-matter"

    total = 0
    if front_dir.exists():
        total += import_special_chapters(
            db, book_id, front_dir, FRONT_MATTER_MAP, base_position=0, language=language
        )
    if chapters_dir.exists():
        total += _import_main_chapters(
            db, book_id, chapters_dir, start_position=100, language=language
        )
    if back_dir.exists():
        total += import_special_chapters(
            db, book_id, back_dir, BACK_MATTER_MAP, base_position=900, language=language
        )
    return total


def _import_main_chapters(
    db: Session,
    book_id: str,
    chapters_dir: Path,
    start_position: int,
    language: str = "de",
) -> int:
    """Import all .md files in ``chapters_dir`` (skips ``*-print.md`` variants)."""
    count = 0
    position = start_position
    for md_file in sorted(chapters_dir.glob("*.md")):
        if md_file.stem.endswith("-print"):
            continue
        _add_chapter_from_file(db, book_id, md_file, position, language=language)
        position += 1
        count += 1
    return count


def import_with_section_order(
    db: Session,
    book_id: str,
    manuscript_dir: Path,
    section_order: list[str],
    language: str = "de",
) -> int:
    """Import chapters in the order specified by export-settings.yaml.

    Section order entries look like::

        - front-matter/toc.md
        - front-matter/preface.md
        - chapters                    (placeholder: all chapter files)
        - back-matter/epilogue.md

    Files in front/back-matter directories that aren't listed but match a
    known type still get imported at the end (preserves the old behavior).
    """
    state = _SectionOrderState(position=0, count=0)

    for entry in section_order:
        entry = entry.strip()
        if entry == "chapters":
            _import_chapter_placeholder(db, book_id, manuscript_dir / "chapters", state, language)
        else:
            _import_section_order_file(db, book_id, manuscript_dir / entry, state, language)

    _import_remaining_special_files(db, book_id, manuscript_dir, state, language)
    return state.count


@dataclass
class _SectionOrderState:
    position: int
    count: int
    imported_files: set[str] = field(default_factory=set)


def _import_chapter_placeholder(
    db: Session,
    book_id: str,
    chapters_dir: Path,
    state: _SectionOrderState,
    language: str = "de",
) -> None:
    if not chapters_dir.exists():
        return
    for md_file in sorted(chapters_dir.glob("*.md")):
        if md_file.stem.endswith("-print"):
            continue
        chapter_type = detect_chapter_type(md_file.stem)
        _add_chapter_from_file(db, book_id, md_file, state.position, chapter_type, language)
        state.position += 1
        state.count += 1


def _import_section_order_file(
    db: Session,
    book_id: str,
    md_path: Path,
    state: _SectionOrderState,
    language: str = "de",
) -> None:
    if not md_path.exists() or md_path.stem.endswith("-print"):
        return
    stem = md_path.stem.lower()
    if stem in state.imported_files:
        return
    state.imported_files.add(stem)

    chapter_type = ALL_SPECIAL_MAP.get(stem, ChapterType.CHAPTER)
    _add_chapter_from_file(db, book_id, md_path, state.position, chapter_type, language)
    state.position += 1
    state.count += 1


def _import_remaining_special_files(
    db: Session,
    book_id: str,
    manuscript_dir: Path,
    state: _SectionOrderState,
    language: str = "de",
) -> None:
    """Catch typed front/back-matter files that the section_order missed."""
    for subdir, type_map in (
        (manuscript_dir / "front-matter", FRONT_MATTER_MAP),
        (manuscript_dir / "back-matter", BACK_MATTER_MAP),
    ):
        if not subdir.exists():
            continue
        for md_file in sorted(subdir.glob("*.md")):
            stem = md_file.stem.lower()
            if stem.endswith("-print") or stem in state.imported_files:
                continue
            chapter_type = type_map.get(stem)
            if not chapter_type:
                continue
            state.imported_files.add(stem)
            _add_chapter_from_file(db, book_id, md_file, state.position, chapter_type, language)
            state.position += 1
            state.count += 1


def _add_chapter_from_file(
    db: Session,
    book_id: str,
    md_file: Path,
    position: int,
    chapter_type: ChapterType | None = None,
    language: str = "de",
) -> None:
    """Read a markdown file and add it as a Chapter row.

    When ``chapter_type`` is omitted, ``detect_chapter_type`` decides from the
    filename stem (used by the alphabetical-fallback layout).
    """
    content = md_file.read_text(encoding="utf-8")
    title = extract_title(content, md_file.stem)
    resolved_type = chapter_type or detect_chapter_type(md_file.stem)
    sanitized = sanitize_import_markdown(content.strip(), language)
    db.add(
        Chapter(
            book_id=book_id,
            title=title,
            content=md_to_html(sanitized),
            position=position,
            chapter_type=resolved_type.value,
        )
    )
