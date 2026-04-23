"""Two-phase import orchestrator endpoints.

POST /api/import/detect inspects the uploaded input, dispatches to the
first matching ImportPlugin, checks the BookImportSource table for a
duplicate, and returns the preview payload the wizard renders.

POST /api/import/execute commits the import honouring the user's
duplicate-action choice (create / overwrite / cancel) and records a
BookImportSource row so the next detect call recognizes the import.

Legacy /api/backup/import, /api/backup/import-project and
/api/backup/smart-import stay live; this router is additive. See
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
from app.import_plugins import find_handler, list_plugins
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
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> DetectResponse:
    _gc_stale_staging()
    temp_ref = f"imp-{uuid.uuid4().hex}"
    staging_path = _stage_upload(file, temp_ref)

    plugin = find_handler(str(staging_path))
    if plugin is None:
        # Drop the stage; nothing can consume it.
        _drop_staged(temp_ref)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "message": "No import handler can process this file.",
                "filename": file.filename,
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


def _stage_upload(file: UploadFile, temp_ref: str) -> Path:
    stage_dir = _STAGING_DIR / temp_ref
    stage_dir.mkdir(parents=True, exist_ok=True)
    original_name = file.filename or "upload"
    # Preserve the original filename so can_handle can look at the suffix.
    dest = stage_dir / original_name
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return dest


def _resolve_staged(temp_ref: str) -> Path | None:
    stage_dir = _STAGING_DIR / temp_ref
    if not stage_dir.is_dir():
        return None
    children = [c for c in stage_dir.iterdir() if c.is_file()]
    if not children:
        return None
    return children[0]


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
