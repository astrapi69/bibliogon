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
from app.services import git_credentials
from app.services.git_sync_commit import (
    CloneMissingError,
    MappingNotFoundError,
    NothingToCommitError,
    PushFailedError,
    commit_to_repo,
)
from app.services.git_sync_diff import apply_resolutions, diff_book
from app.services.git_sync_unified import book_subsystems, unified_commit

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
    #: PGS-05: True when the book also has core git enabled
    #: (``uploads/{book_id}/.git`` exists). Used by the frontend
    #: to decide whether to show the unified "Commit everywhere"
    #: button instead of the single-subsystem one.
    core_git_initialized: bool = False
    #: PGS-02-FU-01: True when a per-book PAT is stored. Lets the
    #: GitSyncDialog show "Repo credentials configured" without
    #: ever returning the PAT itself.
    has_credential: bool = False


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


# --- PGS-03 diff models ---


class ChapterDiffEntry(BaseModel):
    """One row in the three-way diff payload.

    ``classification`` is the stable string the frontend switches
    on; ``base_md`` / ``local_md`` / ``remote_md`` are nullable so
    add/remove cases can carry whichever sides exist. ``identity``
    is the ``(section, slug)`` pair the frontend needs to send back
    when applying a per-chapter resolution in PGS-03 Session 2.
    """

    section: str
    slug: str
    title: str
    classification: str
    base_md: str | None = None
    local_md: str | None = None
    remote_md: str | None = None
    db_chapter_id: str | None = None


class DiffResponse(BaseModel):
    book_id: str
    last_imported_commit_sha: str
    branch: str
    chapters: list[ChapterDiffEntry]
    #: Quick summary so the UI can show a header without
    #: counting chapter-by-chapter.
    counts: dict[str, int]


class ResolutionEntry(BaseModel):
    section: str
    slug: str
    #: ``keep_local`` (no-op) or ``take_remote`` (overwrite DB
    #: chapter with remote markdown). PGS-03 MVP intentionally
    #: does NOT support ``mark_conflict`` (which would write
    #: both versions as a visible conflict block) - that's a
    #: follow-up.
    action: str = Field(pattern="^(keep_local|take_remote)$")


class ResolveRequest(BaseModel):
    resolutions: list[ResolutionEntry] = Field(default_factory=list)


class ResolveResponse(BaseModel):
    counts: dict[str, int]


# --- PGS-05 unified commit ---


class UnifiedCommitRequest(BaseModel):
    message: str | None = Field(default=None, max_length=2000)
    push_core: bool = False
    push_plugin: bool = False


class SubsystemResultEntry(BaseModel):
    status: str
    detail: str | None = None
    commit_sha: str | None = None
    pushed: bool = False


class UnifiedCommitResponse(BaseModel):
    core_git: SubsystemResultEntry
    plugin_git_sync: SubsystemResultEntry


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
    subsystems = book_subsystems(db, book_id=book_id)
    core_active = subsystems["core_git_initialized"]

    has_credential = git_credentials.has_pat(book_id)

    if mapping is None:
        return GitSyncStatusResponse(
            mapped=False,
            core_git_initialized=core_active,
            has_credential=has_credential,
        )

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
        core_git_initialized=core_active,
        has_credential=has_credential,
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


@router.post("/{book_id}/diff", response_model=DiffResponse)
def diff(
    book_id: str,
    db: Session = Depends(get_db),
) -> DiffResponse:
    """Return the three-way diff (base vs local vs remote) per chapter.

    Read-only: this endpoint runs ``git ls-tree`` + ``git show``
    against the persisted clone and reads the local DB. It does NOT
    fetch from the remote - callers must ``git fetch`` first if
    they want the remote side to reflect upstream changes since
    the last clone update. PGS-03 Session 2 will add a fetch step
    inside the re-import flow before invoking diff.
    """
    mapping = db.get(GitSyncMapping, book_id)
    if mapping is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book is not mapped to a git repository.",
        )
    try:
        diffs = diff_book(db, book_id=book_id)
    except MappingNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except CloneMissingError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc)) from exc

    counts: dict[str, int] = {}
    entries: list[ChapterDiffEntry] = []
    for d in diffs:
        counts[d.classification] = counts.get(d.classification, 0) + 1
        entries.append(
            ChapterDiffEntry(
                section=d.identity.section,
                slug=d.identity.slug,
                title=d.title,
                classification=d.classification,
                base_md=d.base_md,
                local_md=d.local_md,
                remote_md=d.remote_md,
                db_chapter_id=d.db_chapter_id,
            )
        )

    return DiffResponse(
        book_id=book_id,
        last_imported_commit_sha=mapping.last_imported_commit_sha,
        branch=mapping.branch,
        chapters=entries,
        counts=counts,
    )


@router.post("/{book_id}/resolve", response_model=ResolveResponse)
def resolve(
    book_id: str,
    payload: ResolveRequest,
    db: Session = Depends(get_db),
) -> ResolveResponse:
    """Apply per-chapter resolutions and advance the mapping cursor.

    Mutates the local DB only - the remote repository is not
    touched. Subsequent ``commit_to_repo`` is the user's explicit
    next step if they also want to publish the resolved state.
    """
    try:
        counts = apply_resolutions(
            db,
            book_id=book_id,
            resolutions=[r.model_dump() for r in payload.resolutions],
        )
    except MappingNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except CloneMissingError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc)) from exc
    return ResolveResponse(counts=counts)


@router.post("/{book_id}/unified-commit", response_model=UnifiedCommitResponse)
def unified_commit_endpoint(
    book_id: str,
    payload: UnifiedCommitRequest,
    db: Session = Depends(get_db),
) -> UnifiedCommitResponse:
    """PGS-05: fan one user-facing commit out to both git subsystems.

    Skips the ones the book has not enabled (no init, no mapping).
    Per-subsystem failures land in the response payload rather
    than as a single hard 500 - the user wants visibility into
    "core succeeded, plugin failed (auth)" rather than "something
    failed".

    Returns 503 only when the per-book lock can't be acquired
    within 30 seconds (another commit is in flight).
    """
    try:
        result = unified_commit(
            db,
            book_id=book_id,
            message=payload.message,
            push_core=payload.push_core,
            push_plugin=payload.push_plugin,
        )
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return UnifiedCommitResponse(
        core_git=SubsystemResultEntry(
            status=result.core_git.status,
            detail=result.core_git.detail,
            commit_sha=result.core_git.commit_sha,
            pushed=result.core_git.pushed,
        ),
        plugin_git_sync=SubsystemResultEntry(
            status=result.plugin_git_sync.status,
            detail=result.plugin_git_sync.detail,
            commit_sha=result.plugin_git_sync.commit_sha,
            pushed=result.plugin_git_sync.pushed,
        ),
    )


# --- credentials (PGS-02-FU-01) ---


class CredentialStatus(BaseModel):
    has_credential: bool


class CredentialPayload(BaseModel):
    pat: str = Field(..., description="Personal Access Token. Empty string clears.")


@router.get("/{book_id}/credentials", response_model=CredentialStatus)
def get_credential_status(book_id: str) -> CredentialStatus:
    """Return whether a per-book PAT is stored. Never returns the PAT itself."""
    return CredentialStatus(has_credential=git_credentials.has_pat(book_id))


@router.put(
    "/{book_id}/credentials",
    response_model=CredentialStatus,
    status_code=status.HTTP_200_OK,
)
def put_credential(book_id: str, payload: CredentialPayload) -> CredentialStatus:
    """Store (or clear) the per-book PAT.

    The same per-book PAT slot is shared with :mod:`app.services.git_backup`,
    so a token set here also unblocks the core git push/pull, and vice
    versa. Empty ``pat`` deletes the stored credential.
    """
    git_credentials.save_pat(book_id, payload.pat)
    return CredentialStatus(has_credential=git_credentials.has_pat(book_id))


@router.delete("/{book_id}/credentials", status_code=status.HTTP_204_NO_CONTENT)
def delete_credential(book_id: str) -> None:
    """Idempotent secure delete of the per-book PAT."""
    git_credentials.delete_pat(book_id)


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
