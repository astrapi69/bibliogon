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


class RemoteConfigRequest(BaseModel):
    url: str = Field(..., max_length=2000)
    pat: str | None = Field(default=None, max_length=500)


class RemoteConfigResponse(BaseModel):
    url: str | None
    has_credential: bool


class PushRequest(BaseModel):
    force: bool = False


class PushResponse(BaseModel):
    branch: str
    summary: str
    flags: int
    forced: bool = False


class PullResponse(BaseModel):
    branch: str
    updated: bool
    fast_forward: bool
    head_hash: str | None = None


class SyncStatus(BaseModel):
    remote_configured: bool
    has_credential: bool
    ahead: int
    behind: int
    state: str


class ConflictAnalysis(BaseModel):
    state: str
    classification: str | None
    local_files: list[str]
    remote_files: list[str]
    overlapping_files: list[str]
    merge_in_progress: bool


class MergeResult(BaseModel):
    status: str
    head_hash: str | None = None
    files: list[str] | None = None


class ResolveRequest(BaseModel):
    resolutions: dict[str, str] = Field(default_factory=dict)


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


# --- Phase 2: remote, push, pull, sync-status ---


@router.post("/remote", response_model=RemoteConfigResponse)
def set_remote(
    book_id: str,
    payload: RemoteConfigRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.configure_remote(book_id, payload.url, payload.pat, db)
    except git_backup.RepoNotInitializedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "repo_not_initialized", "message": str(exc)},
        ) from exc
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/remote", response_model=RemoteConfigResponse)
def get_remote(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.get_remote_config(book_id, db)
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/remote", status_code=status.HTTP_204_NO_CONTENT)
def delete_remote(book_id: str, db: Session = Depends(get_db)) -> None:
    _assert_book(book_id, db)
    try:
        git_backup.delete_remote_config(book_id, db)
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/push", response_model=PushResponse)
def do_push(
    book_id: str,
    payload: PushRequest | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _assert_book(book_id, db)
    force = bool(payload and payload.force)
    try:
        return git_backup.push(book_id, db, force=force)
    except git_backup.RepoNotInitializedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "repo_not_initialized", "message": str(exc)},
        ) from exc
    except git_backup.RemoteNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "remote_not_configured", "message": str(exc)},
        ) from exc
    except git_backup.RemoteRejectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "remote_rejected", "message": str(exc)},
        ) from exc
    except git_backup.RemoteAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "remote_auth", "message": str(exc)},
        ) from exc
    except git_backup.RemoteNetworkError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "remote_network", "message": str(exc)},
        ) from exc
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/pull", response_model=PullResponse)
def do_pull(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.pull(book_id, db)
    except git_backup.RepoNotInitializedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "repo_not_initialized", "message": str(exc)},
        ) from exc
    except git_backup.RemoteNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "remote_not_configured", "message": str(exc)},
        ) from exc
    except git_backup.DivergedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "diverged", "message": str(exc)},
        ) from exc
    except git_backup.RemoteAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "remote_auth", "message": str(exc)},
        ) from exc
    except git_backup.RemoteNetworkError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "remote_network", "message": str(exc)},
        ) from exc
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/sync-status", response_model=SyncStatus)
def get_sync_status(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.sync_status(book_id, db)
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# --- Phase 4: conflict analysis + per-file resolution ---


@router.get("/conflict/analyze", response_model=ConflictAnalysis)
def analyze_conflict(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.analyze_conflict(book_id, db)
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/merge", response_model=MergeResult)
def do_merge(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.merge(book_id, db)
    except git_backup.RepoNotInitializedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "repo_not_initialized", "message": str(exc)},
        ) from exc
    except git_backup.RemoteNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "remote_not_configured", "message": str(exc)},
        ) from exc
    except git_backup.MergeInProgressError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "merge_in_progress", "message": str(exc)},
        ) from exc
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/conflict/resolve", response_model=MergeResult)
def resolve_conflict(
    book_id: str,
    payload: ResolveRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.resolve_conflicts(book_id, payload.resolutions, db)
    except git_backup.NoMergeInProgressError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "no_merge_in_progress", "message": str(exc)},
        ) from exc
    except git_backup.RepoNotInitializedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "repo_not_initialized", "message": str(exc)},
        ) from exc
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/conflict/abort", response_model=MergeResult)
def abort_merge(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _assert_book(book_id, db)
    try:
        return git_backup.abort_merge(book_id, db)
    except git_backup.NoMergeInProgressError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "no_merge_in_progress", "message": str(exc)},
        ) from exc
    except git_backup.RepoNotInitializedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "repo_not_initialized", "message": str(exc)},
        ) from exc
    except git_backup.GitBackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
