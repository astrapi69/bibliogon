"""FastAPI routes for the export plugin."""

import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse

from .pandoc_runner import MissingImagesError, PandocError, run_pandoc
from .scaffolder import scaffold_project


def _missing_images_http_exception(error: MissingImagesError) -> HTTPException:
    """Wrap MissingImagesError in a structured 422 the frontend can render.

    The detail dict carries the i18n key plus the raw list of unresolved
    paths so the toast can show specific filenames, not a generic message.
    """
    return HTTPException(
        status_code=422,
        detail={
            "code": "missing_images",
            "i18n_key": "export.errors.missing_images",
            "unresolved": error.unresolved,
            "message": str(error),
        },
    )

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books/{book_id}/export", tags=["export"])

_get_db = None
_book_model = None

SUPPORTED_FORMATS = {"epub", "pdf", "docx", "html", "markdown", "project", "audiobook"}
BATCH_FORMATS = ["epub", "pdf", "docx"]

MEDIA_TYPES = {
    "epub": "application/epub+zip",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "html": "text/html",
    "markdown": "text/markdown",
}

EXT_MAP = {"epub": ".epub", "pdf": ".pdf", "docx": ".docx", "html": ".html", "markdown": ".md"}


def configure(get_db_dep: Any, book_model: Any) -> None:
    """Configure route dependencies. Called by ExportPlugin.activate()."""
    global _get_db, _book_model
    _get_db = get_db_dep
    _book_model = book_model


# --- Shared helpers (each under 40 lines, individually testable) ---


def _require_db() -> Any:
    """Get a DB session via the configured dependency, or raise."""
    if _get_db is None:
        raise HTTPException(status_code=500, detail="Export plugin not configured")
    db_gen = _get_db()
    return db_gen, next(db_gen)


def _close_db(db_gen: Any) -> None:
    """Close a DB session generator."""
    try:
        next(db_gen)
    except StopIteration:
        pass


def _load_book(book_id: str) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Load book, chapters, and assets from DB."""
    db_gen, db = _require_db()
    try:
        return _query_book_data(book_id, db)
    finally:
        _close_db(db_gen)


def _load_book_overwrite_flag(book_id: str) -> bool:
    """Read only the ``audiobook_overwrite_existing`` column for one book.

    Used by the pre-flight 409 check so we do not pay the cost of loading
    the full book + chapters just to decide whether to skip the warning.
    Returns False when the column or the book is missing.
    """
    if _book_model is None:
        return False
    db_gen, db = _require_db()
    try:
        Book = _book_model
        book = db.query(Book).filter(Book.id == book_id).first()
        if book is None:
            return False
        return bool(getattr(book, "audiobook_overwrite_existing", False))
    finally:
        _close_db(db_gen)


def _query_book_data(book_id: str, db: Any) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Query book data from DB and return as dicts."""
    from sqlalchemy.orm import joinedload
    from app.models import Asset

    if _book_model is None:
        raise HTTPException(status_code=500, detail="Export plugin not properly configured")

    Book = _book_model
    book = db.query(Book).options(joinedload(Book.chapters)).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    book_data = _serialize_book(book)
    chapters_data = _serialize_chapters(book.chapters)
    assets_data = [
        {"filename": a.filename, "asset_type": a.asset_type, "path": a.path}
        for a in db.query(Asset).filter(Asset.book_id == book_id).all()
    ]
    return book_data, chapters_data, assets_data


def _serialize_book(book: Any) -> dict[str, Any]:
    """Serialize a Book ORM object to a dict."""
    return {
        "id": book.id, "title": book.title, "subtitle": book.subtitle,
        "author": book.author, "language": book.language,
        "series": book.series, "series_index": book.series_index,
        "description": book.description, "cover_image": book.cover_image,
        "custom_css": book.custom_css,
        "ai_assisted": getattr(book, "ai_assisted", False),
        "tts_engine": getattr(book, "tts_engine", None),
        "tts_voice": getattr(book, "tts_voice", None),
        "tts_language": getattr(book, "tts_language", None),
        "tts_speed": getattr(book, "tts_speed", None),
        "audiobook_overwrite_existing": bool(
            getattr(book, "audiobook_overwrite_existing", False)
        ),
        "audiobook_skip_chapter_types": _decode_skip_chapter_types(
            getattr(book, "audiobook_skip_chapter_types", None)
        ),
    }


def _decode_skip_chapter_types(raw: Any) -> list[str]:
    """Decode the JSON-encoded ``audiobook_skip_chapter_types`` Text column.

    Returns an empty list when the column is unset, empty, or malformed
    so the export pipeline can simply ``len(...)`` to decide whether to
    apply a per-book filter or fall back to the generator's built-in
    SKIP_TYPES default.
    """
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        return [str(v) for v in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [str(v) for v in parsed]
    return []


def _serialize_chapters(chapters: list) -> list[dict[str, Any]]:
    """Serialize chapter ORM objects to dicts."""
    result = []
    for ch in sorted(chapters, key=lambda c: c.position):
        content = ch.content
        try:
            content = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            pass
        result.append({
            "title": ch.title, "content": content,
            "position": ch.position, "chapter_type": ch.chapter_type,
        })
    return result


def _load_export_config() -> tuple[dict[str, Any], dict[str, Any]]:
    """Load export plugin config and settings from YAML."""
    import yaml
    config_path = Path("config/plugins/export.yaml")
    config: dict[str, Any] = {}
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
    return config, config.get("settings", {})


def _build_filename(slug: str, book_type: str, export_settings: dict[str, Any]) -> str:
    """Build the export filename base from slug and book type."""
    type_suffix = export_settings.get("type_suffix_in_filename", True)
    return f"{slug}-{book_type}" if type_suffix else slug


def _audiobook_base_name(book_data: dict[str, Any], default_base_name: str) -> str:
    """Return the user-provided audiobook filename if set, else the default.

    The custom name comes from ``Book.audiobook_filename`` (set per book in
    the metadata editor). It is sanitized to a safe filesystem stem so the
    final ``.mp3`` / ``.zip`` filename is always usable.
    """
    custom = (book_data.get("audiobook_filename") or "").strip()
    if not custom:
        return default_base_name
    # Sanitize path separators (no traversal) but keep dots for the
    # extension-stripping pass below.
    cleaned = custom.replace("/", "_").replace("\\", "_")
    for ext in (".mp3", ".zip", ".m4a", ".m4b"):
        if cleaned.lower().endswith(ext):
            cleaned = cleaned[: -len(ext)]
            break
    cleaned = cleaned.strip(". ")
    return cleaned or default_base_name


def _detect_manual_toc(chapters: list[dict[str, Any]]) -> bool:
    """Check if any chapter is a manual TOC."""
    return any(ch.get("chapter_type") == "toc" for ch in chapters)


def _find_cover(book_data: dict[str, Any], project_dir: Path) -> str | None:
    """Find cover image path from book data or scaffolded assets."""
    cover = book_data.get("cover_image")
    if cover:
        return cover
    for ext in ("png", "jpg", "jpeg"):
        candidate = project_dir / "assets" / "covers" / f"cover.{ext}"
        if candidate.exists():
            return str(candidate)
    return None


def _scaffold_and_prepare(
    book_data: dict[str, Any],
    chapters: list[dict[str, Any]],
    assets: list[dict[str, Any]],
    toc_depth: int = 0,
) -> tuple[Path, Path, dict[str, Any], dict[str, Any]]:
    """Scaffold project and return (tmp_dir, project_dir, config, settings)."""
    config, export_settings = _load_export_config()
    if toc_depth > 0:
        export_settings["toc_depth"] = toc_depth
    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_export_"))
    project_dir = scaffold_project(book_data, chapters, tmp_dir, export_settings, assets)
    return tmp_dir, project_dir, config, export_settings


# --- Format-specific exporters ---


def _export_project(base_name: str, tmp_dir: Path, project_dir: Path) -> FileResponse:
    """Export as write-book-template project ZIP (.bgp)."""
    zip_path = shutil.make_archive(str(tmp_dir / "project"), "zip", str(project_dir))
    bgp_path = zip_path.replace(".zip", ".bgp")
    Path(zip_path).rename(bgp_path)
    return FileResponse(path=bgp_path, media_type="application/octet-stream", filename=f"{base_name}.bgp")


def _read_audiobook_merge_setting() -> str:
    """Read merge setting from audiobook plugin config. Default: 'merged'.

    Accepts legacy boolean values (True -> 'merged', False -> 'separate').
    """
    import yaml
    try:
        from bibliogon_audiobook.generator import normalize_merge_mode
    except ImportError:
        normalize_merge_mode = lambda v: "merged" if v in (True, None) else ("separate" if v is False else v)  # noqa: E731

    config_path = Path("config/plugins/audiobook.yaml")
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
            return normalize_merge_mode(cfg.get("settings", {}).get("merge"))
        except Exception:
            pass
    return "merged"


def _resolve_audiobook_merge_mode(book_data: dict[str, Any]) -> str:
    """Per-book override beats plugin config; both feed normalize_merge_mode."""
    try:
        from bibliogon_audiobook.generator import normalize_merge_mode
    except ImportError:
        return _read_audiobook_merge_setting()
    book_value = book_data.get("audiobook_merge")
    if book_value:
        return normalize_merge_mode(book_value)
    return _read_audiobook_merge_setting()


def _read_audiobook_settings() -> dict[str, Any]:
    """Read the audiobook plugin's full settings dict from disk.

    Used to forward user-defined ``skip_types`` and other generator
    options into ``_run_audiobook_job``. Returns an empty dict if the
    config file is missing or unreadable.
    """
    import yaml
    config_path = Path("config/plugins/audiobook.yaml")
    if not config_path.exists():
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
    except Exception:
        return {}
    settings = cfg.get("settings") or {}
    return settings if isinstance(settings, dict) else {}


# NOTE: the previous synchronous _export_audiobook helper was removed
# deliberately - audiobook generation can take minutes and must always
# go through the async job + SSE stream. The sync GET /export/audiobook
# route now responds with HTTP 410 to make accidental sync use loud.


def _export_document(
    fmt: str, base_name: str, project_dir: Path, config: dict[str, Any],
    use_manual_toc: bool, cover_path: str | None,
) -> FileResponse:
    """Export via manuscripta/pandoc (epub, pdf, docx, html, markdown)."""
    output_path = run_pandoc(project_dir, fmt, config, use_manual_toc=use_manual_toc, cover_path=cover_path)
    media_type = MEDIA_TYPES.get(fmt, "application/octet-stream")
    ext = EXT_MAP.get(fmt, output_path.suffix or f".{fmt}")
    return FileResponse(path=str(output_path), media_type=media_type, filename=f"{base_name}{ext}")


# --- Route handlers (thin dispatchers) ---


@router.get("/validate-epub")
def validate_epub(book_id: str, db: Any = Depends(lambda: None)):
    """Export EPUB and validate with epubcheck."""
    book_data, chapters, assets = _load_book(book_id)
    config, export_settings = _load_export_config()
    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_validate_"))
    try:
        project_dir = scaffold_project(book_data, chapters, tmp_dir, export_settings, assets)
        cover = book_data.get("cover_image")
        output = run_pandoc(project_dir, "epub", config, use_manual_toc=_detect_manual_toc(chapters), cover_path=cover)
        results_path = output.with_suffix(".epubcheck.json")
        if results_path.exists():
            return json.loads(results_path.read_text(encoding="utf-8"))
        return {"valid": True, "errors": [], "warnings": [], "error_count": 0, "warning_count": 0}
    except MissingImagesError as e:
        raise _missing_images_http_exception(e) from e
    except PandocError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/batch")
def export_batch_route(book_id: str, book_type: str = "ebook", use_manual_toc: bool | None = None, db: Any = Depends(lambda: None)):
    """Export EPUB + PDF + DOCX as a single ZIP."""
    book_data, chapters, assets = _load_book(book_id)
    tmp_dir, project_dir, config, settings = _scaffold_and_prepare(book_data, chapters, assets)
    slug = project_dir.name
    manual_toc = use_manual_toc if use_manual_toc is not None else _detect_manual_toc(chapters)
    cover = _find_cover(book_data, project_dir)

    output_files: list[Path] = []
    errors: list[str] = []
    for fmt in BATCH_FORMATS:
        try:
            output_files.append(run_pandoc(project_dir, fmt, config, use_manual_toc=manual_toc, cover_path=cover))
        except PandocError as e:
            errors.append(f"{fmt}: {e}")
    if not output_files:
        raise HTTPException(status_code=500, detail=f"All exports failed: {'; '.join(errors)}")

    import zipfile
    zip_path = tmp_dir / f"{slug}-batch.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in output_files:
            zf.write(f, f.name)
    return FileResponse(path=str(zip_path), media_type="application/zip", filename=f"{slug}-batch.zip")


@router.get("/{fmt}")
def export(book_id: str, fmt: str, book_type: str = "ebook", toc_depth: int = 0, use_manual_toc: bool | None = None, db: Any = Depends(lambda: None)):
    """Export a book. Dispatches to format-specific handler."""
    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{fmt}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}")

    book_data, chapters, assets = _load_book(book_id)
    tmp_dir, project_dir, config, settings = _scaffold_and_prepare(book_data, chapters, assets, toc_depth)
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
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")


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
        raise HTTPException(status_code=500, detail="Job store not available")

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
            return {"path": bgp_path, "filename": f"{base_name}.bgp", "media_type": "application/octet-stream"}

        if fmt == "audiobook":
            return await _run_audiobook_job(job_id, book_data, chapters, base_name, generation_mode=generation_mode)

        cover = _find_cover(book_data, project_dir)
        output = run_pandoc(project_dir, fmt, config, use_manual_toc=manual_toc, cover_path=cover)
        media_type = MEDIA_TYPES.get(fmt, "application/octet-stream")
        ext = EXT_MAP.get(fmt, output.suffix or f".{fmt}")
        return {"path": str(output), "filename": f"{base_name}{ext}", "media_type": media_type}

    job_id = job_store.submit(_run)
    logger.info("Export job %s started: book=%s fmt=%s", job_id, book_id, fmt)
    return {"job_id": job_id, "status": "pending"}


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
        from app.job_store import job_store
        from bibliogon_audiobook import audiobook_storage
        from bibliogon_audiobook.generator import bundle_audiobook_output, generate_audiobook
    except ImportError:
        raise RuntimeError("Audiobook plugin not installed.")

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
    book_skip_list = _decode_skip_chapter_types(
        book_data.get("audiobook_skip_chapter_types")
    )
    skip_types: set[str] | None = (
        {str(s) for s in book_skip_list} if book_skip_list else None
    )

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
                _slugify, extract_plain_text, should_regenerate,
            )
            chapters_dir = audiobook_storage.audiobook_dir(book_id) / "chapters"
            sorted_chs = sorted(chapters, key=lambda c: c.get("position", 0))
            positions_to_generate = set()
            for idx, ch in enumerate(sorted_chs, start=1):
                plain = extract_plain_text(ch.get("content", ""))
                fname = f"{idx:03d}-{_slugify(ch.get('title', ''))}.mp3"
                mp3 = chapters_dir / fname
                is_missing = not mp3.exists()
                is_outdated = mp3.exists() and should_regenerate(plain, mp3, engine_id, voice, rate or "1.0")
                if generation_mode == "missing_only" and is_missing:
                    positions_to_generate.add(ch.get("position", 0))
                elif generation_mode == "outdated_only" and is_outdated:
                    positions_to_generate.add(ch.get("position", 0))
        except Exception as classify_err:  # noqa: BLE001
            logger.warning("Position filter computation failed, falling back to all: %s", classify_err)
            positions_to_generate = None

    async def on_chapter_persisted(mp3_path: Path, chapter_info: dict[str, Any]) -> None:
        """Record one completed chapter in metadata.json.

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
                mp3_path.name, book_id, flush_error,
            )

    try:
        result = await generate_audiobook(
            book_title=book_data.get("title", "audiobook"),
            chapters=chapters, output_dir=audio_dir,
            engine_id=engine_id, voice=voice, language=language, rate=rate,
            merge=merge_mode, progress_callback=progress_cb,
            skip_types=skip_types, read_chapter_number=read_chapter_number,
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
        except Exception as finalize_error:  # noqa: BLE001
            # Finalize failure must not kill the download - chapter
            # files are already persistent, user can still grab them.
            logger.error(
                "Failed to finalize audiobook for book %s: %s",
                book_id, finalize_error, exc_info=True,
            )

    if output.suffix == ".mp3":
        download = {"path": str(output), "filename": f"{base_name}.mp3", "media_type": "audio/mpeg"}
    else:
        download = {"path": str(output), "filename": f"{base_name}-audiobook.zip", "media_type": "application/zip"}

    # Stash the per-chapter MP3 directory + filenames so the modal can
    # render individual download links via /api/export/jobs/{id}/files/{name}.
    download["audio_dir"] = str(audio_dir)
    download["chapter_files"] = list(result.get("generated_files") or [])

    # Final "ready" event so SSE clients can render the download button
    # before the synthetic stream_end fires from JobStore.update().
    job_store.publish_event(job_id, "ready", {
        "filename": download["filename"],
        "media_type": download["media_type"],
        "download_url": f"/api/export/jobs/{job_id}/download",
        "chapter_files": download["chapter_files"],
    })
    return download


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
        raise HTTPException(status_code=500, detail="Job store not available")
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
        raise HTTPException(status_code=500, detail="Job store not available")
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
        raise HTTPException(status_code=500, detail="Job store not available")
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
        raise HTTPException(status_code=500, detail="Job store not available")
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
        raise HTTPException(status_code=500, detail="Job store not available")
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status.value != "completed":
        raise HTTPException(status_code=409, detail=f"Job is {job.status.value}, not completed")
    path = job.result.get("path")
    if not path or not Path(path).exists():
        raise HTTPException(status_code=410, detail="Export file no longer available")
    return FileResponse(path=path, media_type=job.result.get("media_type", "application/octet-stream"), filename=job.result.get("filename", "export"))
