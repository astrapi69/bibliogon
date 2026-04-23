"""Core handler for a folder of Markdown files.

Accepts an input_path that is a DIRECTORY (not a file) containing one
or more ``.md`` / ``.markdown`` files. The wizard's Step 1 folder
drag-drop stages the uploaded files under a temp dir preserving
relative paths, then calls ``/api/import/detect`` which dispatches to
this handler.

Conventions (opportunistic, per exploration Section 8 Phase 3):
- README.md at the root -> book description + optional title
- Any image named cover.{png,jpg,jpeg,webp} at the root -> cover
- Files prefixed ``NN-name.md`` or ``chapter-NN.md`` sort into order;
  everything else sorts alphabetically.
- ``images/``, ``assets/`` subfolders -> figure assets.

Source identifier: content signature from title + author + chapter
count. Stable across moves as long as the structure is unchanged;
minor text edits of a chapter still collide so re-imports of the
same folder are recognised as duplicates.
"""

from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.protocol import (
    DetectedAsset,
    DetectedChapter,
    DetectedProject,
)
from app.models import Asset, Book, Chapter, ChapterType
from app.services.backup.markdown_utils import (
    extract_title,
    md_to_html,
    sanitize_import_markdown,
)

_MD_SUFFIXES = {".md", ".markdown"}
_COVER_STEMS = {"cover", "titel", "titelbild"}
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_ORDERING_RE = re.compile(r"^(?:chapter[-_])?(\d+)[-_]")


class MarkdownFolderHandler:
    """ImportPlugin for a folder of Markdown files."""

    format_name = "markdown-folder"

    _ALLOWED_OVERRIDES = {
        "title",
        "author",
        "subtitle",
        "language",
        "description",
        "genre",
    }

    # --- ImportPlugin ---

    def can_handle(self, input_path: str) -> bool:
        path = Path(input_path)
        if not path.is_dir():
            return False
        for child in path.rglob("*"):
            if child.is_file() and child.suffix.lower() in _MD_SUFFIXES:
                return True
        return False

    def detect(self, input_path: str) -> DetectedProject:
        root = Path(input_path)
        md_files = _ordered_md_files(root)
        readme = _find_readme(root)
        cover = _find_cover(root)

        title = _derive_title(md_files, readme, fallback=root.name)
        description = (
            readme.read_text(encoding="utf-8") if readme is not None else None
        )

        chapters = [
            DetectedChapter(
                title=_chapter_title(path),
                position=idx,
                word_count=_word_count_of(path),
                content_preview=_preview_of(path),
            )
            for idx, path in enumerate(md_files)
        ]

        assets: list[DetectedAsset] = []
        if cover is not None:
            assets.append(_asset_from(cover, purpose="cover", root=root))
        for img in _find_figures(root):
            assets.append(_asset_from(img, purpose="figure", root=root))

        warnings: list[str] = []
        if not md_files:
            warnings.append("No Markdown files found in the folder.")
        if cover is None and assets:
            warnings.append(
                "No cover image detected at the folder root; the first figure may be used instead."
            )

        return DetectedProject(
            format_name=self.format_name,
            source_identifier=_signature(title, len(md_files), root),
            title=title,
            author=None,
            language=None,
            chapters=chapters,
            assets=assets,
            warnings=warnings,
            plugin_specific_data={
                "md_count": len(md_files),
                "image_count": len(assets),
                "has_readme": readme is not None,
            },
        )

    def execute(
        self,
        input_path: str,
        detected: DetectedProject,
        overrides: dict,
        duplicate_action: str = "create",
        existing_book_id: str | None = None,
    ) -> str:
        if duplicate_action == "cancel":
            raise _DuplicateCancelled()

        root = Path(input_path)
        md_files = _ordered_md_files(root)
        cover = _find_cover(root)
        figures = _find_figures(root)

        session: Session = SessionLocal()
        try:
            if duplicate_action == "overwrite" and existing_book_id:
                _hard_delete_book(session, existing_book_id)

            title = (
                overrides.get("title")
                or detected.title
                or root.name
                or "Untitled"
            )
            author = overrides.get("author", "Unknown")
            language = overrides.get("language", "de")

            book = Book(title=title, author=author, language=language)
            for key, value in overrides.items():
                if key in {"title", "author", "language"}:
                    continue
                if key not in self._ALLOWED_OVERRIDES:
                    raise KeyError(
                        f"Override {key!r} is not allowed for the markdown-folder handler"
                    )
                setattr(book, key, value)

            session.add(book)
            session.flush()

            for position, md_path in enumerate(md_files):
                content = md_path.read_text(encoding="utf-8")
                sanitized = sanitize_import_markdown(content, book.language)
                session.add(
                    Chapter(
                        book_id=book.id,
                        title=_chapter_title(md_path),
                        content=md_to_html(sanitized),
                        position=position,
                        chapter_type=ChapterType.CHAPTER.value,
                    )
                )

            _import_assets(session, book.id, cover, figures)

            session.commit()
            return book.id
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


# --- Helpers ---


def _ordered_md_files(root: Path) -> list[Path]:
    """Collect ``.md`` files. Sort by numeric prefix if any file carries
    one; fall back to alphabetical on a per-directory basis. README is
    excluded (reserved for book description)."""
    all_md = [
        p
        for p in root.rglob("*")
        if p.is_file()
        and p.suffix.lower() in _MD_SUFFIXES
        and p.stem.lower() != "readme"
    ]
    return sorted(all_md, key=_sort_key)


def _sort_key(path: Path) -> tuple:
    match = _ORDERING_RE.match(path.stem.lower())
    ordinal = int(match.group(1)) if match else 10_000
    return (len(path.parents), ordinal, path.stem.lower())


def _find_readme(root: Path) -> Path | None:
    for name in ("README.md", "readme.md", "README.markdown"):
        candidate = root / name
        if candidate.is_file():
            return candidate
    return None


def _find_cover(root: Path) -> Path | None:
    for child in root.iterdir():
        if not child.is_file():
            continue
        if child.stem.lower() in _COVER_STEMS and child.suffix.lower() in _IMAGE_SUFFIXES:
            return child
    return None


def _find_figures(root: Path) -> list[Path]:
    figures: list[Path] = []
    for folder_name in ("images", "assets", "figures", "img"):
        folder = root / folder_name
        if not folder.is_dir():
            continue
        for child in sorted(folder.rglob("*")):
            if child.is_file() and child.suffix.lower() in _IMAGE_SUFFIXES:
                figures.append(child)
    return figures


def _derive_title(
    md_files: list[Path], readme: Path | None, fallback: str
) -> str:
    if readme is not None:
        readme_content = readme.read_text(encoding="utf-8")
        match = re.search(r"^#\s+(.+)$", readme_content, re.MULTILINE)
        if match:
            return match.group(1).strip()
    if md_files:
        first = md_files[0].read_text(encoding="utf-8")
        match = re.search(r"^#\s+(.+)$", first, re.MULTILINE)
        if match:
            return match.group(1).strip()
    return fallback or "Untitled"


def _chapter_title(path: Path) -> str:
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return path.stem
    return extract_title(content, path.stem)


def _word_count_of(path: Path) -> int:
    try:
        return len(path.read_text(encoding="utf-8").split())
    except (OSError, UnicodeDecodeError):
        return 0


def _preview_of(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")[:200]
    except (OSError, UnicodeDecodeError):
        return ""


def _signature(title: str, chapter_count: int, root: Path) -> str:
    payload = f"{title}\n{chapter_count}\n{root.name}"
    return f"signature:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


def _asset_from(path: Path, *, purpose: str, root: Path) -> DetectedAsset:
    try:
        size = path.stat().st_size
    except OSError:
        size = 0
    return DetectedAsset(
        filename=path.name,
        path=str(path.relative_to(root)),
        size_bytes=size,
        mime_type=_guess_mime(path),
        purpose=purpose,
    )


def _guess_mime(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".gif":
        return "image/gif"
    if suffix in _MD_SUFFIXES:
        return "text/markdown"
    return "application/octet-stream"


def _import_assets(
    session: Session,
    book_id: str,
    cover: Path | None,
    figures: list[Path],
) -> None:
    """Copy each image into the book's uploads dir and record Asset rows."""
    from app.routers.assets import UPLOAD_DIR

    def _copy(path: Path, asset_type: str) -> None:
        dest_dir = UPLOAD_DIR / book_id / asset_type
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / path.name
        shutil.copy2(path, dest)
        session.add(
            Asset(
                book_id=book_id,
                filename=path.name,
                asset_type=asset_type,
                path=str(dest),
            )
        )

    if cover is not None:
        _copy(cover, "cover")
    for fig in figures:
        _copy(fig, "figure")


def _hard_delete_book(session: Session, book_id: str) -> None:
    session.query(Chapter).filter(Chapter.book_id == book_id).delete()
    session.query(Asset).filter(Asset.book_id == book_id).delete()
    book = session.query(Book).filter(Book.id == book_id).first()
    if book is not None:
        session.delete(book)
    session.flush()


class _DuplicateCancelled(Exception):
    """Raised by execute when the user chose to cancel a duplicate import."""
