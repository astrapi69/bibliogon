"""Tests for the git-sync remote-fetch step (#379).

These exercise the real ``git fetch`` path that the diff/resolve flow
was missing: a chapter pushed to the *remote* must be detected after a
fetch, not only when it is committed directly into the persisted clone
(which is how the older diff tests simulated "remote progress" - a
coverage illusion that hid the no-fetch bug in production).

Each test builds a bare remote, an initial clone persisted as the
book's GitSyncMapping, then pushes new commits to the bare remote from
a separate clone to model "the user pushed to GitHub".
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import git
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Asset, Book, Chapter, GitSyncMapping
from app.services import git_credentials, git_sync_mapping
from app.services.git_sync_diff import (
    RemoteUnreachableError,
    diff_book,
    fetch_remote_updates,
)

client = TestClient(app)


@pytest.fixture
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def book(db: Session) -> Book:
    b = Book(title="PGS Fetch Book", author="Aster", language="de")
    db.add(b)
    db.commit()
    db.refresh(b)
    yield b
    db.query(GitSyncMapping).filter_by(book_id=b.id).delete()
    db.query(Asset).filter_by(book_id=b.id).delete()
    db.query(Chapter).filter_by(book_id=b.id).delete()
    db.delete(b)
    db.commit()


def _write_wbt_chapter(repo_root: Path, section: str, filename: str, body: str) -> None:
    target = repo_root / "manuscript" / section
    target.mkdir(parents=True, exist_ok=True)
    (target / filename).write_text(body, encoding="utf-8")


def _commit_all(repo: git.Repo, message: str) -> str:
    repo.git.add(A=True)
    return repo.index.commit(message).hexsha


def _tiptap_paragraph(text: str) -> str:
    return json.dumps(
        {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
        }
    )


def _setup_synced_book(db: Session, book: Book, tmp_path: Path) -> tuple[Path, str]:
    """Create a bare remote + an initial pushed clone, persisted as the
    book's mapping with a single base chapter mirrored into the DB.

    Returns ``(bare_path, branch)``.
    """
    bare = tmp_path / "remote.git"
    git.Repo.init(bare, bare=True)

    work = tmp_path / "work"
    work.mkdir()
    repo = git.Repo.init(work)
    repo.create_remote("origin", str(bare))
    _write_wbt_chapter(work, "chapters", "01-alpha.md", "# Alpha\n\nbase alpha\n")
    _commit_all(repo, "base import")
    branch = repo.active_branch.name
    repo.git.push("origin", branch)

    uploads = tmp_path / "uploads"
    uploads.mkdir()
    git_sync_mapping.persist_clone_after_import(
        db, staging_path=work, book_id=book.id, uploads_dir=uploads
    )
    db.expire_all()
    mapping = db.get(GitSyncMapping, book.id)
    mapping.branch = branch
    db.add(
        Chapter(
            book_id=book.id,
            title="Alpha",
            chapter_type="chapter",
            position=0,
            content=_tiptap_paragraph("base alpha"),
        )
    )
    db.commit()
    db.expire_all()
    return bare, branch


def _push_to_remote(
    bare: Path, tmp_path: Path, branch: str, files: list[tuple[str, str, str]]
) -> None:
    """Clone the bare remote, write/overwrite the given chapter files,
    commit and push - modelling the user pushing new work to GitHub.
    """
    pusher = tmp_path / f"pusher-{len(list(tmp_path.iterdir()))}"
    repo = git.Repo.clone_from(str(bare), str(pusher))
    for section, filename, body in files:
        _write_wbt_chapter(pusher, section, filename, body)
    _commit_all(repo, "remote push")
    repo.git.push("origin", branch)


def test_fetch_detects_a_new_remote_chapter(db: Session, book: Book, tmp_path: Path) -> None:
    """Reproduction: a new .md pushed to the remote must be classified
    as ``remote_added`` after the fetch step (was invisible before)."""
    bare, branch = _setup_synced_book(db, book, tmp_path)

    # Sanity: without fetching, the stale clone sees no new chapter.
    pre = {d.identity.slug: d.classification for d in diff_book(db, book_id=book.id)}
    assert "bravo" not in pre

    _push_to_remote(bare, tmp_path, branch, [("chapters", "02-bravo.md", "# Bravo\n\nnew bravo\n")])

    advanced = fetch_remote_updates(db, book_id=book.id)
    assert advanced is True

    diffs = {d.identity.slug: d.classification for d in diff_book(db, book_id=book.id)}
    assert diffs.get("bravo") == "remote_added"


def test_fetch_detects_changed_and_new_chapters_together(
    db: Session, book: Book, tmp_path: Path
) -> None:
    """Happy path: a changed existing file + a brand-new file are both
    detected after the fetch."""
    bare, branch = _setup_synced_book(db, book, tmp_path)
    _push_to_remote(
        bare,
        tmp_path,
        branch,
        [
            ("chapters", "01-alpha.md", "# Alpha\n\nremote alpha changed\n"),
            ("chapters", "02-bravo.md", "# Bravo\n\nnew bravo\n"),
        ],
    )

    fetch_remote_updates(db, book_id=book.id)

    diffs = {d.identity.slug: d.classification for d in diff_book(db, book_id=book.id)}
    assert diffs.get("alpha") == "remote_changed"
    assert diffs.get("bravo") == "remote_added"


def test_fetch_no_changes_returns_false_and_diff_is_clean(
    db: Session, book: Book, tmp_path: Path
) -> None:
    """Edge: nothing pushed -> fetch reports no advance and the diff has
    no actionable remote entries ("alles aktuell")."""
    _setup_synced_book(db, book, tmp_path)

    advanced = fetch_remote_updates(db, book_id=book.id)
    assert advanced is False

    classifications = {d.classification for d in diff_book(db, book_id=book.id)}
    assert "remote_added" not in classifications
    assert "remote_changed" not in classifications


def test_fetch_public_repo_without_credentials(db: Session, book: Book, tmp_path: Path) -> None:
    """Edge: a public repo (no PAT configured) must fetch successfully -
    the missing-HTTPS-token case is not a blocker for read access."""
    bare, branch = _setup_synced_book(db, book, tmp_path)
    # No credentials are stored for this book.
    assert git_credentials.has_pat(book.id) is False
    assert git_credentials.load_pat(book.id) is None

    _push_to_remote(bare, tmp_path, branch, [("chapters", "02-bravo.md", "# Bravo\n\nnew bravo\n")])

    # Must not raise despite no credentials being set.
    advanced = fetch_remote_updates(db, book_id=book.id)
    assert advanced is True
    diffs = {d.identity.slug: d.classification for d in diff_book(db, book_id=book.id)}
    assert diffs.get("bravo") == "remote_added"


def test_fetch_unreachable_remote_raises(db: Session, book: Book, tmp_path: Path) -> None:
    """Edge: an unreachable remote raises RemoteUnreachableError (service
    layer) and surfaces as a 502 with a remote_unreachable code at the
    /diff endpoint."""
    bare, _branch = _setup_synced_book(db, book, tmp_path)
    # Remove the remote entirely so the fetch can't reach it.
    shutil.rmtree(bare)

    with pytest.raises(RemoteUnreachableError):
        fetch_remote_updates(db, book_id=book.id)

    resp = client.post(f"/api/git-sync/{book.id}/diff")
    assert resp.status_code == 502
    body = resp.json()
    assert body["detail"]["code"] == "remote_unreachable"
