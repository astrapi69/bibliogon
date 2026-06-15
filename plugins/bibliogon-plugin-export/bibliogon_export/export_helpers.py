"""Export configuration, filename, scaffolding + document-render helpers.

Pure-ish helpers shared by the export route handlers and the async job
worker: export-config + audiobook-settings reads, filename building, manual-
TOC detection, cover discovery, write-book-template scaffolding, and the
Pandoc document render. Also owns the media-type / extension maps and the
missing-images error wrapper (shared by the handlers and the PDF dispatch).
"""

from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from fastapi.responses import FileResponse

from .pandoc_runner import MissingImagesError, run_pandoc
from .scaffolder import scaffold_project

logger = logging.getLogger(__name__)

MEDIA_TYPES = {
    "epub": "application/epub+zip",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "html": "text/html",
    "markdown": "text/markdown",
}

EXT_MAP = {"epub": ".epub", "pdf": ".pdf", "docx": ".docx", "html": ".html", "markdown": ".md"}


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


def _load_export_config() -> tuple[dict[str, Any], dict[str, Any]]:
    """Load export plugin config and settings from YAML."""
    import yaml

    config_path = Path("config/plugins/export.yaml")
    config: dict[str, Any] = {}
    if config_path.exists():
        with open(config_path, encoding="utf-8") as f:
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
    return FileResponse(
        path=bgp_path, media_type="application/octet-stream", filename=f"{base_name}.bgp"
    )


def _read_audiobook_merge_setting() -> str:
    """Read merge setting from audiobook plugin config. Default: 'merged'.

    Accepts legacy boolean values (True -> 'merged', False -> 'separate').
    """
    import yaml

    try:
        from bibliogon_audiobook.generator import normalize_merge_mode
    except ImportError:

        def normalize_merge_mode(v: Any) -> Any:
            return "merged" if v in (True, None) else ("separate" if v is False else v)

    config_path = Path("config/plugins/audiobook.yaml")
    if config_path.exists():
        try:
            with open(config_path, encoding="utf-8") as f:
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
        with open(config_path, encoding="utf-8") as f:
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
    fmt: str,
    base_name: str,
    project_dir: Path,
    config: dict[str, Any],
    use_manual_toc: bool,
    cover_path: str | None,
) -> FileResponse:
    """Export via manuscripta/pandoc (epub, pdf, docx, html, markdown)."""
    output_path = run_pandoc(
        project_dir, fmt, config, use_manual_toc=use_manual_toc, cover_path=cover_path
    )
    media_type = MEDIA_TYPES.get(fmt, "application/octet-stream")
    ext = EXT_MAP.get(fmt, output_path.suffix or f".{fmt}")
    return FileResponse(path=str(output_path), media_type=media_type, filename=f"{base_name}{ext}")


# --- Route handlers (thin dispatchers) ---
