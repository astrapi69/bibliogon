"""PGS-02 commit-to-repo service.

Reads a book from the DB, regenerates its WBT (write-book-template)
representation via plugin-export's ``scaffold_project``, sweeps the
generated tree into the on-disk clone tracked by
:class:`GitSyncMapping`, and creates a single git commit.

Design choices:

- **Overwrite semantics (variant 2c).** The clone working tree is
  wiped (everything except ``.git/``) and re-written from the
  current Bibliogon state. No 3-way comparison. Any direct-repo
  edits since the last import are lost unless the user re-imports
  first. Documented in ``docs/explorations/plugin-git-sync.md``
  Section 6.2.
- **Push uses the per-book PAT or SSH key when available.** Both
  PAT (HTTPS) and SSH key (``ssh://`` / ``git@host:path``) are
  shared per-book with :mod:`app.services.git_backup` via
  :mod:`app.services.git_credentials` (PGS-02-FU-01). When neither
  is configured the push falls back to ambient git credentials
  (system credential helper / ssh-agent). Failures raise
  :class:`PushFailedError` with a stable ``.reason`` slug
  ("auth", "rejected", "network", "no_remote", "unknown") so the
  router can map without parsing git stderr.
- **Failures surface as typed errors** (``GitSyncCommitError`` and
  subclasses) so the router can map them to HTTP status codes
  without sprinkling ``HTTPException`` calls into the service.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Asset, Book, Chapter, GitSyncMapping
from app.services import git_credentials

logger = logging.getLogger(__name__)


class GitSyncCommitError(Exception):
    """Base class for commit-to-repo failures."""


class MappingNotFoundError(GitSyncCommitError):
    """No GitSyncMapping row for this book - was it imported via plugin-git-sync?"""


class CloneMissingError(GitSyncCommitError):
    """The mapped clone path no longer exists on disk."""


class NothingToCommitError(GitSyncCommitError):
    """Working tree had no changes after re-scaffolding."""


class PushFailedError(GitSyncCommitError):
    """Remote rejected the push (auth/diverged/network).

    The .reason attribute carries a short stable string the router
    can hand to the i18n layer ("auth", "rejected", "network",
    "unknown"); the message is the underlying git stderr.
    """

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason


def commit_to_repo(
    db: Session,
    *,
    book_id: str,
    message: str | None = None,
    push: bool = False,
) -> dict[str, str | bool]:
    """Re-scaffold the book and create one commit on the local clone.

    When ``push`` is True the new commit is also pushed to the
    ``origin`` remote using the user's ambient git credentials
    (SSH agent / ``~/.ssh/id_*`` for SSH URLs; system git
    credential helper for HTTPS). PAT injection through the
    Bibliogon credential store is **not** wired in PGS-02
    Session 2 - that is the same shared-credential follow-up
    work that ``app.services.git_backup`` does for core git.

    Returns ``{"commit_sha", "branch", "pushed"}``.
    Raises subclasses of :class:`GitSyncCommitError` on failure.
    """
    mapping = db.get(GitSyncMapping, book_id)
    if mapping is None:
        raise MappingNotFoundError(f"Book {book_id} was not imported via plugin-git-sync.")

    clone_path = Path(mapping.local_clone_path)
    if not clone_path.is_dir() or not (clone_path / ".git").is_dir():
        raise CloneMissingError(
            f"Local clone {clone_path} for book {book_id} is missing or invalid."
        )

    book = _load_book(db, book_id)
    chapters = _load_chapters(db, book_id)
    assets = _load_assets(db, book_id)

    with tempfile.TemporaryDirectory(prefix="git-sync-scaffold-") as tmp:
        project_dir = _scaffold_into(book, chapters, assets, Path(tmp))
        _replace_clone_working_tree(clone_path, project_dir)

    commit_sha, branch = _commit(
        clone_path,
        message=message or _default_commit_message(),
    )

    pushed = False
    if push:
        # Push BEFORE bumping last_committed_at: a push failure
        # should not look like a successful sync in the UI.
        _push(clone_path, branch=branch, book_id=book_id)
        pushed = True

    mapping.last_committed_at = datetime.now(UTC)
    db.add(mapping)
    db.commit()

    return {"commit_sha": commit_sha, "branch": branch, "pushed": pushed}


# --- helpers ---


def _load_book(db: Session, book_id: str) -> dict[str, object]:
    book = db.get(Book, book_id)
    if book is None:
        raise MappingNotFoundError(
            f"Book {book_id} not found (DB inconsistency vs GitSyncMapping)."
        )
    return {
        "id": book.id,
        "title": book.title,
        "subtitle": book.subtitle,
        "author": book.author,
        "language": book.language,
        "series": book.series,
        "series_index": book.series_index,
        "genre": book.genre,
        "description": book.description,
        "edition": book.edition,
        "publisher": book.publisher,
        "publisher_city": book.publisher_city,
        "publish_date": book.publish_date,
        "isbn_ebook": book.isbn_ebook,
        "isbn_paperback": book.isbn_paperback,
        "isbn_hardcover": book.isbn_hardcover,
        "asin_ebook": book.asin_ebook,
        "asin_paperback": book.asin_paperback,
        "asin_hardcover": book.asin_hardcover,
        "keywords": book.keywords,
        "html_description": book.html_description,
        "backpage_description": book.backpage_description,
        "backpage_author_bio": book.backpage_author_bio,
        "cover_image": book.cover_image,
        "custom_css": book.custom_css,
    }


def _load_chapters(db: Session, book_id: str) -> list[dict[str, object]]:
    rows = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.position).all()
    return [
        {
            "id": ch.id,
            "title": ch.title,
            "content": ch.content,
            "position": ch.position,
            "chapter_type": ch.chapter_type,
        }
        for ch in rows
    ]


def _load_assets(db: Session, book_id: str) -> list[dict[str, object]]:
    rows = db.query(Asset).filter(Asset.book_id == book_id).all()
    return [
        {
            "id": a.id,
            "filename": a.filename,
            "asset_type": a.asset_type,
            "path": a.path,
        }
        for a in rows
    ]


def _scaffold_into(
    book: dict[str, object],
    chapters: list[dict[str, object]],
    assets: list[dict[str, object]],
    out_dir: Path,
) -> Path:
    """Run plugin-export's scaffolder and return the resulting project dir.

    Imported lazily so this module loads even when the export
    plugin is not registered (the call still fails - by design -
    but only at commit time, not at import time).
    """
    from bibliogon_export.scaffolder import scaffold_project  # type: ignore[import-untyped]

    project_dir: Path = scaffold_project(book, chapters, out_dir, assets=assets)
    return project_dir


def _replace_clone_working_tree(clone_path: Path, scaffolded_dir: Path) -> None:
    """Wipe ``clone_path`` working tree (preserve ``.git/``) and copy
    the scaffolded project into it.

    Uses path-by-path removal rather than ``shutil.rmtree(clone)``
    because the ``.git`` directory MUST survive.
    """
    for item in clone_path.iterdir():
        if item.name == ".git":
            continue
        if item.is_dir() and not item.is_symlink():
            shutil.rmtree(item)
        else:
            item.unlink()

    for item in scaffolded_dir.iterdir():
        dest = clone_path / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)


def _commit(clone_path: Path, *, message: str) -> tuple[str, str]:
    """Stage everything and create one commit. Returns (sha, branch)."""
    from git import Repo  # imported lazily; same convention as PGS-01

    repo = Repo(str(clone_path))
    repo.git.add(A=True)
    if not repo.is_dirty(untracked_files=True) and not repo.index.diff("HEAD"):
        raise NothingToCommitError("Working tree is identical to HEAD; no commit was created.")
    commit = repo.index.commit(message)
    try:
        branch = repo.active_branch.name
    except (TypeError, ValueError):
        branch = commit.hexsha[:12]
    return commit.hexsha, branch


def _default_commit_message() -> str:
    return f"Sync from Bibliogon at {datetime.now(UTC).isoformat()}"


def _push(clone_path: Path, *, branch: str, book_id: str) -> None:
    """Push ``branch`` to ``origin``.

    Uses the per-book PAT (HTTPS) or SSH key when configured via
    :mod:`app.services.git_credentials`, else falls back to the user's
    ambient git credentials. Raises :class:`PushFailedError` with a
    stable ``.reason`` slug so the router can map it to a useful HTTP
    status without parsing git stderr in the UI.

    PAT injection uses a one-shot pushurl pattern: set the embedded
    URL, push, restore the original URL in a finally block. The
    embedded PAT never lands in ``.git/config``.
    """
    from git import GitCommandError, PushInfo, Repo

    repo = Repo(str(clone_path))
    if "origin" not in [r.name for r in repo.remotes]:
        raise PushFailedError("no_remote", "Repository has no 'origin' remote configured.")

    original_url = next(repo.remotes.origin.urls)
    auth_url = git_credentials.inject_pat_into_url(original_url, book_id)
    ssh_env = git_credentials.ssh_env(original_url)

    try:
        if auth_url != original_url:
            repo.remotes.origin.set_url(auth_url)
        if ssh_env:
            repo.git.update_environment(**ssh_env)
        try:
            info_list = repo.remotes.origin.push(refspec=f"{branch}:{branch}")
        except GitCommandError as exc:
            stderr = (exc.stderr or "").strip() or str(exc)
            reason = _classify_push_stderr(stderr)
            raise PushFailedError(reason, stderr) from exc
    finally:
        if auth_url != original_url:
            repo.remotes.origin.set_url(original_url)

    if not info_list:
        raise PushFailedError("network", "Push returned no information from the remote.")
    info = info_list[0]
    # GitPython exposes flag bits for each push result. Treat any
    # ERROR/REJECTED bit as a failure rather than letting it silently
    # become a "successful" no-op.
    if info.flags & PushInfo.ERROR:
        summary = (info.summary or "").strip() or "Push failed."
        if info.flags & (PushInfo.REJECTED | PushInfo.REMOTE_REJECTED):
            raise PushFailedError("rejected", summary)
        raise PushFailedError("network", summary)


def _classify_push_stderr(stderr: str) -> str:
    """Map a git stderr blob to one of the stable reason slugs."""
    s = stderr.lower()
    if "authentication" in s or "permission denied" in s or "could not read username" in s:
        return "auth"
    if "rejected" in s or "non-fast-forward" in s:
        return "rejected"
    if "could not resolve host" in s or "network" in s or "timed out" in s:
        return "network"
    return "unknown"
