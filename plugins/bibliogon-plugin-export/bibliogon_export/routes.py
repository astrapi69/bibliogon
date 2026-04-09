"""FastAPI routes for the export plugin."""

import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from .pandoc_runner import PandocError, run_pandoc
from .scaffolder import scaffold_project

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
    }


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


def _export_audiobook(book_data: dict[str, Any], chapters: list[dict[str, Any]], base_name: str) -> FileResponse:
    """Export as audiobook MP3 via TTS."""
    try:
        from bibliogon_audiobook.generator import bundle_audiobook_output, generate_audiobook
    except ImportError:
        raise HTTPException(status_code=400, detail="Audiobook plugin not installed.")

    import asyncio
    engine_id = book_data.get("tts_engine") or "edge-tts"
    voice = book_data.get("tts_voice") or ""
    language = book_data.get("tts_language") or book_data.get("language", "de")
    rate = book_data.get("tts_speed") or ""
    merge_mode = _resolve_audiobook_merge_mode(book_data)
    audio_dir = Path(tempfile.mkdtemp(prefix="bibliogon_ab_"))

    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(generate_audiobook(
            book_title=book_data.get("title", "audiobook"),
            chapters=chapters, output_dir=audio_dir,
            engine_id=engine_id, voice=voice, language=language, rate=rate, merge=merge_mode,
        ))
    finally:
        loop.close()

    output = bundle_audiobook_output(result, audio_dir, book_data.get("title", "audiobook"))
    if output is None:
        errors = result.get("errors", [])
        detail = "; ".join(e.get("error", "") for e in errors) if errors else "No audio generated"
        raise HTTPException(status_code=500, detail=f"Audiobook export failed: {detail}")

    if output.suffix == ".mp3":
        return FileResponse(path=str(output), media_type="audio/mpeg", filename=f"{base_name}.mp3")
    return FileResponse(path=str(output), media_type="application/zip", filename=f"{base_name}-audiobook.zip")


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
            return _export_audiobook(book_data, chapters, _audiobook_base_name(book_data, base_name))
        cover = _find_cover(book_data, project_dir)
        return _export_document(fmt, base_name, project_dir, config, manual_toc, cover)
    except PandocError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")


# --- Async Export ---


@router.post("/async/{fmt}")
async def export_async(book_id: str, fmt: str, book_type: str = "ebook", use_manual_toc: bool | None = None) -> dict[str, str]:
    """Start an export job in the background."""
    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{fmt}'.")
    try:
        from app.job_store import job_store
    except ImportError:
        raise HTTPException(status_code=500, detail="Job store not available")

    async def _run() -> dict[str, Any]:
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
            # Run audiobook export in the async job
            try:
                from bibliogon_audiobook.generator import bundle_audiobook_output, generate_audiobook
            except ImportError:
                raise RuntimeError("Audiobook plugin not installed.")
            base_name = _audiobook_base_name(book_data, base_name)
            engine_id = book_data.get("tts_engine") or "edge-tts"
            voice = book_data.get("tts_voice") or ""
            language = book_data.get("tts_language") or book_data.get("language", "de")
            rate = book_data.get("tts_speed") or ""
            audio_dir = Path(tempfile.mkdtemp(prefix="bibliogon_ab_async_"))
            merge_mode = _resolve_audiobook_merge_mode(book_data)
            result = await generate_audiobook(
                book_title=book_data.get("title", "audiobook"),
                chapters=chapters, output_dir=audio_dir,
                engine_id=engine_id, voice=voice, language=language, rate=rate, merge=merge_mode,
            )
            output = bundle_audiobook_output(result, audio_dir, book_data.get("title", "audiobook"))
            if output is None:
                raise RuntimeError("Audiobook generation produced no files")
            if output.suffix == ".mp3":
                return {"path": str(output), "filename": f"{base_name}.mp3", "media_type": "audio/mpeg"}
            return {"path": str(output), "filename": f"{base_name}-audiobook.zip", "media_type": "application/zip"}

        cover = _find_cover(book_data, project_dir)
        output = run_pandoc(project_dir, fmt, config, use_manual_toc=manual_toc, cover_path=cover)
        media_type = MEDIA_TYPES.get(fmt, "application/octet-stream")
        ext = EXT_MAP.get(fmt, output.suffix or f".{fmt}")
        return {"path": str(output), "filename": f"{base_name}{ext}", "media_type": media_type}

    job_id = job_store.submit(_run)
    logger.info("Export job %s started: book=%s fmt=%s", job_id, book_id, fmt)
    return {"job_id": job_id, "status": "pending"}


# --- Job polling router ---

jobs_router = APIRouter(prefix="/export/jobs", tags=["export-jobs"])


@jobs_router.get("/{job_id}")
def get_job_status(job_id: str) -> dict[str, Any]:
    """Check status of an async export job."""
    try:
        from app.job_store import job_store
    except ImportError:
        raise HTTPException(status_code=500, detail="Job store not available")
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    result: dict[str, Any] = {"job_id": job.id, "status": job.status.value}
    if job.error:
        result["error"] = job.error
    if job.status.value == "completed" and job.result.get("filename"):
        result["filename"] = job.result["filename"]
        result["download_url"] = f"/api/export/jobs/{job_id}/download"
    return result


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
