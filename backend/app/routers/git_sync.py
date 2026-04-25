"""HTTP surface for plugin-git-sync's PGS-02 commit-to-repo flow.

Endpoints:

- ``GET  /api/git-sync/{book_id}`` - mapping snapshot + working-tree state
- ``POST /api/git-sync/{book_id}/commit`` - re-scaffold + commit on local clone

Routing is thin: every endpoint delegates to
:mod:`app.services.git_sync_commit`. Errors raised by the service
map to HTTP status codes here.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import GitSyncMapping
from app.services.git_sync_commit import (
    CloneMissingError,
    MappingNotFoundError,
    NothingToCommitError,
    PushFailedError,
    commit_to_repo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/git-sync", tags=["git-sync"])


# --- response models ---


class GitSyncStatusResponse(BaseModel):
    mapped: bool
    repo_url: str | None = None
    branch: str | None = None
    last_imported_commit_sha: str | None = None
    local_clone_path: str | None = None
    last_committed_at: str | None = None
    #: True when the local clone has uncommitted changes vs HEAD.
    #: ``None`` when the clone is missing on disk (so the UI can
    #: surface "clone missing - re-import" rather than "dirty").
    dirty: bool | None = None


class CommitRequest(BaseModel):
    #: Optional override; defaults to "Sync from Bibliogon at <utc-iso>".
    message: str | None = Field(default=None, max_length=2000)
    #: Push to remote after committing. Not yet implemented; kept on
    #: the request shape so the frontend can wire the toggle now.
    push: bool = False


class CommitResponse(BaseModel):
    commit_sha: str
    branch: str
    pushed: bool


# --- endpoints ---


@router.get("/{book_id}", response_model=GitSyncStatusResponse)
def get_status(
    book_id: str,
    db: Session = Depends(get_db),
) -> GitSyncStatusResponse:
    """Snapshot of the GitSyncMapping plus a cheap dirty check.

    Used by the BookEditor's "Commit to Repo" button to decide
    whether to render at all (``mapped=False`` -> hide), and
    whether to warn the user about uncommitted edits.
    """
    mapping = db.get(GitSyncMapping, book_id)
    if mapping is None:
        return GitSyncStatusResponse(mapped=False)

    clone_path = Path(mapping.local_clone_path)
    dirty = _is_dirty(clone_path)

    return GitSyncStatusResponse(
        mapped=True,
        repo_url=mapping.repo_url,
        branch=mapping.branch,
        last_imported_commit_sha=mapping.last_imported_commit_sha,
        local_clone_path=str(clone_path),
        last_committed_at=(
            mapping.last_committed_at.isoformat() if mapping.last_committed_at else None
        ),
        dirty=dirty,
    )


@router.post("/{book_id}/commit", response_model=CommitResponse)
def commit(
    book_id: str,
    payload: CommitRequest,
    db: Session = Depends(get_db),
) -> CommitResponse:
    """Re-scaffold the book into the clone and create one commit."""
    try:
        result = commit_to_repo(db, book_id=book_id, message=payload.message, push=payload.push)
    except MappingNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except CloneMissingError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc)) from exc
    except NothingToCommitError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PushFailedError as exc:
        # 401 for credential failures, 409 for non-fast-forward
        # rejection, 502 for network/unknown - chosen so the
        # frontend can map to a useful toast without parsing
        # stderr. The .reason slug is also surfaced in the body.
        status_code = {
            "auth": status.HTTP_401_UNAUTHORIZED,
            "rejected": status.HTTP_409_CONFLICT,
            "network": status.HTTP_502_BAD_GATEWAY,
            "no_remote": status.HTTP_409_CONFLICT,
            "unknown": status.HTTP_502_BAD_GATEWAY,
        }.get(exc.reason, status.HTTP_502_BAD_GATEWAY)
        raise HTTPException(
            status_code=status_code,
            detail={"reason": exc.reason, "message": str(exc)},
        ) from exc

    return CommitResponse(**result)  # type: ignore[arg-type]


# --- helpers ---


def _is_dirty(clone_path: Path) -> bool | None:
    """Cheap dirty-check; ``None`` when the clone is missing."""
    if not clone_path.is_dir() or not (clone_path / ".git").is_dir():
        return None
    try:
        from git import Repo

        repo = Repo(str(clone_path))
        return bool(repo.is_dirty(untracked_files=True))
    except Exception:
        logger.exception("git-sync: dirty-check failed for %s", clone_path)
        return None
