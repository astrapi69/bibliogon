"""FastAPI routes for the export plugin.

Thin router layer: the route handlers validate input and delegate to the
focused modules split out of the former 1619-line god-file -
:mod:`.deps` (DI), :mod:`.loaders` (DB reads), :mod:`.serializers`,
:mod:`.pdf_export` (WeasyPrint dispatch), :mod:`.export_helpers`
(config/filename/scaffold/document render), and :mod:`.audiobook_job`
(async TTS worker). ``configure`` is re-exported here because
``ExportPlugin`` imports it from this module.
"""

from __future__ import annotations

import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from .audiobook_job import _run_audiobook_job
from .deps import configure as configure
from .export_helpers import (
    EXT_MAP,
    MEDIA_TYPES,
    _build_filename,
    _detect_manual_toc,
    _export_document,
    _export_project,
    _find_cover,
    _load_export_config,
    _missing_images_http_exception,
    _scaffold_and_prepare,
)
from .loaders import (
    _load_book,
    _load_book_overwrite_flag,
    _load_comic_book_data,
    _load_picture_book_pages,
)
from .pandoc_runner import MissingImagesError, PandocError, run_pandoc
from .pdf_export import _export_comic_book_pdf, _export_picture_book_pdf
from .scaffolder import scaffold_project

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books/{book_id}/export", tags=["export"])

SUPPORTED_FORMATS = {"epub", "pdf", "docx", "html", "markdown", "project", "audiobook"}
BATCH_FORMATS = ["epub", "pdf", "docx"]


@router.get("/validate-epub")
def validate_epub(book_id: str, db: Any = Depends(lambda: None)):
    """Export EPUB and validate with epubcheck."""
    book_data, chapters, assets = _load_book(book_id)
    config, export_settings = _load_export_config()
    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_validate_"))
    try:
        project_dir = scaffold_project(book_data, chapters, tmp_dir, export_settings, assets)
        cover = book_data.get("cover_image")
        output = run_pandoc(
            project_dir,
            "epub",
            config,
            use_manual_toc=_detect_manual_toc(chapters),
            cover_path=cover,
        )
        results_path = output.with_suffix(".epubcheck.json")
        if results_path.exists():
            return json.loads(results_path.read_text(encoding="utf-8"))
        return {"valid": True, "errors": [], "warnings": [], "error_count": 0, "warning_count": 0}
    except MissingImagesError as e:
        raise _missing_images_http_exception(e) from e
    except PandocError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/batch")
def export_batch_route(
    book_id: str,
    book_type: str = "ebook",
    use_manual_toc: bool | None = None,
    db: Any = Depends(lambda: None),
):
    """Export EPUB + PDF + DOCX as a single ZIP."""
    book_data, chapters, assets = _load_book(book_id)
    tmp_dir, project_dir, config, settings = _scaffold_and_prepare(book_data, chapters, assets)
    slug = project_dir.name
    manual_toc = use_manual_toc if use_manual_toc is not None else _detect_manual_toc(chapters)
    cover = _find_cover(book_data, project_dir)

    # Stash each format's output in a stable dir BEFORE the next
    # run_pandoc call. manuscripta's run_export moves `project/output/`
    # into `project/backup/` at the start of every call, which would
    # invalidate a path held from the previous iteration. Copying into
    # tmp_dir/batch/ decouples the ZIP from manuscripta's internal
    # housekeeping.
    import shutil

    batch_dir = tmp_dir / "batch"
    batch_dir.mkdir(parents=True, exist_ok=True)
    staged_files: list[Path] = []
    errors: list[str] = []
    for fmt in BATCH_FORMATS:
        try:
            produced = run_pandoc(
                project_dir, fmt, config, use_manual_toc=manual_toc, cover_path=cover
            )
            staged = batch_dir / produced.name
            shutil.copy2(produced, staged)
            staged_files.append(staged)
        except PandocError as e:
            errors.append(f"{fmt}: {e}")
    if not staged_files:
        raise HTTPException(status_code=500, detail=f"All exports failed: {'; '.join(errors)}")

    import zipfile

    zip_path = tmp_dir / f"{slug}-batch.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in staged_files:
            zf.write(f, f.name)
    return FileResponse(
        path=str(zip_path), media_type="application/zip", filename=f"{slug}-batch.zip"
    )


@router.get("/{fmt}")
def export(
    book_id: str,
    fmt: str,
    book_type: str = "ebook",
    toc_depth: int = 0,
    use_manual_toc: bool | None = None,
    picture_book_format: str | None = None,
    picture_book_bleed_marks: bool = False,
    db: Any = Depends(lambda: None),
):
    """Export a book. Dispatches to format-specific handler.

    PB-PHASE4 Session 6: when Book.book_type == "picture_book"
    (the Bibliogon CONTENT discriminator), dispatches to the
    WeasyPrint-based generator instead of the chapter/manuscripta
    pipeline.

    Naming-collision note: the ``book_type`` query parameter above
    is manuscripta's PRINT-EDITION concept (ebook | paperback |
    hardcover | audiobook). The dispatch below reads
    ``Book.book_type`` (the content discriminator: prose |
    picture_book | future comic_book). Different namespaces, same
    name — disambiguate by source (model field = content; query
    param = print edition).

    PDF-KDP-FORMATS-01: ``picture_book_format`` query param picks the
    KDP trim size (one of the 5 entries in
    ``picture_book_pdf.PICTURE_BOOK_FORMATS``). Missing / null /
    empty / unknown values silently fall back to 8.5x8.5 (the v0.35.0
    MVP default). Other ``Book.book_type`` paths ignore this param.

    PDF-BLEED-MARKS-01: ``picture_book_bleed_marks`` query param
    (bool) toggles the KDP-spec 0.125in bleed extension + crop
    marks on the rendered PDF. Default False keeps the back-compat
    trim-only emit. Other ``Book.book_type`` paths ignore this
    param.
    """
    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{fmt}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
        )

    book_data, chapters, assets = _load_book(book_id)

    # Branch on content discriminator BEFORE scaffolding (which
    # assumes the chapter-based shape and would fail or produce
    # garbage for picture-books).
    if book_data.get("book_type") == "picture_book":
        if fmt != "pdf":
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Picture-books only support PDF export in this "
                    f"release; got fmt={fmt!r}. EPUB-for-picture-books "
                    f"is not yet filed; consider opening an issue if "
                    f"needed."
                ),
            )
        # Re-query through the picture-book loader: the chapter-
        # based _load_book above doesn't include asset.id (chapter
        # pipeline references assets by filename) and doesn't query
        # pages at all. _load_picture_book_pages also re-validates
        # the content discriminator as a defensive sanity check.
        pb_book_data, pages, pb_assets = _load_picture_book_pages(book_id)
        try:
            return _export_picture_book_pdf(
                pb_book_data,
                pages,
                pb_assets,
                picture_book_format=picture_book_format,
                picture_book_bleed_marks=picture_book_bleed_marks,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Picture-book export failed: {e}",
            ) from e

    if book_data.get("book_type") == "comic_book":
        if fmt != "pdf":
            raise HTTPException(
                status_code=400,
                detail=(f"Comic-books only support PDF export in this release; got fmt={fmt!r}."),
            )
        cb_book_data, cb_pages, cb_panels, cb_bubbles, cb_assets = _load_comic_book_data(book_id)
        try:
            return _export_comic_book_pdf(
                cb_book_data,
                cb_pages,
                cb_panels,
                cb_bubbles,
                cb_assets,
                picture_book_format=picture_book_format,
                picture_book_bleed_marks=picture_book_bleed_marks,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Comic-book export failed: {e}",
            ) from e

    # Prose path (unchanged from pre-Session-6 behavior).
    tmp_dir, project_dir, config, settings = _scaffold_and_prepare(
        book_data, chapters, assets, toc_depth
    )
    base_name = _build_filename(project_dir.name, book_type, settings)
    manual_toc = use_manual_toc if use_manual_toc is not None else _detect_manual_toc(chapters)

    try:
        if fmt == "project":
            return _export_project(base_name, tmp_dir, project_dir)
        if fmt == "audiobook":
            # Audiobook export is always async with progress streaming.
            # Synchronously returning an MP3 here would block the request
            # for minutes and silently regress the progress UX. The client
            # MUST use POST /export/async/audiobook + the SSE stream.
            raise HTTPException(
                status_code=410,
                detail=(
                    "Audiobook export is async only. POST /api/books/{id}/export/async/audiobook"
                    " and stream progress from /api/export/jobs/{job_id}/stream."
                ),
            )
        cover = _find_cover(book_data, project_dir)
        return _export_document(fmt, base_name, project_dir, config, manual_toc, cover)
    except MissingImagesError as e:
        raise _missing_images_http_exception(e) from e
    except PandocError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}") from e


# --- Async Export ---


@router.post("/async/{fmt}")
async def export_async(
    book_id: str,
    fmt: str,
    book_type: str = "ebook",
    use_manual_toc: bool | None = None,
    confirm_overwrite: bool = False,
    generation_mode: str = "missing_and_outdated",
) -> dict[str, Any]:
    """Start an export job in the background.

    For ``fmt=audiobook``, refuses to start if ANY persisted audiobook
    metadata exists for the book (complete OR partial from a cancelled
    export) unless ``confirm_overwrite=true``. The 409 response carries
    the existing metadata plus chapter counts so the frontend can show
    the regeneration-mode dialog.

    ``generation_mode`` controls which chapters are processed:

    - ``missing_and_outdated`` (default): generate chapters without MP3
      AND chapters whose content/engine/voice/speed changed since the
      last export. This is the standard "skip existing" behavior.
    - ``missing_only``: generate only chapters that have no MP3 at all.
      Stale-hash chapters are left untouched.
    - ``outdated_only``: regenerate only chapters whose hash changed.
      Chapters without any MP3 are skipped.
    - ``all``: disable the content-hash cache entirely and regenerate
      every chapter from scratch.

    The per-book ``Book.audiobook_overwrite_existing`` column still
    applies as a permanent preference that overrides generation_mode.
    """
    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{fmt}'.")
    try:
        from app.job_store import job_store
    except ImportError:
        raise HTTPException(status_code=500, detail="Job store not available") from None

    if fmt == "audiobook" and not confirm_overwrite:
        try:
            from bibliogon_audiobook import audiobook_storage
        except ImportError:
            audiobook_storage = None  # type: ignore[assignment]
        if audiobook_storage is not None and not _load_book_overwrite_flag(book_id):
            existing = audiobook_storage.load_metadata(book_id)
            if existing is not None:
                chapter_count = len(existing.get("chapter_files") or [])
                # Count total book chapters so the dialog can show
                # "23 of 30 chapters already have audio".
                total_chapters = 0
                try:
                    _, chapters_raw, _ = _load_book(book_id)
                    total_chapters = len(chapters_raw)
                except Exception:  # noqa: BLE001
                    pass
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "audiobook_exists",
                        "message": "An audiobook already exists for this book.",
                        "status": existing.get("status", "complete"),
                        "chapter_count": chapter_count,
                        "total_chapters": total_chapters,
                        "existing": {
                            "created_at": existing.get("created_at"),
                            "engine": existing.get("engine"),
                            "voice": existing.get("voice"),
                            "language": existing.get("language"),
                            "speed": existing.get("speed"),
                            "merge_mode": existing.get("merge_mode"),
                        },
                    },
                )

    async def _run(job_id: str) -> dict[str, Any]:
        book_data, chapters, assets = _load_book(book_id)
        tmp_dir, project_dir, config, settings = _scaffold_and_prepare(book_data, chapters, assets)
        base_name = _build_filename(project_dir.name, book_type, settings)
        manual_toc = use_manual_toc if use_manual_toc is not None else _detect_manual_toc(chapters)

        if fmt == "project":
            zip_path = shutil.make_archive(str(tmp_dir / "project"), "zip", str(project_dir))
            bgp_path = zip_path.replace(".zip", ".bgp")
            Path(zip_path).rename(bgp_path)
            return {
                "path": bgp_path,
                "filename": f"{base_name}.bgp",
                "media_type": "application/octet-stream",
            }

        if fmt == "audiobook":
            return await _run_audiobook_job(
                job_id, book_data, chapters, base_name, generation_mode=generation_mode
            )

        cover = _find_cover(book_data, project_dir)
        output = run_pandoc(project_dir, fmt, config, use_manual_toc=manual_toc, cover_path=cover)
        media_type = MEDIA_TYPES.get(fmt, "application/octet-stream")
        ext = EXT_MAP.get(fmt, output.suffix or f".{fmt}")
        return {"path": str(output), "filename": f"{base_name}{ext}", "media_type": media_type}

    job_id = job_store.submit(_run)
    logger.info("Export job %s started: book=%s fmt=%s", job_id, book_id, fmt)
    return {"job_id": job_id, "status": "pending"}


# --- Bulk-export router (AR-BULK-BOOKS-PARITY-01) ---
#
# POST /api/books/bulk-export accepts an explicit list of book IDs
# and a single document format, then returns a ZIP containing the
# rendered file for each book. Mirrors the articles-bulk-export
# pattern shipped in v0.27.0 with two scope deltas:
#
# 1. ZIP-of-books only. A "combined document" mode is conceptually
#    wrong for books because the existing per-book pipeline goes
#    through manuscripta + write-book-template scaffolding and
#    produces one project per book; merging N books into a single
#    EPUB / PDF would require deciding whose metadata wins, which
#    book contributes the cover, etc. - none of which is a natural
#    user request. Surfaced as a future scope decision in the
#    backlog if it ever becomes one.
# 2. No new filter facets here. The Books dashboard already filters
#    by genre + language + search; adding series + keyword filters
#    is a separate concern (parallel to articles' series/tag work)
#    and the bulk endpoint just consumes the dashboard's filtered ID
#    list either way.

bulk_router = APIRouter(prefix="/books/bulk-export", tags=["export"])

MAX_BULK_BOOKS = 200
_BULK_FORMATS: tuple[str, ...] = ("epub", "pdf", "docx")


class BookBulkExportRequest(BaseModel):
    book_ids: list[str] = Field(min_length=1, max_length=MAX_BULK_BOOKS)
    format: Literal["epub", "pdf", "docx"]


def _per_book_artifact(book_id: str, fmt: str) -> tuple[str, bytes]:
    """Render one book as ``fmt`` and return (slug, bytes).

    Reuses the existing per-book pipeline: ``_load_book`` ->
    ``_scaffold_and_prepare`` -> ``run_pandoc``. Wraps any HTTPException
    raised by the helpers with the offending book's title so the
    eventual error toast names the broken book directly. Pre-existing
    ``MissingImagesError`` / ``PandocError`` paths in the per-book
    route raise their own structured 422; the same shape surfaces
    from here unchanged.
    """
    book_data, chapters, assets = _load_book(book_id)
    tmp_dir, project_dir, config, settings = _scaffold_and_prepare(book_data, chapters, assets)
    slug = project_dir.name
    manual_toc = _detect_manual_toc(chapters)
    cover = _find_cover(book_data, project_dir)
    try:
        produced = run_pandoc(project_dir, fmt, config, use_manual_toc=manual_toc, cover_path=cover)
    except MissingImagesError as exc:
        raise _missing_images_http_exception(exc) from exc
    except PandocError as exc:
        raise HTTPException(
            status_code=502,
            detail=(f"Failed exporting book {book_data.get('title') or book_id!r}: {exc}"),
        ) from exc
    return slug, produced.read_bytes()


@bulk_router.post("")
def bulk_export(req: BookBulkExportRequest) -> Response:
    """Export multiple books as a ZIP-of-individual-files.

    Pydantic validates ``book_ids`` length (min 1, max 200). Empty
    or over-limit lists return 422 with a structured message rather
    than a generic 400. Filename collisions on slug get numeric
    suffixes (``slug-2.epub``) per the same convention used by the
    articles bulk-export.

    The response carries a date-stamped ZIP filename
    (``books-YYYY-MM-DD.zip``) so the user can sort multiple bulk
    exports without renaming.
    """
    import zipfile
    from datetime import UTC, datetime

    today = datetime.now(UTC).strftime("%Y-%m-%d")
    zip_filename = f"books-{today}.zip"
    headers = {"Content-Disposition": f'attachment; filename="{zip_filename}"'}
    ext = EXT_MAP[req.format].lstrip(".")
    seen_slugs: dict[str, int] = {}

    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = Path(tmpdir) / zip_filename
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for book_id in req.book_ids:
                slug, payload = _per_book_artifact(book_id, req.format)
                count = seen_slugs.get(slug, 0)
                seen_slugs[slug] = count + 1
                if count == 0:
                    name = f"{slug}.{ext}"
                else:
                    name = f"{slug}-{count + 1}.{ext}"
                zf.writestr(name, payload)
        zip_bytes = zip_path.read_bytes()

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        status_code=status.HTTP_200_OK,
        headers=headers,
    )


# --- Job polling router ---

jobs_router = APIRouter(prefix="/export/jobs", tags=["export-jobs"])


@jobs_router.get("/{job_id}")
def get_job_status(job_id: str) -> dict[str, Any]:
    """Snapshot of an async export job: status + progress + recent events.

    The SSE endpoint at ``/{job_id}/stream`` is the canonical way to follow
    a long-running job. This polling endpoint stays around as a fallback
    and for clients that just want a one-shot status check.
    """
    try:
        from app.job_store import job_store
    except ImportError:
        raise HTTPException(status_code=500, detail="Job store not available") from None
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    result: dict[str, Any] = {
        "job_id": job.id,
        "status": job.status.value,
        "progress": dict(job.progress),
        "events": list(job.events[-20:]),  # last 20 keeps responses small
    }
    if job.error:
        result["error"] = job.error
    if job.status.value == "completed" and job.result.get("filename"):
        result["filename"] = job.result["filename"]
        result["download_url"] = f"/api/export/jobs/{job_id}/download"
        chapter_files = job.result.get("chapter_files") or []
        if chapter_files:
            result["chapter_files"] = [
                {"filename": fn, "url": f"/api/export/jobs/{job_id}/files/{fn}"}
                for fn in chapter_files
            ]
    return result


@jobs_router.get("/{job_id}/stream")
async def stream_job_events(job_id: str) -> StreamingResponse:
    """Server-Sent Events stream of every event a job emits.

    Replays the full event log on connect (so a late subscriber sees the
    same picture as one that connected at the start), then forwards new
    events as they arrive. Closes when the job's synthetic ``stream_end``
    event is seen. The frontend uses the browser-native ``EventSource``
    API, no extra dependency required.
    """
    try:
        from app.job_store import job_store
    except ImportError:
        raise HTTPException(status_code=500, detail="Job store not available") from None
    if job_store.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator() -> Any:
        async for event in job_store.subscribe(job_id):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Tell reverse proxies (nginx) to not buffer this response
            "X-Accel-Buffering": "no",
        },
    )


@jobs_router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_job(job_id: str) -> None:
    """Cancel a running export job.

    Idempotent: returns 204 if the job exists and was running, 404 if
    the job is unknown, 409 if it has already finished. The cancellation
    flips the job status to CANCELLED, the SSE stream sees ``stream_end``
    and the client disconnects cleanly.
    """
    try:
        from app.job_store import JobStatus, job_store
    except ImportError:
        raise HTTPException(status_code=500, detail="Job store not available") from None
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
        raise HTTPException(status_code=409, detail=f"Job is already {job.status.value}")
    job_store.cancel(job_id)


@jobs_router.get("/{job_id}/files/{filename}")
def download_job_chapter_file(job_id: str, filename: str) -> FileResponse:
    """Serve an individual generated chapter file from a finished audiobook job.

    Lets the frontend offer per-chapter download links in the progress
    modal alongside the bundled ZIP/MP3. Only files that the job's
    generator actually produced are served (no path traversal: the
    requested filename must literally match an entry in
    ``job.result.chapter_files``).
    """
    try:
        from app.job_store import job_store
    except ImportError:
        raise HTTPException(status_code=500, detail="Job store not available") from None
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status.value != "completed":
        raise HTTPException(status_code=409, detail=f"Job is {job.status.value}, not completed")
    chapter_files = job.result.get("chapter_files") or []
    if filename not in chapter_files:
        raise HTTPException(status_code=404, detail="Chapter file not in this job")
    audio_dir = job.result.get("audio_dir")
    if not audio_dir:
        raise HTTPException(status_code=410, detail="Job has no audio directory")
    file_path = Path(audio_dir) / filename
    if not file_path.exists():
        raise HTTPException(status_code=410, detail="Chapter file no longer available")
    return FileResponse(path=str(file_path), media_type="audio/mpeg", filename=filename)


@jobs_router.get("/{job_id}/download")
def download_job_result(job_id: str) -> FileResponse:
    """Download the result of a completed export job."""
    try:
        from app.job_store import job_store
    except ImportError:
        raise HTTPException(status_code=500, detail="Job store not available") from None
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status.value != "completed":
        raise HTTPException(status_code=409, detail=f"Job is {job.status.value}, not completed")
    path = job.result.get("path")
    if not path or not Path(path).exists():
        raise HTTPException(status_code=410, detail="Export file no longer available")
    return FileResponse(
        path=path,
        media_type=job.result.get("media_type", "application/octet-stream"),
        filename=job.result.get("filename", "export"),
    )


# PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01: pluginforge 0.8.0
# deprecated returning multiple top-level routers from a plugin's
# get_routes() and recommends the Single-Router-Per-Plugin
# convention (one parent router nesting sub-routers via
# include_router). The three sub-routers above
# (router, bulk_router, jobs_router) keep their distinct prefixes
# + tags; the parent is empty-prefix so each sub-router's prefix
# applies as-is. Mirrors the canonical shape used by
# plugin-kinderbuch + plugin-comics.
parent_router = APIRouter(tags=["export"])
parent_router.include_router(router)
parent_router.include_router(bulk_router)
parent_router.include_router(jobs_router)
