"""Async audiobook-export job worker.

Runs the long-running TTS synthesis off the request path, streaming
progress through the job store. Called by the ``export_async`` route via
a background task; lazy-imports the audiobook generator.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any

from .export_helpers import (
    _audiobook_base_name,
    _read_audiobook_settings,
    _resolve_audiobook_merge_mode,
)
from .serializers import _decode_skip_chapter_types

logger = logging.getLogger(__name__)


async def _run_audiobook_job(
    job_id: str,
    book_data: dict[str, Any],
    chapters: list[dict[str, Any]],
    default_base_name: str,
    *,
    generation_mode: str = "missing_and_outdated",
) -> dict[str, Any]:
    """Audiobook job worker that streams progress events to the job store.

    The progress callback closure publishes every event the generator
    emits (start, chapter_start, chapter_done, ...) to the job, which
    the SSE endpoint then fans out to subscribers.
    """
    try:
        from bibliogon_audiobook import audiobook_storage
        from bibliogon_audiobook.generator import bundle_audiobook_output, generate_audiobook

        from app.job_store import job_store
    except ImportError:
        raise RuntimeError("Audiobook plugin not installed.") from None

    base_name = _audiobook_base_name(book_data, default_base_name)
    engine_id = book_data.get("tts_engine") or "edge-tts"
    voice = book_data.get("tts_voice") or ""
    language = book_data.get("tts_language") or book_data.get("language", "de")
    rate = book_data.get("tts_speed") or ""
    merge_mode = _resolve_audiobook_merge_mode(book_data)

    # Persistent-path mode: when we have a book_id we write chapter
    # MP3s directly into uploads/{book_id}/audiobook/chapters/ and
    # flush metadata after every chapter, so cancellation, browser
    # crash or backend restart never loses completed chapters.
    # Without a book_id (shouldn't happen from the production route,
    # but kept for defensive symmetry) we fall back to a temp dir.
    book_id = book_data.get("id")
    if book_id:
        audio_dir = audiobook_storage.prepare_chapters_dir(book_id)
    else:
        audio_dir = Path(tempfile.mkdtemp(prefix="bibliogon_ab_async_"))

    # Per-book skip list (replaces the former plugin-global
    # ``audiobook.settings.skip_types``). An empty list means "use the
    # generator's built-in SKIP_TYPES default" so existing books that
    # haven't gone through the migration still behave the same.
    book_skip_list = _decode_skip_chapter_types(book_data.get("audiobook_skip_chapter_types"))
    skip_types: set[str] | None = {str(s) for s in book_skip_list} if book_skip_list else None

    plugin_settings = _read_audiobook_settings()
    read_chapter_number = bool(plugin_settings.get("read_chapter_number", False))

    async def progress_cb(event_type: str, payload: dict[str, Any]) -> None:
        job_store.publish_event(job_id, event_type, payload)

    # Baseline metadata recorded in uploads/{book_id}/audiobook/metadata.json
    # on every incremental flush + the finalize step. Kept small and
    # serializable so the book-metadata UI can render engine/voice/speed
    # badges next to the per-chapter list.
    base_metadata: dict[str, Any] = {
        "engine": engine_id,
        "voice": voice or "default",
        "language": language,
        "speed": rate or "1.0",
        "merge_mode": merge_mode,
        "book_title": book_data.get("title"),
    }

    # Cache-dir flag: the content-hash cache lets the generator reuse
    # previously generated chapters whose content + engine + voice + speed
    # still match. The persistent path IS the cache, so when we write
    # directly there the generator sees "already on disk" and short-circuits.
    #
    # The cache is disabled entirely when generation_mode is "all" or the
    # per-book ``audiobook_overwrite_existing`` column is true. For the
    # finer modes ("missing_only", "outdated_only") the cache stays on
    # but the generator receives a positions_to_generate filter that
    # restricts which chapters enter the loop at all.
    overwrite_existing = bool(book_data.get("audiobook_overwrite_existing", False))
    disable_cache = overwrite_existing or generation_mode == "all"
    cache_dir: Path | None = None
    if book_id and not disable_cache:
        candidate = audiobook_storage.audiobook_dir(book_id) / "chapters"
        if candidate.exists():
            cache_dir = candidate

    # Position filter for fine-grained generation modes. When set, only
    # chapters whose position is in this set are processed; all others
    # are emitted as "chapter_skipped" with reason "filtered".
    #
    # "missing_and_outdated" and "all" pass None (= process everything
    # the cache/skip logic allows). "missing_only" and "outdated_only"
    # use the classification logic to pre-compute which chapters qualify.
    positions_to_generate: set[int] | None = None
    if generation_mode in ("missing_only", "outdated_only") and book_id:
        try:
            from bibliogon_audiobook.generator import (
                _slugify,
                extract_plain_text,
                should_regenerate,
            )

            chapters_dir = audiobook_storage.audiobook_dir(book_id) / "chapters"
            sorted_chs = sorted(chapters, key=lambda c: c.get("position", 0))
            positions_to_generate = set()
            for idx, ch in enumerate(sorted_chs, start=1):
                plain = extract_plain_text(ch.get("content", ""))
                fname = f"{idx:03d}-{_slugify(ch.get('title', ''))}.mp3"
                mp3 = chapters_dir / fname
                is_missing = not mp3.exists()
                is_outdated = mp3.exists() and should_regenerate(
                    plain, mp3, engine_id, voice, rate or "1.0"
                )
                if generation_mode == "missing_only" and is_missing:
                    positions_to_generate.add(ch.get("position", 0))
                elif generation_mode == "outdated_only" and is_outdated:
                    positions_to_generate.add(ch.get("position", 0))
        except Exception as classify_err:  # noqa: BLE001
            logger.warning(
                "Position filter computation failed, falling back to all: %s", classify_err
            )
            positions_to_generate = None

    async def on_chapter_persisted(mp3_path: Path, chapter_info: dict[str, Any]) -> None:
        """Record one completed chapter in metadata.json and broadcast via WS.

        Fires after each chapter MP3 lands in the persistent chapters
        dir. Without a book_id there is no persistent path, so this
        becomes a no-op (the rare defensive fallback).
        """
        if not book_id:
            return
        try:
            audiobook_storage.flush_chapter(
                book_id=book_id,
                source_mp3=mp3_path,
                chapter_extras={
                    "title": chapter_info.get("title"),
                    "position": chapter_info.get("position"),
                    "chapter_type": chapter_info.get("chapter_type"),
                    "reused": bool(chapter_info.get("reused")),
                    "index": chapter_info.get("index"),
                },
                base_metadata=base_metadata,
            )
        except Exception as flush_error:  # noqa: BLE001
            # A flush failure must not drop completed work - the MP3
            # is on disk, the next flush (or finalize) will try again.
            logger.warning(
                "Failed to flush chapter %s for book %s: %s",
                mp3_path.name,
                book_id,
                flush_error,
            )

        # Broadcast to any open metadata tabs watching this book.
        try:
            from app.routers.websocket import manager as ws_manager

            await ws_manager.broadcast(
                f"audiobook:{book_id}",
                {
                    "event": "chapter_persisted",
                    "title": chapter_info.get("title"),
                    "filename": mp3_path.name,
                    "position": chapter_info.get("position"),
                    "duration_seconds": audiobook_storage.get_mp3_duration(mp3_path),
                    "size_bytes": mp3_path.stat().st_size if mp3_path.exists() else 0,
                    "reused": bool(chapter_info.get("reused")),
                },
            )
        except Exception:  # noqa: BLE001
            pass  # WS broadcast is best-effort, never kills the export

    try:
        result = await generate_audiobook(
            book_title=book_data.get("title", "audiobook"),
            chapters=chapters,
            output_dir=audio_dir,
            engine_id=engine_id,
            voice=voice,
            language=language,
            rate=rate,
            merge=merge_mode,
            progress_callback=progress_cb,
            skip_types=skip_types,
            read_chapter_number=read_chapter_number,
            cache_dir=cache_dir,
            on_chapter_persisted=on_chapter_persisted,
            positions_to_generate=positions_to_generate,
        )
        output = bundle_audiobook_output(result, audio_dir, book_data.get("title", "audiobook"))
        if output is None:
            raise RuntimeError("Audiobook generation produced no files")
    except BaseException as run_error:
        # Partial persistence: chapters generated so far are already on
        # disk and already in metadata.json (via on_chapter_persisted).
        # We only need to annotate the metadata with the failure reason
        # so the UI can distinguish a cancelled/failed partial export
        # from a still-running one. Use BaseException so this also fires
        # on asyncio.CancelledError, which is NOT an Exception subclass.
        if book_id:
            audiobook_storage.mark_failed(book_id, str(run_error) or type(run_error).__name__)
            try:
                from app.routers.websocket import manager as ws_manager

                await ws_manager.broadcast(
                    f"audiobook:{book_id}",
                    {
                        "event": "job_failed",
                        "error": str(run_error) or type(run_error).__name__,
                    },
                )
            except Exception:  # noqa: BLE001
                pass
        raise

    # Seal the metadata: copy the merged MP3 into the persistent dir,
    # flip status to "complete" and stamp created_at. After this call
    # ``has_audiobook`` returns True and future exports get the 409
    # overwrite warning.
    if book_id:
        try:
            audiobook_storage.finalize_audiobook(
                book_id=book_id,
                source_dir=audio_dir,
                merged_file=result.get("merged_file"),
                base_metadata=base_metadata,
            )
            try:
                from app.routers.websocket import manager as ws_manager

                await ws_manager.broadcast(
                    f"audiobook:{book_id}",
                    {
                        "event": "job_complete",
                        "status": "complete",
                    },
                )
            except Exception:  # noqa: BLE001
                pass
        except Exception as finalize_error:  # noqa: BLE001
            # Finalize failure must not kill the download - chapter
            # files are already persistent, user can still grab them.
            logger.error(
                "Failed to finalize audiobook for book %s: %s",
                book_id,
                finalize_error,
                exc_info=True,
            )

    if output.suffix == ".mp3":
        download = {"path": str(output), "filename": f"{base_name}.mp3", "media_type": "audio/mpeg"}
    else:
        download = {
            "path": str(output),
            "filename": f"{base_name}-audiobook.zip",
            "media_type": "application/zip",
        }

    # Stash the per-chapter MP3 directory + filenames so the modal can
    # render individual download links via /api/export/jobs/{id}/files/{name}.
    download["audio_dir"] = str(audio_dir)
    download["chapter_files"] = list(result.get("generated_files") or [])

    # Final "ready" event so SSE clients can render the download button
    # before the synthetic stream_end fires from JobStore.update().
    job_store.publish_event(
        job_id,
        "ready",
        {
            "filename": download["filename"],
            "media_type": download["media_type"],
            "download_url": f"/api/export/jobs/{job_id}/download",
            "chapter_files": download["chapter_files"],
        },
    )
    return download
