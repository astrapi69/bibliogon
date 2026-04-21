"""FastAPI router for Phase 1 git-based backup.

Thin layer on top of :mod:`app.services.git_backup`. All business logic
lives in the service; this module only validates input, maps service
exceptions to HTTP status codes, and shapes responses.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book
from app.services import git_backup

router = APIRouter(
    prefix="/books/{book_id}/git",
    tags=["git-backup"],
)


class CommitRequest(BaseModel):
    message: str = Field("", max_length=2000)


class CommitEntry(BaseModel):
    hash: str
    short_hash: str
    message: str
    author: str
    date: str


class RepoStatus(BaseModel):
    initialized: bool
    dirty: bool
    uncommitted_files: int
    head_hash: str | None
    head_short_hash: str | None


def _assert_book(book_id: str, db: Session) -> None:
    if not db.query(Book).filter(Book.id == book_id).first():
        raise HTTPException(status_code=404, detail="Book not found")


@router.post("/init", response_model=RepoStatus)
def init(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.init_repo(book_id, db)
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/commit", response_model=CommitEntry)
def create_commit(
    book_id: str,
    payload: CommitRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.commit(book_id, payload.message, db)
    except git_backup.RepoNotInitializedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "repo_not_initialized", "message": str(exc)},
        ) from exc
    except git_backup.NothingToCommitError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "nothing_to_commit", "message": str(exc)},
        ) from exc
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/log", response_model=list[CommitEntry])
def list_commits(
    book_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    _assert_book(book_id, db)
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=422, detail="limit must be 1-500")
    try:
        return git_backup.log(book_id, db, limit=limit)
    except git_backup.RepoNotInitializedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "repo_not_initialized", "message": str(exc)},
        ) from exc
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/status", response_model=RepoStatus)
def get_status(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.status(book_id, db)
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
