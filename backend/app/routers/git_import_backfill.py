"""Post-import ``.git/`` adoption for existing books.

For users who imported a book before the adoption feature shipped:
upload the source ZIP (or just the ``.git.zip``) and this endpoint
runs sanitization + :func:`git_import_adopter.adopt_git_dir` against
the existing ``uploads/{book_id}/`` directory.

Rejects with 409 when the book already has a ``.git/`` — the user
must explicitly delete the current repo via the existing
``DELETE /api/books/{id}/git-backup/`` flow first.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book
from app.services import git_backup
from app.services.git_import_adopter import (
    CorruptedSourceRepo,
    RepoAlreadyPresent,
    adopt_git_dir,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["git-import-backfill"])


@router.post("/{book_id}/git-import/adopt")
def adopt_from_upload(
    book_id: str,
    file: UploadFile = File(...),
    preserve_remote: bool = Form(default=False),
    db: Session = Depends(get_db),
) -> dict:
    """Extract the uploaded ZIP, locate a ``.git`` directory, and
    adopt it into ``uploads/{book_id}/.git`` via the same sanitizer
    + adopter the import orchestrator uses.

    Accepts any ZIP that contains a ``.git/`` directory at the root
    or one level deep (matching ``find_project_root`` semantics).
    Returns the adoption result dict.
    """
    book = db.query(Book).filter(Book.id == book_id).first()
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Book {book_id!r} not found.",
        )
    if (git_backup.repo_path(book_id) / ".git").is_dir():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Book already has a .git/ directory. Delete the "
                "existing git state first via the Git-Backup dialog "
                "(reset repo), then retry."
            ),
        )

    # Extract the upload to a short-lived temp dir.
    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_git_adopt_"))
    try:
        upload_path = tmp_dir / "upload.zip"
        with upload_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        try:
            with zipfile.ZipFile(upload_path, "r") as zf:
                zf.extractall(tmp_dir)
        except zipfile.BadZipFile as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Upload is not a valid ZIP: {exc}",
            ) from exc

        git_dir = _find_git_dir(tmp_dir)
        if git_dir is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Uploaded ZIP contains no .git/ directory at root "
                    "or one level deep."
                ),
            )

        try:
            result = adopt_git_dir(
                git_dir=git_dir,
                target_book_id=book_id,
                preserve_remote=preserve_remote,
                db=db,
            )
        except RepoAlreadyPresent as exc:
            # Race: another request adopted between our pre-flight and
            # this call. Map to the same 409.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(exc),
            ) from exc
        except CorruptedSourceRepo as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
        return result
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _find_git_dir(root: Path) -> Path | None:
    """Return a ``.git`` directory at the root or one level deep."""
    top_git = root / ".git"
    if top_git.is_dir():
        return top_git
    for child in root.iterdir():
        if child.is_dir():
            nested = child / ".git"
            if nested.is_dir():
                return nested
    return None
