"""HTTP endpoints for backup, restore and project import.

This router is intentionally thin: every endpoint validates the request,
delegates to a service in ``app.services.backup``, and returns the result.
All business logic lives in that package - see its ``__init__`` for the map.
"""

from typing import Any

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.backup_history import BackupHistory
from app.database import get_db
from app.services.backup import (
    compare_backups,
    export_backup_archive,
    import_backup_archive,
)

router = APIRouter(prefix="/backup", tags=["backup"])

_history = BackupHistory()


@router.get("/export")
def export_backup(
    include_audiobook: bool = False,
    db: Session = Depends(get_db),
) -> FileResponse:
    """Export a full backup of all books, chapters and assets as a .bgb ZIP.

    ``include_audiobook=true`` also bundles the persisted audiobook MP3s
    under each book. Off by default because audiobook files can be very
    large.
    """
    bgb_path, filename = export_backup_archive(db, include_audiobook=include_audiobook)
    return FileResponse(
        path=str(bgb_path),
        media_type="application/octet-stream",
        filename=filename,
    )


@router.get("/history")
def get_backup_history(limit: int = 50) -> list[dict[str, Any]]:
    """Return chronological list of backup/restore/import events."""
    return _history.list(limit)


@router.post("/import")
def import_backup(file: UploadFile, db: Session = Depends(get_db)) -> dict[str, int]:
    """Import a full backup (.bgb file), restoring all books and chapters."""
    return import_backup_archive(file, db)


@router.post("/compare")
def compare_backup_files(
    file_a: UploadFile = File(..., description="Erstes Backup (.bgb)"),
    file_b: UploadFile = File(..., description="Zweites Backup (.bgb)"),
) -> dict[str, Any]:
    """Compare two uploaded .bgb backup files in memory.

    Stop-gap for ROADMAP V-02 until the Git-based Sicherung feature lands.
    Neither file is persisted on the server. Both must contain at least one
    common book id, otherwise the compare is rejected with HTTP 400.
    """
    return compare_backups(file_a, file_b)
