"""Persistent on-disk storage for generated audiobook files.

During an audiobook export the generator writes each chapter MP3
directly into ``uploads/{book_id}/audiobook/chapters/`` (see
``_run_audiobook_job`` in the export plugin). After every chapter
finishes, :func:`flush_chapter` is called to record that chapter in
``metadata.json``, so the file is visible from the book-metadata UI
before the next chapter starts. :func:`finalize_audiobook` runs at the
end and seals the merged MP3 + flips the status from ``in_progress``
to ``complete``.

Incremental persistence means that cancellation, browser crash or
backend restart never loses completed chapters - whatever landed on
disk stays on disk and stays visible.

Layout::

    uploads/{book_id}/audiobook/
        chapters/
            001-vorwort.mp3
            001-vorwort.meta.json     (content-hash sidecar, per chapter)
            002-kapitel-1.mp3
            002-kapitel-1.meta.json
            ...
        audiobook.mp3                 (merged, only after finalize)
        metadata.json                 (engine, voice, ..., chapter_files,
                                       merged, created_at, status)

The directory layout is intentionally flat and human-browsable so
users can grab files via the OS file manager too.
"""

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
METADATA_FILENAME = "metadata.json"
CHAPTERS_DIRNAME = "chapters"
MERGED_FILENAME = "audiobook.mp3"

STATUS_IN_PROGRESS = "in_progress"
STATUS_COMPLETE = "complete"


def audiobook_dir(book_id: str, root: Path | None = None) -> Path:
    """Return the persistent audiobook directory for a book.

    The directory is NOT created here - callers that only need to read
    should check ``exists()`` first, writers should go through
    :func:`prepare_chapters_dir`.
    """
    base = root if root is not None else UPLOAD_DIR
    return base / book_id / "audiobook"


def has_audiobook(book_id: str, root: Path | None = None) -> bool:
    """True if a COMPLETED audiobook exists for this book.

    A partially persisted audiobook (status ``in_progress``) is NOT
    considered a hit: the overwrite warning should not fire when the
    user's own currently-running export is the one producing the
    partial state.
    """
    meta = load_metadata(book_id, root)
    if meta is None:
        return False
    return meta.get("status") == STATUS_COMPLETE


def prepare_chapters_dir(book_id: str, root: Path | None = None) -> Path:
    """Ensure the per-book chapters directory exists and return it.

    Does NOT wipe existing content. Incremental writes overwrite files
    in place so a partial previous run transitions file-by-file into
    the new run instead of going through an empty intermediate state.
    """
    chapters = audiobook_dir(book_id, root) / CHAPTERS_DIRNAME
    chapters.mkdir(parents=True, exist_ok=True)
    return chapters


# --- Duration readout ---

def get_mp3_duration(path: Path) -> float | None:
    """Return MP3 duration in seconds, or None if the file is unreadable.

    Uses mutagen (pure Python, no ffmpeg dependency). Never raises -
    duration is a nice-to-have field, not load-bearing, so parse
    failures degrade gracefully to None.
    """
    try:
        from mutagen.mp3 import MP3
    except ImportError:
        return None
    try:
        return round(float(MP3(str(path)).info.length), 2)
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not read duration of %s: %s", path, e)
        return None


# --- Metadata read/write helpers ---

def _metadata_path(book_id: str, root: Path | None = None) -> Path:
    return audiobook_dir(book_id, root) / METADATA_FILENAME


def load_metadata(book_id: str, root: Path | None = None) -> dict[str, Any] | None:
    """Read the persisted metadata for a book's audiobook, or None."""
    meta_path = _metadata_path(book_id, root)
    if not meta_path.exists():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Failed to read audiobook metadata for %s: %s", book_id, e)
        return None


def _write_metadata(book_id: str, metadata: dict[str, Any], root: Path | None = None) -> None:
    """Write metadata.json atomically (tmp file + rename)."""
    target_dir = audiobook_dir(book_id, root)
    target_dir.mkdir(parents=True, exist_ok=True)
    meta_path = _metadata_path(book_id, root)
    tmp_path = meta_path.with_suffix(".json.tmp")
    tmp_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_path.replace(meta_path)


# --- Incremental persistence ---

def flush_chapter(
    book_id: str,
    source_mp3: Path,
    chapter_extras: dict[str, Any],
    base_metadata: dict[str, Any],
    root: Path | None = None,
) -> dict[str, Any]:
    """Record a completed chapter in metadata.json.

    Called once per chapter, immediately after the generator finishes
    writing the MP3. Ensures the chapter is visible from the metadata
    UI before the next chapter starts.

    If ``source_mp3`` is already inside the persistent chapters dir
    (generator writes directly to the persistent path), no copy is
    performed. Otherwise the MP3 and its ``.meta.json`` sidecar are
    copied in.

    Args:
        book_id: Book ID the audiobook belongs to.
        source_mp3: Path to the freshly generated MP3.
        chapter_extras: Per-chapter metadata fields. Expected keys:
            ``title``, ``position`` (optional), ``reused`` (optional).
            ``filename``, ``size_bytes`` and ``duration_seconds`` are
            populated automatically.
        base_metadata: Baseline metadata for the current export run
            (engine, voice, language, speed, merge_mode, book_title).
            Merged into metadata.json. ``status`` is forced to
            ``in_progress`` until finalize_audiobook runs.
        root: Override for the upload root (used by tests).

    Returns:
        The full metadata dict that was written.
    """
    chapters_dir = prepare_chapters_dir(book_id, root)
    filename = source_mp3.name
    dest_mp3 = chapters_dir / filename

    if source_mp3.resolve() != dest_mp3.resolve():
        shutil.copy2(source_mp3, dest_mp3)
        src_sidecar = source_mp3.with_suffix(".meta.json")
        if src_sidecar.exists():
            shutil.copy2(src_sidecar, dest_mp3.with_suffix(".meta.json"))

    chapter_record: dict[str, Any] = {
        "filename": filename,
        "size_bytes": dest_mp3.stat().st_size,
        "duration_seconds": get_mp3_duration(dest_mp3),
        **chapter_extras,
    }

    existing = load_metadata(book_id, root) or {}
    chapter_files: list[dict[str, Any]] = list(existing.get("chapter_files") or [])
    # Replace by filename if already present (re-flush after cache hit),
    # otherwise append preserving generation order.
    replaced = False
    for i, item in enumerate(chapter_files):
        if item.get("filename") == filename:
            chapter_files[i] = chapter_record
            replaced = True
            break
    if not replaced:
        chapter_files.append(chapter_record)

    metadata: dict[str, Any] = {
        **existing,
        **base_metadata,
        "book_id": book_id,
        "chapter_files": chapter_files,
        "status": STATUS_IN_PROGRESS,
    }
    metadata.setdefault("started_at", datetime.now(timezone.utc).isoformat())
    _write_metadata(book_id, metadata, root)
    return metadata


def finalize_audiobook(
    book_id: str,
    source_dir: Path,
    merged_file: str | None,
    base_metadata: dict[str, Any],
    root: Path | None = None,
) -> dict[str, Any]:
    """Seal the audiobook export: copy merged MP3 and mark complete.

    Called once at the end of a successful export job. Flips status
    from ``in_progress`` to ``complete`` and records the completion
    timestamp, so ``has_audiobook`` starts returning True and the
    overwrite warning fires on the next export attempt.

    Args:
        book_id: Book ID.
        source_dir: Directory containing the merged MP3 (if any). May
            differ from the persistent chapters dir when merge happens
            in a temp dir.
        merged_file: Filename of the merged MP3 inside ``source_dir``,
            or None when the export produced no merged file.
        base_metadata: Baseline metadata - merged in, same fields as in
            flush_chapter.
        root: Override for the upload root.

    Returns:
        The full metadata dict that was written.
    """
    target_dir = audiobook_dir(book_id, root)
    target_dir.mkdir(parents=True, exist_ok=True)

    existing = load_metadata(book_id, root) or {}
    merged_record: dict[str, Any] | None = None
    if merged_file:
        merged_src = source_dir / merged_file
        if merged_src.exists():
            merged_dst = target_dir / MERGED_FILENAME
            if merged_src.resolve() != merged_dst.resolve():
                shutil.copy2(merged_src, merged_dst)
            merged_record = {
                "filename": MERGED_FILENAME,
                "original_filename": merged_file,
                "size_bytes": merged_dst.stat().st_size,
                "duration_seconds": get_mp3_duration(merged_dst),
            }

    metadata: dict[str, Any] = {
        **existing,
        **base_metadata,
        "book_id": book_id,
        "merged": merged_record,
        "status": STATUS_COMPLETE,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_metadata(book_id, metadata, root)
    logger.info(
        "Finalized audiobook for book %s: %d chapters%s",
        book_id,
        len(metadata.get("chapter_files") or []),
        ", with merged file" if merged_record else "",
    )
    return metadata


def mark_failed(
    book_id: str,
    error: str,
    root: Path | None = None,
) -> None:
    """Annotate metadata.json with a failure reason. Never raises.

    Called from the cancel/exception branch of the job worker so the
    UI can distinguish a cancelled/failed partial export from a
    still-running one. Missing metadata (nothing flushed yet) is
    silently ignored - there is simply nothing to annotate.
    """
    existing = load_metadata(book_id, root)
    if existing is None:
        return
    try:
        existing["status"] = STATUS_IN_PROGRESS
        existing["last_error"] = error
        existing["ended_at"] = datetime.now(timezone.utc).isoformat()
        _write_metadata(book_id, existing, root)
    except Exception as e:  # noqa: BLE001
        logger.warning("mark_failed for book %s could not write metadata: %s", book_id, e)


# --- Deletion + lookup helpers ---

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


# --- Backwards-compatible bulk API ---

def persist_audiobook(
    book_id: str,
    source_dir: Path,
    generated_files: list[str],
    merged_file: str | None,
    metadata: dict[str, Any],
    root: Path | None = None,
) -> dict[str, Any]:
    """Bulk-persist the result of an audiobook generation.

    Thin compatibility shim over :func:`flush_chapter` + :func:`finalize_audiobook`
    for callers that generated everything in a temp dir and only want
    to persist at the end (e.g. legacy tests). Production code now
    generates directly into the persistent path and calls flush_chapter
    incrementally.

    Wipes any previous audiobook dir first to preserve the pre-split
    atomic-overwrite semantics callers may rely on.
    """
    target_dir = audiobook_dir(book_id, root)
    if target_dir.exists():
        shutil.rmtree(target_dir)
    prepare_chapters_dir(book_id, root)

    for filename in generated_files:
        src = source_dir / filename
        if not src.exists():
            logger.warning("audiobook persist: missing chapter file %s", src)
            continue
        flush_chapter(
            book_id=book_id,
            source_mp3=src,
            chapter_extras={},
            base_metadata=metadata,
            root=root,
        )

    return finalize_audiobook(
        book_id=book_id,
        source_dir=source_dir,
        merged_file=merged_file,
        base_metadata=metadata,
        root=root,
    )
