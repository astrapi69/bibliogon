"""Persistent on-disk storage for generated audiobook files.

After the async export job finishes generating MP3 files in a temp dir,
:func:`persist_audiobook` copies them into ``uploads/{book_id}/audiobook/``
so the user can download them again from the metadata tab without having
to regenerate the audiobook from scratch.

Layout written by ``persist_audiobook``::

    uploads/{book_id}/audiobook/
        chapters/
            001-vorwort.mp3
            002-kapitel-1.mp3
            ...
        audiobook.mp3        (only when a merged file was generated)
        metadata.json        (engine, voice, language, speed, merge mode,
                              created_at, file sizes, list of chapter files)

The directory layout is intentionally flat and human-browsable so users
can grab files via the OS file manager too.
"""

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Project-wide convention: assets and audiobook output live next to each
# other under ``uploads/{book_id}/`` (the same root the assets router
# uses). The router defaults the root to "uploads", which is the cwd of
# the running backend - keep this in sync with ``app.routers.assets``.
UPLOAD_DIR = Path("uploads")
METADATA_FILENAME = "metadata.json"
CHAPTERS_DIRNAME = "chapters"
MERGED_FILENAME = "audiobook.mp3"


def audiobook_dir(book_id: str, root: Path | None = None) -> Path:
    """Return the persistent audiobook directory for a book.

    The directory is NOT created here - callers that only need to read
    should check ``exists()`` first, callers that write should use
    ``persist_audiobook`` which creates it.
    """
    base = root if root is not None else UPLOAD_DIR
    return base / book_id / "audiobook"


def has_audiobook(book_id: str, root: Path | None = None) -> bool:
    """True if a generated audiobook exists for this book."""
    return (audiobook_dir(book_id, root) / METADATA_FILENAME).exists()


def persist_audiobook(
    book_id: str,
    source_dir: Path,
    generated_files: list[str],
    merged_file: str | None,
    metadata: dict[str, Any],
    root: Path | None = None,
) -> dict[str, Any]:
    """Copy generated files into the persistent audiobook directory.

    Args:
        book_id: ID of the book the audiobook belongs to.
        source_dir: Temp directory the generator wrote MP3s into.
        generated_files: List of chapter MP3 filenames inside ``source_dir``.
        merged_file: Name of the merged MP3 inside ``source_dir`` or None.
        metadata: Free-form metadata to record (engine, voice, language,
            speed, merge mode, custom labels, ...). Augmented with
            ``created_at``, ``chapter_files``, ``merged_filename`` and
            ``size_bytes`` before being written.
        root: Override for the upload root (used by tests).

    Returns:
        The full metadata dict that was written to disk.

    Any pre-existing audiobook directory for this book is removed first
    so the persisted state always matches the latest generation - the
    overwrite warning that protects the user from this lives one layer
    up in the route handlers.
    """
    target_dir = audiobook_dir(book_id, root)
    if target_dir.exists():
        shutil.rmtree(target_dir)
    chapters_dir = target_dir / CHAPTERS_DIRNAME
    chapters_dir.mkdir(parents=True, exist_ok=True)

    chapter_records: list[dict[str, Any]] = []
    for filename in generated_files:
        src = source_dir / filename
        if not src.exists():
            logger.warning("audiobook persist: missing chapter file %s", src)
            continue
        dst = chapters_dir / filename
        shutil.copy2(src, dst)
        # Copy the content-hash sidecar so the next export can reuse
        # this chapter without re-generating it via TTS.
        src_meta = src.with_suffix(".meta.json")
        if src_meta.exists():
            shutil.copy2(src_meta, dst.with_suffix(".meta.json"))
        chapter_records.append({
            "filename": filename,
            "size_bytes": dst.stat().st_size,
        })

    merged_record: dict[str, Any] | None = None
    if merged_file:
        merged_src = source_dir / merged_file
        if merged_src.exists():
            merged_dst = target_dir / MERGED_FILENAME
            shutil.copy2(merged_src, merged_dst)
            merged_record = {
                "filename": MERGED_FILENAME,
                "original_filename": merged_file,
                "size_bytes": merged_dst.stat().st_size,
            }

    full_metadata: dict[str, Any] = {
        **metadata,
        "book_id": book_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "chapter_files": chapter_records,
        "merged": merged_record,
    }
    (target_dir / METADATA_FILENAME).write_text(
        json.dumps(full_metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    logger.info(
        "Persisted audiobook for book %s: %d chapters%s",
        book_id, len(chapter_records),
        ", with merged file" if merged_record else "",
    )
    return full_metadata


def load_metadata(book_id: str, root: Path | None = None) -> dict[str, Any] | None:
    """Read the persisted metadata for a book's audiobook, or None."""
    meta_path = audiobook_dir(book_id, root) / METADATA_FILENAME
    if not meta_path.exists():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Failed to read audiobook metadata for %s: %s", book_id, e)
        return None


def delete_audiobook(book_id: str, root: Path | None = None) -> bool:
    """Remove the persisted audiobook directory. Returns True if deleted."""
    target = audiobook_dir(book_id, root)
    if not target.exists():
        return False
    shutil.rmtree(target)
    return True


def chapter_file_path(book_id: str, filename: str, root: Path | None = None) -> Path | None:
    """Return the path to a single chapter MP3, or None if not present.

    Validates that the resolved path stays inside the chapters directory
    (no path traversal via crafted ``filename`` values).
    """
    chapters = audiobook_dir(book_id, root) / CHAPTERS_DIRNAME
    candidate = (chapters / filename).resolve()
    try:
        candidate.relative_to(chapters.resolve())
    except ValueError:
        return None
    if not candidate.exists():
        return None
    return candidate


def merged_file_path(book_id: str, root: Path | None = None) -> Path | None:
    """Return the merged MP3 path, or None if not present."""
    candidate = audiobook_dir(book_id, root) / MERGED_FILENAME
    return candidate if candidate.exists() else None
