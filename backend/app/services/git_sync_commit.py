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
- **Async push deferred.** The service supports an inline ``push``
  flag; the actual remote-push wiring (PAT injection, host-key
  checks) is shared with :mod:`app.services.git_backup` in a
  follow-up. For now, push raises :class:`NotImplementedError`
  if requested.
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

logger = logging.getLogger(__name__)


class GitSyncCommitError(Exception):
    """Base class for commit-to-repo failures."""


class MappingNotFoundError(GitSyncCommitError):
    """No GitSyncMapping row for this book - was it imported via plugin-git-sync?"""


class CloneMissingError(GitSyncCommitError):
    """The mapped clone path no longer exists on disk."""


class NothingToCommitError(GitSyncCommitError):
    """Working tree had no changes after re-scaffolding."""


class PushNotImplementedError(GitSyncCommitError):
    """Push wiring is a follow-up; rejected for now."""


def commit_to_repo(
    db: Session,
    *,
    book_id: str,
    message: str | None = None,
    push: bool = False,
) -> dict[str, str | bool]:
    """Re-scaffold the book and create one commit on the local clone.

    Returns ``{"commit_sha", "branch", "pushed"}``.
    Raises subclasses of :class:`GitSyncCommitError` on failure.
    """
    if push:
        raise PushNotImplementedError(
            "Push to remote is not yet wired. Use git from the clone directly until PGS-02 part 2."
        )

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

    mapping.last_committed_at = datetime.now(UTC)
    db.add(mapping)
    db.commit()

    return {"commit_sha": commit_sha, "branch": branch, "pushed": False}


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
