"""Auto-detect file format and dispatch to the right importer."""

import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.services.backup.backup_import import import_backup_archive
from app.services.backup.markdown_import import (
    import_plain_markdown_zip,
    import_single_markdown,
)
from app.services.backup.project_import import import_project_zip


def smart_import_file(file: UploadFile, db: Session) -> dict[str, Any]:
    """Unified import: auto-detects file format and routes to the correct handler.

    Supported formats:
    - .bgb -> Backup Restore
    - .bgp -> Project Import
    - .zip with manifest.json (bibliogon-backup) -> Backup Restore
    - .zip with metadata.yaml -> write-book-template Project Import
    - .zip with .md files -> Markdown collection Import
    - .md -> Single chapter (creates new book)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename = file.filename.lower()

    if filename.endswith(".bgb"):
        return {"type": "backup", "result": import_backup_archive(file, db)}
    if filename.endswith(".bgp"):
        return {"type": "project", "result": import_project_zip(file, db)}
    if filename.endswith(".md"):
        return {"type": "chapter", "result": import_single_markdown(file, db)}
    if filename.endswith(".zip"):
        return _dispatch_zip(file, db)

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported file format: '{filename}'. Supported: .zip, .md, .bgb, .bgp",
    )


def _dispatch_zip(file: UploadFile, db: Session) -> dict[str, Any]:
    """Save the ZIP once, peek inside, and route to the right importer."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_smart_import_"))
    try:
        zip_path = _save_upload(file, tmp_dir / "upload.zip")
        names = _read_zip_names(zip_path)

        # Reopen-on-demand: each importer needs its own UploadFile handle.
        def reopen(virtual_name: str) -> UploadFile:
            return UploadFile(file=open(zip_path, "rb"), filename=virtual_name)

        if any("manifest.json" in n for n in names):
            return {"type": "backup", "result": import_backup_archive(reopen("backup.bgb"), db)}

        if any(n.endswith("metadata.yaml") for n in names):
            return {"type": "template", "result": import_project_zip(reopen("project.bgp"), db)}

        md_files = [n for n in names if n.endswith(".md") and not n.startswith("__")]
        if md_files:
            extracted = tmp_dir / "extracted"
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(extracted)
            return {"type": "markdown", "result": import_plain_markdown_zip(extracted, db, tmp_dir)}

        raise HTTPException(
            status_code=400,
            detail=(
                "ZIP contains no recognized content. Expected: metadata.yaml "
                "(write-book-template), .md files, or bibliogon backup."
            ),
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _save_upload(file: UploadFile, target: Path) -> Path:
    with open(target, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return target


def _read_zip_names(zip_path: Path) -> list[str]:
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            return zf.namelist()
    except zipfile.BadZipFile as e:
        raise HTTPException(status_code=400, detail="Corrupted ZIP file") from e
