"""Core handler for Bibliogon's native ``.bgb`` backup archives.

Wraps the existing restore machinery in
``app.services.backup.backup_import`` so the old
``POST /api/backup/import`` endpoint keeps working while the new
orchestrator dispatches the same logic via the ``ImportPlugin``
protocol.

The handler is content-addressable: its ``source_identifier`` is
``sha256:<hex>`` of the raw ``.bgb`` bytes, so re-importing the
same file always collides with the original import regardless of
filename.
"""

from __future__ import annotations

import hashlib
import json
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


class BgbImportHandler:
    """ImportPlugin for ``.bgb`` Bibliogon backup archives."""

    format_name = "bgb"

    # --- ImportPlugin ---

    def can_handle(self, input_path: str) -> bool:
        path = Path(input_path)
        if path.suffix.lower() != ".bgb":
            return False
        try:
            with path.open("rb") as f:
                signature = f.read(4)
        except OSError:
            return False
        return signature[:2] == b"PK"

    def detect(self, input_path: str) -> DetectedProject:
        path = Path(input_path)
        source_identifier = f"sha256:{_sha256_of_file(path)}"
        warnings: list[str] = []

        with zipfile.ZipFile(path, "r") as zf:
            _validate_manifest(zf, warnings)
            book_blob = _first_book_blob(zf, warnings)

        title = (book_blob or {}).get("title")
        author = (book_blob or {}).get("author")
        language = (book_blob or {}).get("language")

        chapters = _detected_chapters(book_blob or {})
        assets = _detected_assets(book_blob or {})

        return DetectedProject(
            format_name=self.format_name,
            source_identifier=source_identifier,
            title=title,
            author=author,
            language=language,
            chapters=chapters,
            assets=assets,
            warnings=warnings,
            plugin_specific_data={"book_count": _book_count(path)},
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
        session: Session = SessionLocal()
        try:
            if duplicate_action == "overwrite" and existing_book_id:
                _hard_delete_book(session, existing_book_id)

            book_id = _restore_single_book(session, path)
            # SessionLocal is autoflush=False; force the pending Book
            # INSERT before _apply_overrides reads the row back.
            session.flush()
            _apply_overrides(session, book_id, overrides)
            session.commit()
            return book_id
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


# --- Helpers (module-level, testable in isolation) ---


def _sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _validate_manifest(zf: zipfile.ZipFile, warnings: list[str]) -> None:
    names = zf.namelist()
    manifest_name = next((n for n in names if n.endswith("manifest.json")), None)
    if manifest_name is None:
        warnings.append("No manifest.json found; file may not be a Bibliogon backup.")
        return
    try:
        data = json.loads(zf.read(manifest_name).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        warnings.append("manifest.json is not valid JSON.")
        return
    if data.get("format") != "bibliogon-backup":
        warnings.append(
            f"Unexpected manifest format: {data.get('format')!r} (expected bibliogon-backup)."
        )


def _book_blobs(zf: zipfile.ZipFile) -> list[dict]:
    out: list[dict] = []
    for name in zf.namelist():
        if name.endswith("/book.json"):
            try:
                out.append(json.loads(zf.read(name).decode("utf-8")))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
    return out


def _first_book_blob(zf: zipfile.ZipFile, warnings: list[str]) -> dict | None:
    blobs = _book_blobs(zf)
    if not blobs:
        warnings.append("No book.json inside the backup.")
        return None
    if len(blobs) > 1:
        warnings.append(
            f"Backup contains {len(blobs)} books; preview reflects the first one only."
        )
    return blobs[0]


def _book_count(path: Path) -> int:
    with zipfile.ZipFile(path, "r") as zf:
        return sum(1 for n in zf.namelist() if n.endswith("/book.json"))


def _detected_chapters(book_blob: dict) -> list[DetectedChapter]:
    return [
        DetectedChapter(
            title=ch.get("title", "Untitled"),
            position=int(ch.get("position", idx)),
            word_count=_word_count(ch.get("content", "")),
            content_preview=_preview_of(ch.get("content", "")),
        )
        for idx, ch in enumerate(book_blob.get("chapters", []) or [])
    ]


def _detected_assets(book_blob: dict) -> list[DetectedAsset]:
    return [
        DetectedAsset(
            filename=a.get("filename", ""),
            path=a.get("path", a.get("filename", "")),
            size_bytes=int(a.get("size_bytes", 0)),
            mime_type=a.get("mime_type", "application/octet-stream"),
            purpose=a.get("asset_type", "other"),
        )
        for a in book_blob.get("assets", []) or []
    ]


def _word_count(content: str) -> int:
    if not content:
        return 0
    return len(content.split())


def _preview_of(content: str) -> str:
    return (content or "")[:200]


def _hard_delete_book(session: Session, book_id: str) -> None:
    session.query(Chapter).filter(Chapter.book_id == book_id).delete()
    session.query(Asset).filter(Asset.book_id == book_id).delete()
    book = session.query(Book).filter(Book.id == book_id).first()
    if book is not None:
        session.delete(book)
    session.flush()


def _restore_single_book(session: Session, bgb_path: Path) -> str:
    """Extract the ``.bgb`` and restore its first book. Returns book_id.

    Reuses :func:`app.services.backup.backup_import._restore_book_from_dir`
    to avoid logic duplication. That function skips existing non-trashed
    books; for the orchestrator we handle the overwrite case outside by
    hard-deleting first.
    """
    from app.services.backup.archive_utils import find_books_dir
    from app.services.backup.backup_import import _restore_book_from_dir

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_bgb_handler_"))
    try:
        with zipfile.ZipFile(bgb_path, "r") as zf:
            zf.extractall(tmp_dir)
        books_dir = find_books_dir(tmp_dir)
        if books_dir is None:
            raise _BgbInvalid("Backup does not contain a books/ directory.")

        for child in sorted(books_dir.iterdir()):
            if not child.is_dir():
                continue
            book_json = child / "book.json"
            if not book_json.exists():
                continue
            book_id = json.loads(book_json.read_text(encoding="utf-8"))["id"]
            if _restore_book_from_dir(session, child):
                return book_id
        raise _BgbInvalid("Backup has no restorable book.json.")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _apply_overrides(session: Session, book_id: str, overrides: dict) -> None:
    """Apply a flat overrides dict of Book column values.

    The orchestrator passes whatever the user edited in the preview
    panel. Only a safe-listed subset of scalar Book columns is
    respected; anything else raises so the handler does not silently
    ignore a user-visible override.
    """
    if not overrides:
        return
    ALLOWED = {"title", "author", "subtitle", "language", "description", "genre"}
    book = session.query(Book).filter(Book.id == book_id).first()
    if book is None:
        return
    for key, value in overrides.items():
        if key in ALLOWED:
            setattr(book, key, value)
        else:
            raise KeyError(f"Override {key!r} is not allowed for the .bgb handler")


class _BgbInvalid(Exception):
    """Raised by execute when the .bgb archive is structurally invalid."""


class _DuplicateCancelled(Exception):
    """Raised by execute when the user chose to cancel a duplicate import."""
