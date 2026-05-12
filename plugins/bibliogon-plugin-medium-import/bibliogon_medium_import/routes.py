"""FastAPI routes for the Medium-import plugin.

Single user-facing endpoint: ``POST /api/medium-import/import``.
Accepts a ZIP from Medium's "Download your information" feature
and produces one Article + one Publication + one
ArticleImportSource per ``posts/*.html`` it finds, dedup-ing
against ``Article.canonical_url``.

Plugin configuration is injected via :func:`set_config` from
``plugin.py.activate()`` (matches the audiobook precedent). The
import endpoint reads ``_config["settings"]`` at request time and
passes the values through to ``importer.import_zip`` as kwargs.
"""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .importer import DEFAULT_TIMEOUT_SECONDS, ImportResult, import_zip

router = APIRouter(prefix="/medium-import", tags=["medium-import"])

# Plugin config injected from ``plugin.py.activate()`` via set_config.
# Module-global to keep the route handler dependency-free.
_config: dict = {}


def set_config(config: dict) -> None:
    """Inject the plugin's full config dict (read at activate-time)."""
    global _config
    _config = config


# MEDIUM-COMMENTS-IMPORT-01 commit 3+4. Valid enum values for the
# two comment-handling settings. Anything else falls back to the
# default with a warning log so a YAML typo doesn't silently
# change the import behaviour.
_VALID_COMMENTS_MODES: frozenset[str] = frozenset(
    {"as_comments", "as_articles", "skip"}
)
_VALID_ORPHAN_HANDLING: frozenset[str] = frozenset({"store", "skip"})


def _normalize_comments_mode(raw: object) -> str:
    if isinstance(raw, str) and raw in _VALID_COMMENTS_MODES:
        return raw
    return "as_comments"


def _normalize_orphan_handling(raw: object) -> str:
    if isinstance(raw, str) and raw in _VALID_ORPHAN_HANDLING:
        return raw
    return "store"


def _settings_kwargs() -> dict:
    """Translate plugin settings to ``import_zip`` kwargs.

    Defaults mirror ``import_zip``'s own defaults so a missing or
    partial settings block degrades to the sane fallback rather
    than crashing. Type coercion defends against YAML-edited junk.
    """
    settings = (_config.get("settings") or {}) if isinstance(_config, dict) else {}
    timeout_raw = settings.get("image_download_timeout_seconds")
    try:
        timeout = float(timeout_raw) if timeout_raw is not None else DEFAULT_TIMEOUT_SECONDS
    except (TypeError, ValueError):
        timeout = DEFAULT_TIMEOUT_SECONDS
    if timeout <= 0:
        timeout = DEFAULT_TIMEOUT_SECONDS
    return {
        "download_images_enabled": bool(settings.get("download_images", True)),
        "image_timeout_seconds": timeout,
        "skip_existing": bool(settings.get("skip_existing_canonical_urls", True)),
        "default_status": str(settings.get("default_status") or "published"),
        "set_first_image_as_featured": bool(
            settings.get("set_first_image_as_featured", True)
        ),
        "import_comments_mode": _normalize_comments_mode(
            settings.get("import_comments_mode")
        ),
        "orphan_comment_handling": _normalize_orphan_handling(
            settings.get("orphan_comment_handling")
        ),
    }


# Pydantic response models. Kept here (not in app/schemas/) so the
# plugin stays self-contained.


class _ImportedOut(BaseModel):
    id: str
    title: str
    canonical_url: str
    warnings: list[str] = Field(default_factory=list)


class _SkippedOut(BaseModel):
    filename: str
    canonical_url: str
    existing_article_id: str


class _ErroredOut(BaseModel):
    filename: str
    error: str


class ImportZipResponse(BaseModel):
    imported_count: int
    skipped_count: int
    errored_count: int
    imported: list[_ImportedOut]
    skipped: list[_SkippedOut]
    errored: list[_ErroredOut]


def _serialize(result: ImportResult) -> ImportZipResponse:
    return ImportZipResponse(
        imported_count=len(result.imported),
        skipped_count=len(result.skipped),
        errored_count=len(result.errored),
        imported=[
            _ImportedOut(
                id=a.id,
                title=a.title,
                canonical_url=a.canonical_url,
                warnings=a.warnings,
            )
            for a in result.imported
        ],
        skipped=[
            _SkippedOut(
                filename=s.filename,
                canonical_url=s.canonical_url,
                existing_article_id=s.existing_article_id,
            )
            for s in result.skipped
        ],
        errored=[_ErroredOut(filename=e.filename, error=e.error) for e in result.errored],
    )


@router.get("/health")
def health() -> dict[str, str]:
    """Minimal liveness probe; confirms the plugin's router is mounted."""
    return {"plugin": "medium-import", "status": "ok"}


@router.post("/import", response_model=ImportZipResponse)
async def import_zip_endpoint(file: UploadFile = File(...)) -> ImportZipResponse:
    """Bulk-import a Medium HTML export ZIP.

    Returns a per-file outcome summary (imported / skipped / errored).
    Per-post failures are recorded but never abort the batch; a single
    bad post should not waste the user's other 200 imports.
    """
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="File must be a .zip Medium export",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        result = import_zip(contents, **_settings_kwargs())
    except ValueError as exc:
        # Bad ZIP / no posts/ dir -> 400 so the frontend can surface
        # the message verbatim instead of a generic 500.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _serialize(result)
