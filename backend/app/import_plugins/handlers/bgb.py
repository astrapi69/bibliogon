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
    DetectedBookSummary,
    DetectedChapter,
    DetectedProject,
)
from app.models import Asset, Book, BookImportSource, Chapter


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
        archive_hash = _sha256_of_file(path)
        warnings: list[str] = []

        with zipfile.ZipFile(path, "r") as zf:
            _validate_manifest(zf, warnings)
            blobs = _book_blobs(zf)

        if not blobs:
            warnings.append("No book.json inside the backup.")

        is_multi_book = len(blobs) > 1
        first_blob = blobs[0] if blobs else {}
        chapters = _detected_chapters(first_blob)
        assets = _detected_assets(first_blob)

        # The orchestrator's duplicate detection works on
        # source_identifier. For single-book BGBs the legacy
        # ``sha256:<archive>`` shape stays. For multi-book BGBs we
        # use the first book's per-book identity so the wizard's
        # top-level Step 2 duplicate banner reflects something
        # sensible; per-book duplicates are surfaced inside
        # ``books`` below.
        if is_multi_book:
            source_identifier = _per_book_source_identifier(archive_hash, first_blob)
        else:
            source_identifier = f"sha256:{archive_hash}"

        books_summary: list[DetectedBookSummary] | None = None
        if is_multi_book:
            session: Session = SessionLocal()
            try:
                books_summary = [_book_summary(blob, archive_hash, session) for blob in blobs]
            finally:
                session.close()

        return DetectedProject(
            format_name=self.format_name,
            source_identifier=source_identifier,
            title=first_blob.get("title"),
            subtitle=first_blob.get("subtitle"),
            author=first_blob.get("author"),
            language=first_blob.get("language"),
            series=first_blob.get("series"),
            series_index=first_blob.get("series_index"),
            genre=first_blob.get("genre"),
            description=first_blob.get("description"),
            edition=first_blob.get("edition"),
            publisher=first_blob.get("publisher"),
            publisher_city=first_blob.get("publisher_city"),
            publish_date=first_blob.get("publish_date"),
            isbn_ebook=first_blob.get("isbn_ebook"),
            isbn_paperback=first_blob.get("isbn_paperback"),
            isbn_hardcover=first_blob.get("isbn_hardcover"),
            asin_ebook=first_blob.get("asin_ebook"),
            asin_paperback=first_blob.get("asin_paperback"),
            asin_hardcover=first_blob.get("asin_hardcover"),
            keywords=_parse_keywords_field(first_blob.get("keywords")),
            html_description=first_blob.get("html_description"),
            backpage_description=first_blob.get("backpage_description"),
            backpage_author_bio=first_blob.get("backpage_author_bio"),
            cover_image=first_blob.get("cover_image"),
            custom_css=first_blob.get("custom_css"),
            chapters=chapters,
            assets=assets,
            warnings=warnings,
            is_multi_book=is_multi_book,
            books=books_summary,
            plugin_specific_data={"book_count": len(blobs)},
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
        del git_adoption  # not applicable to .bgb
        if duplicate_action == "cancel":
            raise _DuplicateCancelled()

        # Multi-book .bgb: dispatch to the iterating path. The
        # orchestrator filters ``selected_books`` from overrides
        # before calling here; absent or empty falls through to
        # "import all" semantics for backwards compat.
        if detected.is_multi_book and detected.books:
            ids = self.execute_multi(
                input_path,
                detected,
                overrides=overrides,
            )
            return ids[0] if ids else ""

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

    # --- Multi-book extension --------------------------------------------

    def execute_multi(
        self,
        input_path: str,
        detected: DetectedProject,
        overrides: dict,
    ) -> list[str]:
        """Restore every book selected by the wizard.

        Reads the ``selected_books`` meta-override (list of
        per-book source_identifiers). Per-book duplicate decisions
        come via ``per_book_duplicate``: a dict keyed by source_id
        with values "skip" | "overwrite" | "create_new". Default
        is "skip" for any matched duplicate the user didn't decide.
        """
        if not detected.books:
            return []

        selected_raw = overrides.get("selected_books")
        if selected_raw is None:
            # No filter -> import every book in the archive.
            selected = {b.source_identifier for b in detected.books}
        elif isinstance(selected_raw, list):
            selected = {str(s) for s in selected_raw}
        else:
            raise ValueError("selected_books must be a list of source ids")

        if not selected:
            raise ValueError("selected_books is empty; pick at least one book to import")

        per_book_dup_raw = overrides.get("per_book_duplicate") or {}
        per_book_dup: dict[str, str] = (
            {str(k): str(v) for k, v in per_book_dup_raw.items()}
            if isinstance(per_book_dup_raw, dict)
            else {}
        )

        path = Path(input_path)
        archive_hash = _sha256_of_file(path)

        # Build a quick lookup from blob -> source_identifier so the
        # extraction loop can match selection without re-hashing.
        with zipfile.ZipFile(path, "r") as zf:
            blobs = _book_blobs(zf)
        wanted_uuids: set[str] = set()
        for blob in blobs:
            sid = _per_book_source_identifier(archive_hash, blob)
            if sid in selected:
                book_id = blob.get("id")
                if isinstance(book_id, str) and book_id:
                    wanted_uuids.add(book_id)

        imported: list[str] = []
        session: Session = SessionLocal()
        try:
            from app.services.backup.archive_utils import find_books_dir
            from app.services.backup.backup_import import (
                _restore_book_from_dir,
            )

            tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_bgb_multi_"))
            try:
                with zipfile.ZipFile(path, "r") as zf:
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
                    blob = json.loads(book_json.read_text(encoding="utf-8"))
                    book_uuid = str(blob.get("id", ""))
                    if not book_uuid or book_uuid not in wanted_uuids:
                        continue

                    sid = _per_book_source_identifier(archive_hash, blob)
                    action = per_book_dup.get(sid, "skip")
                    duplicate_summary = next(
                        (b for b in (detected.books or []) if b.source_identifier == sid),
                        None,
                    )
                    duplicate_id = duplicate_summary.duplicate_of if duplicate_summary else None

                    if duplicate_id and action == "skip":
                        continue
                    if duplicate_id and action == "overwrite":
                        _hard_delete_book(session, duplicate_id)
                    # action == "create_new" or no duplicate: just
                    # restore. _restore_book_from_dir already
                    # hard-deletes a soft-deleted match before
                    # rebuilding (see lessons-learned.md).

                    if _restore_book_from_dir(session, child):
                        imported.append(book_uuid)
                session.flush()
                session.commit()
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            return imported
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


# --- Helpers (module-level, testable in isolation) ---


def _parse_keywords_field(raw: object) -> list[str] | None:
    """Book.keywords is serialized as a JSON string in the .bgb blob;
    older backups may serialize as a list directly. Accept both and
    return a list[str] for the preview panel's chip renderer."""
    if raw is None:
        return None
    if isinstance(raw, list):
        return [str(k) for k in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw) if raw.strip() else None
        except (ValueError, TypeError):
            return [raw] if raw.strip() else None
        if isinstance(parsed, list):
            return [str(k) for k in parsed]
        if parsed is not None:
            return [str(parsed)]
    return None


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
        warnings.append(f"Backup contains {len(blobs)} books; preview reflects the first one only.")
    return blobs[0]


def _per_book_source_identifier(archive_hash: str, blob: dict) -> str:
    """Per-book identity inside a multi-book .bgb archive.

    Stable across re-imports of the same archive: combines the
    archive-level hash with the book's UUID so books with identical
    metadata across different exports still get distinct ids, and
    moving a book between archives does NOT change its identity
    (the UUID survives the export/import roundtrip).
    """
    book_id = str(blob.get("id") or "").strip()
    return f"sha256:{archive_hash}::{book_id}"


def _book_summary(blob: dict, archive_hash: str, session: Session) -> DetectedBookSummary:
    sid = _per_book_source_identifier(archive_hash, blob)
    chapters = blob.get("chapters") or []
    has_cover = bool((blob.get("cover_image") or "").strip())
    duplicate_of: str | None = None
    if sid:
        match = (
            session.query(BookImportSource)
            .filter(BookImportSource.source_identifier == sid)
            .first()
        )
        if match is not None:
            duplicate_of = str(match.book_id)
    return DetectedBookSummary(
        title=str(blob.get("title") or "Untitled"),
        author=blob.get("author"),
        subtitle=blob.get("subtitle"),
        chapter_count=len(chapters),
        has_cover=has_cover,
        source_identifier=sid,
        duplicate_of=duplicate_of,
    )


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
            book_id = str(json.loads(book_json.read_text(encoding="utf-8"))["id"])
            if _restore_book_from_dir(session, child):
                return book_id
        raise _BgbInvalid("Backup has no restorable book.json.")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _apply_overrides(session: Session, book_id: str, overrides: dict) -> None:
    """Delegate to the shared :mod:`app.import_plugins.overrides`
    helper so every handler applies user edits the same way."""
    from app.import_plugins.overrides import apply_book_overrides

    apply_book_overrides(session, book_id, overrides)


class _BgbInvalid(Exception):
    """Raised by execute when the .bgb archive is structurally invalid."""


class _DuplicateCancelled(Exception):
    """Raised by execute when the user chose to cancel a duplicate import."""
