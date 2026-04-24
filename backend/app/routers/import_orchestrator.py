"""Two-phase import orchestrator endpoints.

POST /api/import/detect inspects the uploaded input, dispatches to the
first matching ImportPlugin, checks the BookImportSource table for a
duplicate, and returns the preview payload the wizard renders.

POST /api/import/execute commits the import honouring the user's
duplicate-action choice (create / overwrite / cancel) and records a
BookImportSource row so the next detect call recognizes the import.

/api/backup/import remains for .bgb backup restore (only .bgb
files; project-ZIP/.md inputs go through this orchestrator).
Legacy /api/backup/smart-import and /api/backup/import-project
were removed in CIO-05. See
docs/explorations/core-import-orchestrator.md.
"""

from __future__ import annotations

import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.import_plugins import (
    find_handler,
    find_remote_handler,
    list_plugins,
    list_remote_handlers,
)
from app.import_plugins.protocol import DetectedProject
from app.models import Book, BookImportSource

router = APIRouter(prefix="/import", tags=["import-orchestrator"])

# Staged uploads live on disk between detect and execute so execute can
# re-read the original bytes (the handler may need to re-hash them or
# re-extract a ZIP). TTL enforced lazily during each request.
_STAGING_DIR = Path(tempfile.gettempdir()) / "bibliogon_import_staging"
_STAGING_DIR.mkdir(parents=True, exist_ok=True)
_STAGING_TTL_SECONDS = 30 * 60


# --- Response models ---


class DuplicateInfo(BaseModel):
    found: bool
    existing_book_id: str | None = None
    existing_book_title: str | None = None
    imported_at: datetime | None = None


class DetectResponse(BaseModel):
    detected: DetectedProject
    duplicate: DuplicateInfo
    temp_ref: str = Field(
        description="Opaque handle tying a subsequent execute call to this detection."
    )


class GitDetectRequest(BaseModel):
    git_url: str = Field(min_length=1, max_length=2000)


class ExecuteRequest(BaseModel):
    temp_ref: str
    overrides: dict = Field(default_factory=dict)
    duplicate_action: Literal["create", "overwrite", "cancel"] = "create"
    existing_book_id: str | None = None


class ExecuteResponse(BaseModel):
    book_id: str | None = None
    status: Literal["created", "overwritten", "cancelled"]


# --- Endpoints ---


@router.post("/detect", response_model=DetectResponse)
def detect_import(
    files: list[UploadFile] = File(...),
    paths: list[str] | None = Form(default=None),
    db: Session = Depends(get_db),
) -> DetectResponse:
    """Stage uploaded bytes and dispatch to the matching plugin handler.

    Accepts:
    - a single file (``files=<one>``) with or without ``paths``. Staged
      directly; plugins see a FILE path.
    - a folder drop (``files=<many>`` + ``paths=<same length>``). The
      ``paths`` list carries browser-provided ``webkitRelativePath``
      values. Every file lands at ``<stage>/payload/<rel path>`` and
      the handler sees the shared DIRECTORY at ``<stage>/payload/<root>``.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files uploaded.",
        )
    if paths is not None and len(paths) != len(files):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'paths' length must match 'files' length.",
        )

    _gc_stale_staging()
    temp_ref = f"imp-{uuid.uuid4().hex}"
    staging_path = _stage_uploads(files, paths, temp_ref)

    plugin = find_handler(str(staging_path))
    if plugin is None:
        _drop_staged(temp_ref)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "message": "No import handler can process this file.",
                "filename": files[0].filename,
                "registered_formats": [p.format_name for p in list_plugins()],
            },
        )

    detected = plugin.detect(str(staging_path))
    duplicate = _check_duplicate(db, detected)

    return DetectResponse(detected=detected, duplicate=duplicate, temp_ref=temp_ref)


@router.post("/detect/git", response_model=DetectResponse)
def detect_git_import(
    payload: GitDetectRequest,
    db: Session = Depends(get_db),
) -> DetectResponse:
    """Clone a git URL into a fresh staging directory and dispatch.

    Protocol:
    1. Pick the first registered ``RemoteSourceHandler`` whose
       ``can_handle(url)`` returns True (currently only
       plugin-git-sync).
    2. Ask it to clone into ``<STAGING_DIR>/<temp_ref>/payload/``.
    3. Dispatch the cloned directory through ``find_handler()`` so
       the existing format handlers (WBT, markdown-folder, ...) run
       their detect pipeline on it.
    4. Return the standard :class:`DetectResponse`; follow-up
       ``POST /api/import/execute`` resolves ``temp_ref`` the same
       way as file-based imports.
    """
    remote = find_remote_handler(payload.git_url)
    if remote is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "message": (
                    "No remote-source handler can clone this URL. "
                    "Install a plugin that registers a git/remote "
                    "handler (e.g. plugin-git-sync)."
                ),
                "registered_remote_kinds": [
                    getattr(h, "source_kind", "unknown")
                    for h in list_remote_handlers()
                ],
            },
        )

    _gc_stale_staging()
    temp_ref = f"imp-{uuid.uuid4().hex}"
    payload_dir = _STAGING_DIR / temp_ref / "payload"
    payload_dir.mkdir(parents=True, exist_ok=True)

    try:
        staging_path = remote.clone(payload.git_url, payload_dir)
    except Exception as exc:
        _drop_staged(temp_ref)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Clone failed: {exc}",
        ) from exc

    plugin = find_handler(str(staging_path))
    if plugin is None:
        _drop_staged(temp_ref)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "message": (
                    "Cloned repository does not match any known book "
                    "layout (expected write-book-template structure)."
                ),
                "registered_formats": [p.format_name for p in list_plugins()],
            },
        )

    detected = plugin.detect(str(staging_path))
    duplicate = _check_duplicate(db, detected)

    return DetectResponse(detected=detected, duplicate=duplicate, temp_ref=temp_ref)


@router.post("/execute", response_model=ExecuteResponse)
def execute_import(
    payload: ExecuteRequest,
    db: Session = Depends(get_db),
) -> ExecuteResponse:
    staging_path = _resolve_staged(payload.temp_ref)
    if staging_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown or expired temp_ref. Re-run /import/detect.",
        )

    if payload.duplicate_action == "cancel":
        _drop_staged(payload.temp_ref)
        return ExecuteResponse(book_id=None, status="cancelled")

    plugin = find_handler(str(staging_path))
    if plugin is None:
        _drop_staged(payload.temp_ref)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Handler that matched at detect-time is no longer available.",
        )

    detected = plugin.detect(str(staging_path))

    if payload.duplicate_action == "overwrite" and not payload.existing_book_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="duplicate_action=overwrite requires existing_book_id",
        )

    try:
        book_id = plugin.execute(
            str(staging_path),
            detected,
            payload.overrides,
            duplicate_action=payload.duplicate_action,
            existing_book_id=payload.existing_book_id,
        )
    except Exception as exc:
        _drop_staged(payload.temp_ref)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import handler failed: {exc}",
        ) from exc

    _record_import_source(
        db,
        book_id=book_id,
        source_identifier=detected.source_identifier,
        source_type=detected.format_name,
        format_name=detected.format_name,
        overwrote=payload.duplicate_action == "overwrite",
    )
    _drop_staged(payload.temp_ref)

    return ExecuteResponse(
        book_id=book_id,
        status="overwritten" if payload.duplicate_action == "overwrite" else "created",
    )


# --- Helpers ---


def _stage_uploads(
    files: list[UploadFile], paths: list[str] | None, temp_ref: str
) -> Path:
    """Persist one or more uploads to disk and return the path a handler
    should inspect.

    Layout: ``<STAGING_DIR>/<temp_ref>/payload/<rel>``. Single-file
    uploads land at ``payload/<filename>`` and we return the file path.
    Folder uploads (``paths`` aligned with ``files`` 1:1) land at their
    ``webkitRelativePath`` position; we return ``payload/<root>`` where
    ``<root>`` is the common first path segment.
    """
    payload_dir = _STAGING_DIR / temp_ref / "payload"
    payload_dir.mkdir(parents=True, exist_ok=True)

    for i, upload in enumerate(files):
        rel = (paths[i] if paths else None) or upload.filename or f"file-{i}"
        rel = _sanitise_rel_path(rel)
        dest = payload_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            shutil.copyfileobj(upload.file, f)

    return _input_path_for_payload(payload_dir, files, paths)


def _sanitise_rel_path(rel: str) -> str:
    """Strip leading slashes and reject ``..`` components. Preserves the
    ``webkitRelativePath`` layout while blocking path traversal."""
    parts = [p for p in rel.replace("\\", "/").split("/") if p and p != "."]
    if any(p == ".." for p in parts):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid path component in upload: {rel!r}",
        )
    return "/".join(parts) or "upload"


def _input_path_for_payload(
    payload_dir: Path,
    files: list[UploadFile],
    paths: list[str] | None,
) -> Path:
    """Work out which path the handler should see.

    Single file upload -> the file itself. Folder upload -> the root
    directory (``payload_dir / <first segment of the common path>``).
    """
    if len(files) == 1 and not (paths and "/" in _sanitise_rel_path(paths[0] or "")):
        # single file: return the file path directly
        rel = (paths[0] if paths else None) or files[0].filename or "upload"
        return payload_dir / _sanitise_rel_path(rel)

    # folder upload: shared first segment across all paths
    roots: set[str] = set()
    for i, upload in enumerate(files):
        rel = (paths[i] if paths else None) or upload.filename or f"file-{i}"
        first = _sanitise_rel_path(rel).split("/", 1)[0]
        roots.add(first)
    if len(roots) == 1:
        return payload_dir / next(iter(roots))
    return payload_dir


def _resolve_staged(temp_ref: str) -> Path | None:
    stage_dir = _STAGING_DIR / temp_ref / "payload"
    if not stage_dir.is_dir():
        return None
    entries = list(stage_dir.iterdir())
    if not entries:
        return None
    if len(entries) == 1:
        return entries[0]
    # Multiple roots at payload level - return the payload dir so the
    # handler sees everything as one directory input.
    return stage_dir


def _drop_staged(temp_ref: str) -> None:
    stage_dir = _STAGING_DIR / temp_ref
    shutil.rmtree(stage_dir, ignore_errors=True)


def _gc_stale_staging() -> None:
    """Remove any staged upload older than the TTL. Called opportunistically
    during detect so the temp dir never grows without bound."""
    if not _STAGING_DIR.is_dir():
        return
    cutoff = datetime.now().timestamp() - _STAGING_TTL_SECONDS
    for child in _STAGING_DIR.iterdir():
        try:
            if child.stat().st_mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
        except OSError:
            continue


def _check_duplicate(db: Session, detected: DetectedProject) -> DuplicateInfo:
    row = (
        db.query(BookImportSource)
        .filter(
            BookImportSource.source_identifier == detected.source_identifier,
            BookImportSource.source_type == detected.format_name,
        )
        .first()
    )
    if row is None:
        return DuplicateInfo(found=False)

    book = db.query(Book).filter(Book.id == row.book_id).first()
    if book is None:  # stale source row; treat as no duplicate
        return DuplicateInfo(found=False)

    return DuplicateInfo(
        found=True,
        existing_book_id=book.id,
        existing_book_title=book.title,
        imported_at=row.imported_at,
    )


def _record_import_source(
    db: Session,
    book_id: str,
    source_identifier: str,
    source_type: str,
    format_name: str,
    overwrote: bool,
) -> None:
    if overwrote:
        existing = (
            db.query(BookImportSource)
            .filter(BookImportSource.book_id == book_id)
            .first()
        )
        if existing is not None:
            existing.source_identifier = source_identifier
            existing.source_type = source_type
            existing.format_name = format_name
            existing.imported_at = datetime.utcnow()
            db.commit()
            return
    db.add(
        BookImportSource(
            book_id=book_id,
            source_identifier=source_identifier,
            source_type=source_type,
            format_name=format_name,
        )
    )
    db.commit()
