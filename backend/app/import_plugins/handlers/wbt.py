"""Core handler for write-book-template (WBT) project ZIPs.

CIO-02 scope: wraps the existing ``project_import`` logic in the
``ImportPlugin`` protocol so WBT ZIPs flow through the orchestrator
wizard (detect + preview + execute) alongside ``.bgb`` and single
Markdown files. Lives in-repo as a core handler for now; the
exploration's long-term plan (Section 7 of
core-import-orchestrator.md) has this logic moving to a separate
``bibliogon-plugin-git-sync`` package as part of PGS-01.

Accepted inputs:

- A ``.zip`` file whose contents include a ``config/metadata.yaml``
  somewhere under the archive root (the WBT layout detector
  ``find_project_root`` tolerates one wrapper directory).
- A filesystem directory that IS already a WBT project root. That
  path is useful for tests and for clients that unpack a ZIP
  themselves before POSTing to the orchestrator.
"""

from __future__ import annotations

import hashlib
import shutil
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
from app.models import Asset, Book, Chapter
from app.services.backup.archive_utils import find_project_root
from app.services.backup.project_import import _import_project_root

_WBT_MARKER = "config/metadata.yaml"


class WbtImportHandler:
    """ImportPlugin for write-book-template project ZIPs and directories."""

    format_name = "wbt-zip"

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
        if path.is_dir():
            return find_project_root(path) is not None
        if path.is_file() and path.suffix.lower() == ".zip":
            try:
                with zipfile.ZipFile(path, "r") as zf:
                    names = zf.namelist()
            except zipfile.BadZipFile:
                return False
            return any(n.endswith(_WBT_MARKER) for n in names)
        return False

    def detect(self, input_path: str) -> DetectedProject:
        path = Path(input_path)
        if path.is_dir():
            project_root = find_project_root(path)
            if project_root is None:
                raise RuntimeError(
                    "WBT directory has no config/metadata.yaml"
                )
            source_identifier = _folder_signature(project_root)
        else:
            source_identifier = f"sha256:{_sha256_of_file(path)}"
            project_root = _extracted_root(path)

        metadata = _read_metadata(project_root)
        chapters = _detected_chapters(project_root)
        assets = _detected_assets(project_root)
        warnings: list[str] = []
        if metadata.get("title") is None:
            warnings.append("metadata.yaml does not declare a title.")
        if not chapters:
            warnings.append("No chapters detected under manuscript/.")
        if not any(a.purpose == "cover" for a in assets):
            warnings.append("No cover image detected under assets/covers/.")

        return DetectedProject(
            format_name=self.format_name,
            source_identifier=source_identifier,
            title=metadata.get("title"),
            author=metadata.get("author"),
            language=metadata.get("language"),
            chapters=chapters,
            assets=assets,
            warnings=warnings,
            plugin_specific_data={
                "project_root_name": project_root.name,
                "chapter_count": len(chapters),
                "asset_count": len(assets),
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

        path = Path(input_path)
        project_root = (
            find_project_root(path)
            if path.is_dir()
            else _extracted_root(path)
        )
        if project_root is None:
            raise RuntimeError("WBT project_root not found for execute")

        session: Session = SessionLocal()
        try:
            if duplicate_action == "overwrite" and existing_book_id:
                _hard_delete_book(session, existing_book_id)

            result = _import_project_root(session, project_root)
            book_id = result["book_id"]

            # _import_project_root commits at the end; reopen the book
            # to apply overrides in a fresh transaction.
            book = session.query(Book).filter(Book.id == book_id).first()
            if book is None:
                raise RuntimeError(
                    f"WBT import produced book_id {book_id!r} but no row found"
                )
            for key, value in overrides.items():
                if key not in self._ALLOWED_OVERRIDES:
                    raise KeyError(
                        f"Override {key!r} is not allowed for the wbt-zip handler"
                    )
                setattr(book, key, value)
            if overrides:
                session.commit()
            return book_id
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


# --- Helpers ---


def _sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _folder_signature(project_root: Path) -> str:
    """Stable identifier for a directory WBT project.

    Walks the manuscript directory for relative path names (not content)
    so re-imports of the same layout - even after in-place chapter
    edits - collide for duplicate detection. Matches the same semantics
    as the markdown-folder signature.
    """
    h = hashlib.sha256()
    manuscript = project_root / "manuscript"
    if manuscript.is_dir():
        for p in sorted(manuscript.rglob("*")):
            if p.is_file():
                h.update(str(p.relative_to(project_root)).encode("utf-8"))
                h.update(b"\0")
    h.update(project_root.name.encode("utf-8"))
    return f"signature:{h.hexdigest()}"


def _extracted_root(zip_path: Path) -> Path:
    """Extract the ZIP to a sibling directory and return the project root.

    The extraction is cached next to the staged ZIP so detect and
    execute in the same ``temp_ref`` don't pay the extraction cost
    twice. The staging GC in the orchestrator cleans up the whole
    ``temp_ref`` tree on TTL or on execute success.
    """
    target = zip_path.parent / f"{zip_path.name}.extracted"
    if not target.is_dir():
        target.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(target)
    root = find_project_root(target)
    if root is None:
        raise RuntimeError("Extracted ZIP has no WBT project root")
    return root


def _read_metadata(project_root: Path) -> dict:
    """Reuse the existing metadata parser for title/author/language only.

    The orchestrator wizard does not need the full ProjectMetadata
    dataclass at detect time - just the strings we surface in the
    preview panel. Import-time still uses the full parser via
    _import_project_root.
    """
    from app.services.backup.project_import import (
        _parse_project_metadata,
        _read_metadata_yaml,
    )

    try:
        raw = _read_metadata_yaml(project_root / "config" / "metadata.yaml")
    except Exception:
        return {"title": None, "author": None, "language": None}
    meta = _parse_project_metadata(raw, project_root)
    return {
        "title": meta.title,
        "author": meta.author,
        "language": meta.language,
    }


def _detected_chapters(project_root: Path) -> list[DetectedChapter]:
    manuscript = project_root / "manuscript"
    if not manuscript.is_dir():
        return []
    md_files: list[Path] = []
    for folder in ("chapters", "front-matter", "back-matter"):
        sub = manuscript / folder
        if sub.is_dir():
            md_files.extend(sorted(sub.glob("*.md")))
    # Fallback: flat manuscript/*.md for authors who skipped the
    # chapter subdir convention.
    if not md_files:
        md_files = sorted(manuscript.glob("*.md"))
    out: list[DetectedChapter] = []
    for idx, path in enumerate(md_files):
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            content = ""
        out.append(
            DetectedChapter(
                title=_chapter_title(content, path.stem),
                position=idx,
                word_count=len(content.split()),
                content_preview=content[:200],
            )
        )
    return out


def _chapter_title(content: str, fallback: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped[2:].strip()
    return fallback.replace("-", " ").strip().title() or "Untitled"


def _detected_assets(project_root: Path) -> list[DetectedAsset]:
    out: list[DetectedAsset] = []
    assets_dir = project_root / "assets"
    if not assets_dir.is_dir():
        return out
    for path in sorted(assets_dir.rglob("*")):
        if not path.is_file():
            continue
        purpose = _purpose_from_path(path.relative_to(assets_dir))
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        out.append(
            DetectedAsset(
                filename=path.name,
                path=str(path.relative_to(project_root)),
                size_bytes=size,
                mime_type=_guess_mime(path),
                purpose=purpose,
            )
        )
    return out


def _purpose_from_path(rel_path: Path) -> str:
    parts = [p.lower() for p in rel_path.parts]
    if not parts:
        return "other"
    first = parts[0]
    if first in {"cover", "covers", "back-cover"}:
        return "cover"
    if first in {"figures", "images", "img"}:
        return "figure"
    if first == "css" or rel_path.suffix.lower() == ".css":
        return "css"
    if first == "fonts" or rel_path.suffix.lower() in {".ttf", ".otf", ".woff", ".woff2"}:
        return "font"
    return "other"


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
    if suffix == ".svg":
        return "image/svg+xml"
    if suffix == ".css":
        return "text/css"
    if suffix in {".md", ".markdown"}:
        return "text/markdown"
    return "application/octet-stream"


def _hard_delete_book(session: Session, book_id: str) -> None:
    session.query(Chapter).filter(Chapter.book_id == book_id).delete()
    session.query(Asset).filter(Asset.book_id == book_id).delete()
    book = session.query(Book).filter(Book.id == book_id).first()
    if book is not None:
        session.delete(book)
    session.flush()


class _DuplicateCancelled(Exception):
    """Raised by execute when the user chose to cancel a duplicate import."""
