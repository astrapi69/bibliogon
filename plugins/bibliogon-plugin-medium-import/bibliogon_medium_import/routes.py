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

import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .importer import DEFAULT_TIMEOUT_SECONDS, ImportResult, import_zip
from .preview import PreviewItem, build_preview, get_default_cache

logger = logging.getLogger(__name__)

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


class _ImportedCommentOut(BaseModel):
    """MEDIUM-COMMENTS-IMPORT-01 commit 5: one comment that
    landed in the article_comments table."""

    id: str
    filename: str
    body_preview: str
    responds_to_article_id: str | None = None


class _SkippedCommentOut(BaseModel):
    """A heuristic-classified comment dropped without persisting.
    ``reason`` is ``"mode_skip"`` (import_comments_mode=skip) or
    ``"orphan_skip"`` (orphan_comment_handling=skip)."""

    filename: str
    reason: str


class ImportZipResponse(BaseModel):
    imported_count: int
    skipped_count: int
    errored_count: int
    imported: list[_ImportedOut]
    skipped: list[_SkippedOut]
    errored: list[_ErroredOut]
    # MEDIUM-COMMENTS-IMPORT-01 commit 5: comment-routing counters.
    imported_comments_count: int = 0
    skipped_comments_count: int = 0
    imported_comments: list[_ImportedCommentOut] = Field(default_factory=list)
    skipped_comments: list[_SkippedCommentOut] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# MEDIUM-IMPORT-V2-01: dry-run preview workflow.
# ---------------------------------------------------------------------------


class _PreviewItemOut(BaseModel):
    """One row in the preview table the v2 wizard renders before
    the user picks what to import. Mirrors ``preview.PreviewItem``
    one-to-one so the route handler can hand the dataclass list
    straight through ``model_validate`` without re-mapping."""

    filename: str
    title: str
    subtitle: str
    author: str
    published_at: str | None = None
    canonical_url: str
    detected_language: str | None = None
    classification: str  # "article" | "comment"
    existing_article_id: str | None = None
    body_preview: str = ""
    warnings: list[str] = Field(default_factory=list)


class _PreviewErroredOut(BaseModel):
    """A post in the archive that the walker couldn't parse during
    the preview pass. The user sees these in a separate panel so
    the row count discrepancy (N posts in ZIP vs M items in table)
    is explained."""

    filename: str
    error: str


class PreviewResponse(BaseModel):
    """Response of ``POST /api/medium-import/preview``. The
    ``preview_id`` is the token the import endpoint reads."""

    preview_id: str
    total_posts: int
    items: list[_PreviewItemOut]
    errored: list[_PreviewErroredOut] = Field(default_factory=list)
    expires_at: float


class ImportSelectionRequest(BaseModel):
    """Request body for ``POST /api/medium-import/import/{preview_id}``.

    ``selected_filenames`` are the base names (``"01_oldest_tech.html"``,
    not ``"posts/01_oldest_tech.html"``) the user kept checked in the
    preview UI. Empty list = nothing to import (the UI gates the
    button on this, but the backend defends in depth)."""

    selected_filenames: list[str] = Field(default_factory=list)


class CancelPreviewResponse(BaseModel):
    """Response of ``DELETE /api/medium-import/preview/{preview_id}``.

    ``deleted`` is ``True`` when an on-disk preview was reaped,
    ``False`` when the id was unknown (already expired, never
    existed). Either way the response is 200 — the caller's intent
    ("forget this preview") is satisfied in both cases."""

    deleted: bool


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
        imported_comments_count=len(result.imported_comments),
        skipped_comments_count=len(result.skipped_comments),
        imported_comments=[
            _ImportedCommentOut(
                id=c.id,
                filename=c.filename,
                body_preview=c.body_preview,
                responds_to_article_id=c.responds_to_article_id,
            )
            for c in result.imported_comments
        ],
        skipped_comments=[
            _SkippedCommentOut(filename=c.filename, reason=c.reason)
            for c in result.skipped_comments
        ],
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

    v1 surface: imports everything in the ZIP in one pass. The v2
    wizard uses ``/preview`` + ``/import/{preview_id}`` to let the
    user deselect rows pre-import. This endpoint stays for back-
    compat (direct curl users, the existing test suites, future
    scripted integrations).
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
        result = await import_zip(contents, **_settings_kwargs())
    except ValueError as exc:
        # Bad ZIP / no posts/ dir -> 400 so the frontend can surface
        # the message verbatim instead of a generic 500.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _serialize(result)


# ---------------------------------------------------------------------------
# MEDIUM-IMPORT-V2-01: dry-run preview endpoints.
# ---------------------------------------------------------------------------


def _preview_item_to_out(item: PreviewItem) -> _PreviewItemOut:
    return _PreviewItemOut(
        filename=item.filename,
        title=item.title,
        subtitle=item.subtitle,
        author=item.author,
        published_at=item.published_at,
        canonical_url=item.canonical_url,
        detected_language=item.detected_language,
        classification=item.classification,
        existing_article_id=item.existing_article_id,
        body_preview=item.body_preview,
        warnings=list(item.warnings),
    )


@router.post("/preview", response_model=PreviewResponse)
async def preview_zip_endpoint(file: UploadFile = File(...)) -> PreviewResponse:
    """Parse the uploaded ZIP and return the per-post preview table.

    Caches the ZIP under ``get_data_dir() / "tmp" /
    "medium-import-previews"`` so the follow-up import endpoint can
    re-read it without forcing the user to upload twice. No DB
    writes happen here; the only DB touch is a single SELECT that
    pre-loads existing ``canonical_url`` values for the dedup badge.
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
        result = build_preview(contents)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PreviewResponse(
        preview_id=result.preview_id,
        total_posts=result.total_posts,
        items=[_preview_item_to_out(item) for item in result.items],
        errored=[_PreviewErroredOut(**err) for err in result.errored],
        expires_at=result.expires_at,
    )


@router.post("/import/{preview_id}", response_model=ImportZipResponse)
async def import_selection_endpoint(
    preview_id: str,
    selection: ImportSelectionRequest,
) -> ImportZipResponse:
    """Import the user's selection from a previously-previewed ZIP.

    Reads the cached ZIP for ``preview_id``, calls ``import_zip``
    with ``selected_filenames=set(selection.selected_filenames)``,
    and deletes the cache entry on success. 404 when the preview
    is unknown or expired (the cache returns ``None`` for both;
    that is intentional - the UI tells the user "preview expired,
    please upload again" either way).
    """
    cache = get_default_cache()
    zip_bytes = cache.load(preview_id)
    if zip_bytes is None:
        raise HTTPException(
            status_code=404,
            detail="Preview not found or expired; please upload again",
        )

    if not selection.selected_filenames:
        # The wizard disables the Import button on empty selection,
        # but a direct API caller might still try; 400 keeps the
        # contract honest and the cache entry intact for a retry.
        raise HTTPException(
            status_code=400,
            detail="selected_filenames must contain at least one entry",
        )

    try:
        result = await import_zip(
            zip_bytes,
            selected_filenames=set(selection.selected_filenames),
            **_settings_kwargs(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Successful imports reap the cache; failures leave it so the
    # user can retry without re-uploading.
    cache.delete(preview_id)
    return _serialize(result)


@router.delete("/preview/{preview_id}", response_model=CancelPreviewResponse)
def cancel_preview_endpoint(preview_id: str) -> CancelPreviewResponse:
    """Explicit cancel-from-UI. Idempotent: unknown ids return
    ``{deleted: False}`` with HTTP 200 (not 404) so the caller's
    intent ("forget this preview") is satisfied regardless of
    whether the cache entry still existed."""
    deleted = get_default_cache().delete(preview_id)
    return CancelPreviewResponse(deleted=deleted)


# ---------------------------------------------------------------------------
# ASYNC-IMPORT-PROGRESS-01: async dry-run import with SSE progress.
#
# The sync ``POST /import/{preview_id}`` above stays for back-compat
# (direct API callers, the existing test suites). The new endpoint
# below submits the same work as an async job and returns a job_id
# the frontend uses to subscribe to /api/export/jobs/{id}/stream for
# per-post progress events. Per Q2 of the Pre-Inspection, we reuse
# the existing generic export-jobs router rather than carving out
# a parallel medium-import jobs namespace.
# ---------------------------------------------------------------------------


class AsyncJobStartedResponse(BaseModel):
    """Response of ``POST /api/medium-import/import/async/{preview_id}``.

    The frontend uses ``job_id`` to subscribe to
    ``GET /api/export/jobs/{job_id}/stream`` (SSE) for per-post
    progress, and fetches the final ``ImportResult`` from
    ``GET /api/export/jobs/{job_id}`` once ``stream_end`` arrives.
    """

    job_id: str
    status: str = "pending"


@router.post(
    "/import/async/{preview_id}",
    response_model=AsyncJobStartedResponse,
    status_code=202,
)
async def import_selection_async_endpoint(
    preview_id: str,
    selection: ImportSelectionRequest,
) -> AsyncJobStartedResponse:
    """Start an async import job for the user's selection.

    The 404/400 gates mirror the sync sibling above. On success
    returns 202 + the job_id so the frontend can open the SSE
    stream immediately. The cache entry is reaped by the worker on
    a successful import (matching the sync endpoint's contract);
    on failure the cache stays so the user can retry.
    """
    try:
        from app.job_store import job_store
    except ImportError as exc:
        raise HTTPException(
            status_code=500, detail="Job store not available"
        ) from exc

    cache = get_default_cache()
    zip_bytes = cache.load(preview_id)
    if zip_bytes is None:
        raise HTTPException(
            status_code=404,
            detail="Preview not found or expired; please upload again",
        )

    if not selection.selected_filenames:
        raise HTTPException(
            status_code=400,
            detail="selected_filenames must contain at least one entry",
        )

    selected_set = set(selection.selected_filenames)
    settings_kwargs = _settings_kwargs()

    async def _run(job_id: str) -> dict[str, Any]:
        async def progress_cb(event_type: str, payload: dict[str, Any]) -> None:
            job_store.publish_event(job_id, event_type, payload)

        result = await import_zip(
            zip_bytes,
            selected_filenames=selected_set,
            progress_callback=progress_cb,
            **settings_kwargs,
        )
        # Cache reap matches the sync endpoint's success contract.
        # Cancellation raises before reaching this line, so the
        # cache stays for a retry. An import failure also bubbles
        # out before this line.
        cache.delete(preview_id)
        # The result payload exposed via GET /api/export/jobs/{id}
        # mirrors the sync endpoint's ImportZipResponse shape so
        # the frontend can render the existing MediumImportResult
        # panel directly from job.result.
        return _serialize(result).model_dump()

    job_id = job_store.submit(_run)
    logger.info("medium-import async job %s started: preview=%s", job_id, preview_id)
    return AsyncJobStartedResponse(job_id=job_id)
