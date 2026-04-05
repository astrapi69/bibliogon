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

# These will be set by the plugin during activation
_get_db = None
_book_model = None

SUPPORTED_FORMATS = {"epub", "pdf", "docx", "html", "markdown", "project", "audiobook"}

MEDIA_TYPES = {
    "epub": "application/epub+zip",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "html": "text/html",
    "markdown": "text/markdown",
}


def configure(get_db_dep: Any, book_model: Any) -> None:
    """Configure route dependencies. Called by ExportPlugin.activate()."""
    global _get_db, _book_model
    _get_db = get_db_dep
    _book_model = book_model


def _get_book_data(book_id: str, db: Any) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Load book, chapters, and assets from DB and return as dicts."""
    from sqlalchemy.orm import joinedload

    if _book_model is None:
        raise HTTPException(status_code=500, detail="Export plugin not properly configured")

    Book = _book_model
    book = db.query(Book).options(joinedload(Book.chapters)).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    book_data = {
        "id": book.id,
        "title": book.title,
        "subtitle": book.subtitle,
        "author": book.author,
        "language": book.language,
        "series": book.series,
        "series_index": book.series_index,
        "description": book.description,
        "cover_image": book.cover_image,
        "custom_css": book.custom_css,
        "ai_assisted": getattr(book, "ai_assisted", False),
        "tts_engine": getattr(book, "tts_engine", None),
        "tts_voice": getattr(book, "tts_voice", None),
        "tts_language": getattr(book, "tts_language", None),
    }

    chapters_data = []
    for ch in sorted(book.chapters, key=lambda c: c.position):
        content = ch.content
        try:
            content = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            pass
        chapters_data.append({
            "title": ch.title,
            "content": content,
            "position": ch.position,
            "chapter_type": ch.chapter_type,
        })

    # Load assets
    from app.models import Asset
    assets_data = []
    for asset in db.query(Asset).filter(Asset.book_id == book_id).all():
        assets_data.append({
            "filename": asset.filename,
            "asset_type": asset.asset_type,
            "path": asset.path,
        })

    return book_data, chapters_data, assets_data


@router.get("/validate-epub")
def validate_epub(book_id: str, db: Any = Depends(lambda: None)):
    """Export EPUB and validate with epubcheck. Returns validation results."""
    if _get_db is None:
        raise HTTPException(status_code=500, detail="Export plugin not configured")

    db_gen = _get_db()
    db_session = next(db_gen)
    try:
        book_data, chapters_data, assets_data = _get_book_data(book_id, db_session)
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_validate_"))
    try:
        import yaml
        config_path = Path("config/plugins/export.yaml")
        config: dict[str, Any] = {}
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}

        export_settings = config.get("settings", {})
        has_manual_toc = any(ch.get("chapter_type") == "toc" for ch in chapters_data)

        project_dir = scaffold_project(
            book_data, chapters_data, tmp_dir, export_settings, assets_data,
        )

        cover_path = book_data.get("cover_image")
        output_path = run_pandoc(
            project_dir, "epub", config,
            use_manual_toc=has_manual_toc,
            cover_path=cover_path,
        )

        # Read epubcheck results if available
        results_path = output_path.with_suffix(".epubcheck.json")
        if results_path.exists():
            import json as _json
            return _json.loads(results_path.read_text(encoding="utf-8"))

        return {"valid": True, "errors": [], "warnings": [], "error_count": 0, "warning_count": 0, "note": "epubcheck not available"}

    except PandocError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/batch")
def export_batch_route(
    book_id: str,
    book_type: str = "ebook",
    use_manual_toc: bool | None = None,
    db: Any = Depends(lambda: None),
):
    """Export a book in all main formats (EPUB, PDF, DOCX) as a single ZIP."""
    return _export_batch(book_id, book_type, use_manual_toc)


@router.get("/{fmt}")
def export(
    book_id: str,
    fmt: str,
    book_type: str = "ebook",
    toc_depth: int = 0,
    use_manual_toc: bool | None = None,
    db: Any = Depends(lambda: None),
):
    """Export a book via manuscripta.

    Supported formats: epub, pdf, docx, html, markdown, project (ZIP).
    Query params: book_type, toc_depth, use_manual_toc (auto-detected if not set).
    """
    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{fmt}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
        )

    if _get_db is None:
        raise HTTPException(status_code=500, detail="Export plugin not configured")

    db_gen = _get_db()
    db_session = next(db_gen)
    try:
        book_data, chapters_data, assets_data = _get_book_data(book_id, db_session)
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_export_"))

    try:
        # Load plugin config for export settings
        import yaml
        config_path = Path("config/plugins/export.yaml")
        config: dict[str, Any] = {}
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}

        export_settings = config.get("settings", {})
        if toc_depth > 0:
            export_settings["toc_depth"] = toc_depth

        # Auto-detect manual TOC if not explicitly set
        has_manual_toc = any(ch.get("chapter_type") == "toc" for ch in chapters_data)
        if use_manual_toc is None:
            use_manual_toc = has_manual_toc

        # Scaffold manuscripta-compatible project structure with export settings
        project_dir = scaffold_project(
            book_data, chapters_data, tmp_dir, export_settings, assets_data,
        )

        # Build filename
        slug = project_dir.name
        type_suffix = export_settings.get("type_suffix_in_filename", True)
        if type_suffix and book_type != "ebook":
            base_name = f"{slug}-{book_type}"
        elif type_suffix:
            base_name = f"{slug}-{book_type}"
        else:
            base_name = slug

        if fmt == "project":
            zip_path = shutil.make_archive(str(tmp_dir / "project"), "zip", str(project_dir))
            bgp_path = zip_path.replace(".zip", ".bgp")
            Path(zip_path).rename(bgp_path)
            return FileResponse(
                path=bgp_path,
                media_type="application/octet-stream",
                filename=f"{base_name}.bgp",
            )

        if fmt == "audiobook":
            # Delegate to audiobook plugin via import (not via hook for simplicity)
            try:
                from bibliogon_audiobook.generator import generate_audiobook
                import asyncio
                import re as _re_ab

                engine_id = book_data.get("tts_engine") or "edge-tts"
                voice = book_data.get("tts_voice") or ""
                language = book_data.get("tts_language") or book_data.get("language", "de")
                audio_dir = Path(tempfile.mkdtemp(prefix="bibliogon_ab_"))

                loop = asyncio.new_event_loop()
                try:
                    result = loop.run_until_complete(generate_audiobook(
                        book_title=book_data.get("title", "audiobook"),
                        chapters=chapters_data,
                        output_dir=audio_dir,
                        engine_id=engine_id,
                        voice=voice,
                        language=language,
                        merge=True,
                    ))
                finally:
                    loop.close()

                if result.get("merged_file"):
                    merged = audio_dir / result["merged_file"]
                    return FileResponse(
                        path=str(merged),
                        media_type="audio/mpeg",
                        filename=f"{base_name}.mp3",
                    )

                # No merge - bundle as ZIP
                zip_path = shutil.make_archive(str(audio_dir / "audiobook"), "zip", str(audio_dir))
                return FileResponse(
                    path=zip_path,
                    media_type="application/zip",
                    filename=f"{base_name}-audiobook.zip",
                )
            except ImportError:
                raise HTTPException(status_code=400, detail="Audiobook plugin not installed")
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Audiobook export failed: {e}")

        # Find cover image path
        cover_path = book_data.get("cover_image")
        if not cover_path:
            # Try to find cover in scaffolded assets
            for ext in ("png", "jpg", "jpeg"):
                candidate = project_dir / "assets" / "covers" / f"cover.{ext}"
                if candidate.exists():
                    cover_path = str(candidate)
                    break

        # Export via manuscripta (reads export-settings.yaml from scaffolded project)
        output_path = run_pandoc(
            project_dir, fmt, config,
            use_manual_toc=use_manual_toc,
            cover_path=cover_path,
        )

        media_type = MEDIA_TYPES.get(fmt, "application/octet-stream")
        ext_map = {"epub": ".epub", "pdf": ".pdf", "docx": ".docx", "html": ".html", "markdown": ".md"}
        ext = ext_map.get(fmt, output_path.suffix or f".{fmt}")

        return FileResponse(
            path=str(output_path),
            media_type=media_type,
            filename=f"{base_name}{ext}",
        )
    except PandocError as e:
        raise HTTPException(status_code=500, detail=str(e))


BATCH_FORMATS = ["epub", "pdf", "docx"]


def _export_batch(
    book_id: str,
    book_type: str = "ebook",
    use_manual_toc: bool | None = None,
):
    if _get_db is None:
        raise HTTPException(status_code=500, detail="Export plugin not configured")

    db_gen = _get_db()
    db_session = next(db_gen)
    try:
        book_data, chapters_data, assets_data = _get_book_data(book_id, db_session)
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_batch_"))

    try:
        import yaml
        config_path = Path("config/plugins/export.yaml")
        config: dict[str, Any] = {}
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}

        export_settings = config.get("settings", {})
        has_manual_toc = any(ch.get("chapter_type") == "toc" for ch in chapters_data)
        if use_manual_toc is None:
            use_manual_toc = has_manual_toc

        project_dir = scaffold_project(
            book_data, chapters_data, tmp_dir, export_settings, assets_data,
        )

        slug = project_dir.name
        cover_path = book_data.get("cover_image")
        if not cover_path:
            for ext in ("png", "jpg", "jpeg"):
                candidate = project_dir / "assets" / "covers" / f"cover.{ext}"
                if candidate.exists():
                    cover_path = str(candidate)
                    break

        # Export each format
        output_files: list[Path] = []
        errors: list[str] = []
        for fmt in BATCH_FORMATS:
            try:
                output_path = run_pandoc(
                    project_dir, fmt, config,
                    use_manual_toc=use_manual_toc,
                    cover_path=cover_path,
                )
                output_files.append(output_path)
            except PandocError as e:
                errors.append(f"{fmt}: {e}")

        if not output_files:
            raise HTTPException(status_code=500, detail=f"All exports failed: {'; '.join(errors)}")

        # Bundle into ZIP
        import zipfile
        zip_path = tmp_dir / f"{slug}-batch.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in output_files:
                zf.write(f, f.name)

        return FileResponse(
            path=str(zip_path),
            media_type="application/zip",
            filename=f"{slug}-batch.zip",
        )
    except PandocError as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Async Export ---


@router.post("/async/{fmt}")
async def export_async(
    book_id: str,
    fmt: str,
    book_type: str = "ebook",
    use_manual_toc: bool | None = None,
) -> dict[str, str]:
    """Start an export job in the background. Returns a job_id to poll.

    Use GET /api/export/jobs/{job_id} to check status and download.
    """
    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{fmt}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
        )

    try:
        from app.job_store import job_store
    except ImportError:
        raise HTTPException(status_code=500, detail="Job store not available")

    async def _run_export() -> dict[str, Any]:
        if _get_db is None:
            raise RuntimeError("Export plugin not configured")

        db_gen = _get_db()
        db_session = next(db_gen)
        try:
            book_data, chapters_data, assets_data = _get_book_data(book_id, db_session)
        finally:
            try:
                next(db_gen)
            except StopIteration:
                pass

        tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_async_"))

        import yaml
        config_path = Path("config/plugins/export.yaml")
        config: dict[str, Any] = {}
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}

        export_settings = config.get("settings", {})
        has_manual_toc = any(ch.get("chapter_type") == "toc" for ch in chapters_data)
        manual_toc = use_manual_toc if use_manual_toc is not None else has_manual_toc

        project_dir = scaffold_project(
            book_data, chapters_data, tmp_dir, export_settings, assets_data,
        )

        slug = project_dir.name
        type_suffix = export_settings.get("type_suffix_in_filename", True)
        base_name = f"{slug}-{book_type}" if type_suffix else slug

        if fmt == "project":
            zip_path = shutil.make_archive(str(tmp_dir / "project"), "zip", str(project_dir))
            bgp_path = zip_path.replace(".zip", ".bgp")
            Path(zip_path).rename(bgp_path)
            return {"path": bgp_path, "filename": f"{base_name}.bgp", "media_type": "application/octet-stream"}

        cover_path = book_data.get("cover_image")
        if not cover_path:
            for ext in ("png", "jpg", "jpeg"):
                candidate = project_dir / "assets" / "covers" / f"cover.{ext}"
                if candidate.exists():
                    cover_path = str(candidate)
                    break

        output_path = run_pandoc(
            project_dir, fmt, config, use_manual_toc=manual_toc, cover_path=cover_path,
        )

        media_type = MEDIA_TYPES.get(fmt, "application/octet-stream")
        ext_map = {"epub": ".epub", "pdf": ".pdf", "docx": ".docx", "html": ".html", "markdown": ".md"}
        ext = ext_map.get(fmt, output_path.suffix or f".{fmt}")
        return {"path": str(output_path), "filename": f"{base_name}{ext}", "media_type": media_type}

    job_id = job_store.submit(_run_export)
    logger.info("Export job %s started: book=%s fmt=%s", job_id, book_id, fmt)
    return {"job_id": job_id, "status": "pending"}


# Separate router for job polling (not under /books/{book_id})
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

    return FileResponse(
        path=path,
        media_type=job.result.get("media_type", "application/octet-stream"),
        filename=job.result.get("filename", "export"),
    )
