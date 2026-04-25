"""Persistent state for plugin-git-sync's import-then-commit flow.

PGS-01 stages the cloned repo in the orchestrator's temp dir,
which is wiped after execute. PGS-02 needs the clone to survive
so the "Commit to Repo" button has somewhere to write into. This
module:

1. Moves the staged clone into a long-lived directory
   (``uploads/git-sync/{book_id}/repo``) on successful execute.
2. Reads remote URL, current branch, and HEAD sha from the clone.
3. Writes a :class:`GitSyncMapping` row so the commit endpoint
   can later resolve ``book_id -> clone path + remote handle``.

Failures here MUST NOT roll back the import - a successful book
in the DB is the user's primary value. We log + skip.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import GitSyncMapping

logger = logging.getLogger(__name__)


# Persistent clone area lives under uploads/ next to the asset
# store so backups already pick it up. Per-book subdir; the
# repo itself sits one level deeper under repo/ so we can add
# sibling state (e.g. a credentials cache) later without
# reorganizing.
_GIT_SYNC_ROOT_NAME = "git-sync"
_UPLOADS_ROOT = Path("uploads")


def persist_clone_after_import(
    db: Session,
    *,
    staging_path: Path,
    book_id: str,
    uploads_dir: Path = _UPLOADS_ROOT,
) -> None:
    """Move the staged clone into a long-lived directory and write
    the GitSyncMapping row.

    ``staging_path`` is the directory ``find_handler`` dispatched
    through. The clone's working tree is at staging_path itself
    (or its first child for some handlers); the ``.git`` directory
    lives there. We test for that presence before doing anything.

    No-op when the staging path has no ``.git`` (file uploads,
    folder drops, etc.).
    """
    git_dir = _find_git_dir(staging_path)
    if git_dir is None:
        return
    repo_root = git_dir.parent

    try:
        url, branch, head_sha = _read_repo_metadata(repo_root)
    except Exception:
        logger.exception(
            "git-sync persist: could not read repo metadata at %s; "
            "skipping mapping write for book_id=%s",
            repo_root,
            book_id,
        )
        return

    target_dir = uploads_dir / _GIT_SYNC_ROOT_NAME / book_id / "repo"
    try:
        if target_dir.exists():
            shutil.rmtree(target_dir)
        target_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(repo_root, target_dir)
    except Exception:
        logger.exception(
            "git-sync persist: could not copy clone from %s to %s for book_id=%s",
            repo_root,
            target_dir,
            book_id,
        )
        return

    try:
        _upsert_mapping(
            db,
            book_id=book_id,
            repo_url=url,
            branch=branch,
            head_sha=head_sha,
            local_clone_path=str(target_dir),
        )
    except Exception:
        logger.exception(
            "git-sync persist: could not write GitSyncMapping for book_id=%s",
            book_id,
        )


def _find_git_dir(staging_path: Path) -> Path | None:
    """Locate the ``.git`` directory near the staging path.

    The orchestrator's git path clones into
    ``<staging>/<repo_slug>``; the WBT handler then dispatches at
    that same level. So ``.git`` is at ``staging_path/.git``.
    Defensive fallback: if the immediate parent has it (a
    handler that descended one extra level), use that.
    """
    if (staging_path / ".git").is_dir():
        return staging_path / ".git"
    if (staging_path.parent / ".git").is_dir():
        return staging_path.parent / ".git"
    return None


def _read_repo_metadata(repo_root: Path) -> tuple[str, str, str]:
    """Return ``(remote_url, branch, head_sha)`` for ``repo_root``.

    Imports GitPython lazily so this module loads cheaply when the
    plugin is not active.
    """
    from git import Repo

    repo = Repo(str(repo_root))
    try:
        url = next(iter(repo.remotes.origin.urls), "")
    except (AttributeError, ValueError):
        url = ""
    try:
        branch = repo.active_branch.name
    except (TypeError, ValueError):
        # Detached HEAD (rare for fresh clones); fall back to a
        # short SHA so the mapping still has a usable handle.
        branch = repo.head.commit.hexsha[:12]
    head_sha = repo.head.commit.hexsha
    return url, branch, head_sha


def _upsert_mapping(
    db: Session,
    *,
    book_id: str,
    repo_url: str,
    branch: str,
    head_sha: str,
    local_clone_path: str,
) -> None:
    existing = db.get(GitSyncMapping, book_id)
    if existing is not None:
        existing.repo_url = repo_url
        existing.branch = branch
        existing.last_imported_commit_sha = head_sha
        existing.local_clone_path = local_clone_path
    else:
        db.add(
            GitSyncMapping(
                book_id=book_id,
                repo_url=repo_url,
                branch=branch,
                last_imported_commit_sha=head_sha,
                local_clone_path=local_clone_path,
            )
        )
    db.commit()
