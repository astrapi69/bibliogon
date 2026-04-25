"""PGS-05 unified commit: fans out to core git and plugin-git-sync
in one user-facing action.

A book that has both subsystems enabled - core git for the
Bibliogon-internal version history (``uploads/{book_id}/.git``)
and plugin-git-sync for the external WBT repo
(``uploads/git-sync/{book_id}/repo``) - currently exposes two
separate "commit" buttons in the UI. PGS-05 introduces one
button that calls this service; the service decides which
subsystems to invoke based on what's actually configured for
the book.

Sequencing under the per-book lock:

1. Core git first. It has the smaller blast radius (single repo
   inside our own ``uploads/`` tree, no remote contact unless
   ``push_core=True``).
2. plugin-git-sync second. It re-scaffolds the WBT structure and
   commits to the persistent clone; if ``push_plugin=True``,
   pushes to the external remote.

Per-subsystem failures do NOT abort the other half. The result
shape carries a status entry per subsystem so the frontend can
render "core: ok, plugin-git-sync: failed (auth)" rather than a
single hard 500.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from sqlalchemy.orm import Session

from app.models import GitSyncMapping
from app.services import git_backup, git_sync_commit
from app.services.git_sync_lock import book_commit_lock

logger = logging.getLogger(__name__)


SubsystemStatus = Literal["ok", "skipped", "nothing_to_commit", "failed"]


@dataclass
class SubsystemResult:
    status: SubsystemStatus
    detail: str | None = None
    commit_sha: str | None = None
    pushed: bool = False


@dataclass
class UnifiedCommitResult:
    core_git: SubsystemResult
    plugin_git_sync: SubsystemResult


def book_subsystems(db: Session, *, book_id: str) -> dict[str, bool]:
    """Snapshot of which git subsystems are active for the book.

    Used by the frontend to decide whether to show the unified
    commit UI at all (only meaningful when at least one subsystem
    is enabled; surfaces both flags so the UI can decide whether
    to render disclaimer copy about the fan-out).
    """
    return {
        "core_git_initialized": git_backup.is_initialized(book_id),
        "plugin_git_sync_mapped": db.get(GitSyncMapping, book_id) is not None,
    }


def unified_commit(
    db: Session,
    *,
    book_id: str,
    message: str | None,
    push_core: bool = False,
    push_plugin: bool = False,
) -> UnifiedCommitResult:
    """Run both commit paths under the per-book lock.

    ``message`` is shared - core git uses it as-is; plugin-git-sync
    falls back to its default ``"Sync from Bibliogon at <utc-iso>"``
    when ``message`` is None or empty. ``push_core`` is reserved
    for a follow-up wiring through ``git_backup.push``; for now
    it's accepted but no-op'd because core-git push needs PAT
    handling that lives in a separate session of work.
    """
    with book_commit_lock(book_id):
        core_result = _run_core_git(db, book_id=book_id, message=message)
        plugin_result = _run_plugin_git_sync(
            db, book_id=book_id, message=message, push=push_plugin
        )
        if push_core:
            core_result.detail = (
                (core_result.detail or "") + " (push deferred to a future session)"
            ).strip()

    return UnifiedCommitResult(core_git=core_result, plugin_git_sync=plugin_result)


# --- per-subsystem helpers ---


def _run_core_git(
    db: Session, *, book_id: str, message: str | None
) -> SubsystemResult:
    if not git_backup.is_initialized(book_id):
        return SubsystemResult(status="skipped", detail="core git not initialized")
    try:
        commit_info = git_backup.commit(
            book_id, message=message or f"Update {book_id}", db=db
        )
    except git_backup.NothingToCommitError as exc:
        return SubsystemResult(status="nothing_to_commit", detail=str(exc))
    except git_backup.GitBackupError as exc:
        logger.exception("unified commit: core git failed for %s", book_id)
        return SubsystemResult(status="failed", detail=str(exc))
    return SubsystemResult(status="ok", commit_sha=str(commit_info.get("hash")))


def _run_plugin_git_sync(
    db: Session, *, book_id: str, message: str | None, push: bool
) -> SubsystemResult:
    mapping = db.get(GitSyncMapping, book_id)
    if mapping is None:
        return SubsystemResult(
            status="skipped", detail="plugin-git-sync mapping not present"
        )
    try:
        result = git_sync_commit.commit_to_repo(
            db, book_id=book_id, message=message, push=push
        )
    except git_sync_commit.NothingToCommitError as exc:
        return SubsystemResult(status="nothing_to_commit", detail=str(exc))
    except (
        git_sync_commit.MappingNotFoundError,
        git_sync_commit.CloneMissingError,
        git_sync_commit.PushFailedError,
    ) as exc:
        logger.exception("unified commit: plugin-git-sync failed for %s", book_id)
        return SubsystemResult(status="failed", detail=str(exc))
    return SubsystemResult(
        status="ok",
        commit_sha=str(result.get("commit_sha")),
        pushed=bool(result.get("pushed")),
    )
