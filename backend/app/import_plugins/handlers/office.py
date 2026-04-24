"""Core handlers for office formats (.docx, .epub) via Pandoc.

CIO-04 ships two handlers as a pair: ``DocxImportHandler`` and
``EpubImportHandler``. Both shell out to the system Pandoc binary to
convert to Markdown, then reuse the single-markdown pipeline
(``md_to_html`` + ``sanitize_import_markdown``) to land each chapter
as a TipTap-ready Chapter row.

Scope note: the exploration (Section 7 of
core-import-orchestrator.md) has these living in a separate
``bibliogon-plugin-import-office`` package during the plugin
extraction phase (PGS-01-style work after the protocol-location
decision). For now they ship in-repo as core handlers so users get
docx/epub import without waiting on external plugin packaging.
"""

from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
import tempfile
import zipfile
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
    md_to_html,
    sanitize_import_markdown,
)

class _OfficeHandlerBase:
    """Shared Pandoc-based import pipeline for docx + epub."""

    format_name: str = ""
    _suffix: str = ""
    _pandoc_format: str = ""

    def can_handle(self, input_path: str) -> bool:
        path = Path(input_path)
        return path.is_file() and path.suffix.lower() == self._suffix

    def detect(self, input_path: str) -> DetectedProject:
        path = Path(input_path)
        source_identifier = f"sha256:{_sha256_of_file(path)}"
        markdown, media_dir = _convert_to_markdown(
            path, self._pandoc_format
        )
        title = _extract_title(markdown) or path.stem
        chapters = _split_into_chapters(markdown)
        assets = _detected_assets(media_dir)
        warnings: list[str] = []
        if not chapters:
            warnings.append("No chapters detected in the converted Markdown.")
        if len(chapters) == 1 and len(markdown) > 50_000:
            warnings.append(
                "Pandoc produced a single long chapter; consider splitting on H1."
            )

        return DetectedProject(
            format_name=self.format_name,
            source_identifier=source_identifier,
            title=title or path.stem or "Untitled",
            author="Unknown",
            language=None,
            chapters=[
                DetectedChapter(
                    title=ch["title"],
                    position=idx,
                    word_count=len(ch["body"].split()),
                    content_preview=ch["body"][:200],
                )
                for idx, ch in enumerate(chapters)
            ],
            assets=assets,
            warnings=warnings,
            plugin_specific_data={
                "pandoc_format": self._pandoc_format,
                "markdown_bytes": len(markdown),
                "media_count": len(assets),
            },
        )

    def execute(
        self,
        input_path: str,
        detected: DetectedProject,
        overrides: dict,
        duplicate_action: str = "create",
        existing_book_id: str | None = None,
        git_adoption: str | None = None,
    ) -> str:
        if duplicate_action == "cancel":
            raise _DuplicateCancelled()

        path = Path(input_path)
        markdown, media_dir = _convert_to_markdown(
            path, self._pandoc_format
        )
        chapters = _split_into_chapters(markdown)

        session: Session = SessionLocal()
        try:
            if duplicate_action == "overwrite" and existing_book_id:
                _hard_delete_book(session, existing_book_id)

            title = (
                overrides.get("title")
                or detected.title
                or path.stem
                or "Untitled"
            )
            author = overrides.get("author") or "Unknown"
            language = overrides.get("language") or "de"

            book = Book(title=title, author=author, language=language)
            session.add(book)
            session.flush()

            from app.import_plugins.overrides import apply_book_overrides

            remaining = {
                k: v
                for k, v in overrides.items()
                if k not in {"title", "author", "language"}
            }
            apply_book_overrides(session, book.id, remaining)

            for position, ch in enumerate(chapters):
                sanitized = sanitize_import_markdown(ch["body"], book.language)
                session.add(
                    Chapter(
                        book_id=book.id,
                        title=ch["title"],
                        content=md_to_html(sanitized),
                        position=position,
                        chapter_type=ChapterType.CHAPTER.value,
                    )
                )

            _import_media(session, book.id, media_dir)
            session.commit()
            return book.id
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


class DocxImportHandler(_OfficeHandlerBase):
    format_name = "docx"
    _suffix = ".docx"
    _pandoc_format = "docx"


class EpubImportHandler(_OfficeHandlerBase):
    format_name = "epub"
    _suffix = ".epub"
    _pandoc_format = "epub"


# --- Helpers ---


def _sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _convert_to_markdown(path: Path, pandoc_format: str) -> tuple[str, Path]:
    """Run Pandoc on the input and return (markdown_text, media_dir).

    ``media_dir`` is a fresh temp directory where Pandoc extracts
    embedded images / resources. The orchestrator's staging GC cleans
    the parent, but we also drop the dir after execute copies assets
    into uploads/.

    Detect + execute both call this; two invocations per import is
    acceptable given office files are rarely huge.
    """
    media_dir = Path(tempfile.mkdtemp(prefix="bibliogon_office_media_"))
    cmd = [
        "pandoc",
        "-f",
        pandoc_format,
        "-t",
        "markdown",
        "--wrap=none",
        f"--extract-media={media_dir}",
        str(path),
    ]
    try:
        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise _PandocMissing(
            "Pandoc binary not found; office import requires pandoc in PATH."
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise _PandocFailure(
            f"Pandoc failed converting {path.name}: {exc.stderr.strip()}"
        ) from exc
    return result.stdout, media_dir


_H1_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)


def _extract_title(markdown: str) -> str | None:
    match = _H1_RE.search(markdown)
    return match.group(1).strip() if match else None


def _split_into_chapters(markdown: str) -> list[dict]:
    """Split converted Markdown into chapters on H1 boundaries.

    Everything before the first H1 is discarded as pre-matter unless
    the document has no H1s at all, in which case the whole document
    is treated as a single "Untitled" chapter.
    """
    parts = _H1_RE.split(markdown)
    # _H1_RE.split returns: [pre, title1, body1, title2, body2, ...]
    if len(parts) <= 1:
        cleaned = markdown.strip()
        if not cleaned:
            return []
        return [{"title": "Untitled", "body": cleaned}]
    chapters: list[dict] = []
    for i in range(1, len(parts), 2):
        title = parts[i].strip()
        body = parts[i + 1].strip() if i + 1 < len(parts) else ""
        chapters.append({"title": title, "body": body})
    return chapters


def _detected_assets(media_dir: Path) -> list[DetectedAsset]:
    assets: list[DetectedAsset] = []
    if not media_dir.is_dir():
        return assets
    for path in sorted(media_dir.rglob("*")):
        if not path.is_file():
            continue
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        assets.append(
            DetectedAsset(
                filename=path.name,
                path=str(path.relative_to(media_dir)),
                size_bytes=size,
                mime_type=_guess_mime(path),
                purpose="figure",
            )
        )
    return assets


def _guess_mime(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".gif":
        return "image/gif"
    if suffix == ".svg":
        return "image/svg+xml"
    if suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"


def _import_media(session: Session, book_id: str, media_dir: Path) -> None:
    """Copy Pandoc-extracted images into uploads/{book}/figure/ and
    record Asset rows. No-op when media_dir is empty or missing."""
    if not media_dir.is_dir():
        return

    from app.routers.assets import UPLOAD_DIR

    dest_root = UPLOAD_DIR / book_id / "figure"
    dest_root.mkdir(parents=True, exist_ok=True)
    for path in sorted(media_dir.rglob("*")):
        if not path.is_file():
            continue
        dest = dest_root / path.name
        shutil.copy2(path, dest)
        session.add(
            Asset(
                book_id=book_id,
                filename=path.name,
                asset_type="figure",
                path=str(dest),
            )
        )


def _hard_delete_book(session: Session, book_id: str) -> None:
    session.query(Chapter).filter(Chapter.book_id == book_id).delete()
    session.query(Asset).filter(Asset.book_id == book_id).delete()
    book = session.query(Book).filter(Book.id == book_id).first()
    if book is not None:
        session.delete(book)
    session.flush()


class _PandocMissing(RuntimeError):
    """Raised when the ``pandoc`` binary is not installed."""


class _PandocFailure(RuntimeError):
    """Raised when Pandoc returned a non-zero exit code."""


class _DuplicateCancelled(Exception):
    """Raised by execute when the user chose to cancel a duplicate import."""


# Expose for external visibility in the epub-file-extension check below.
def _is_zip_epub(path: Path) -> bool:
    """Best-effort sanity check for .epub files (they are ZIP archives).

    Used only by tests + potential future smart dispatch. Not called
    from the hot path.
    """
    if not path.is_file():
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = zf.namelist()
    except zipfile.BadZipFile:
        return False
    return any(n == "mimetype" for n in names)
