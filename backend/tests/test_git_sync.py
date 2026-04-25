"""PGS-02 backend tests: GitSyncMapping persistence + commit-to-repo.

Covers:
- ``persist_clone_after_import`` writes a mapping when staging
  has a ``.git`` and is a no-op otherwise.
- ``GET /api/git-sync/{book_id}`` returns ``mapped=False`` for
  un-mapped books and the full snapshot for mapped ones.
- ``POST /api/git-sync/{book_id}/commit`` happy path: rewrites
  working tree, creates one commit, advances HEAD, sets
  ``last_committed_at``, returns the new sha.
- ``commit`` error paths: missing mapping (404), missing clone
  (410), no changes (409), push (501).

The tests build a *real* throwaway git repo in tmp so the
GitPython integration is exercised end-to-end. No mocking of
``git`` itself.
"""

from __future__ import annotations

from pathlib import Path

import git
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Asset, Book, Chapter, GitSyncMapping
from app.services import git_sync_mapping
from app.services.git_sync_commit import commit_to_repo

client = TestClient(app)


# --- fixtures ---


@pytest.fixture
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def book(db: Session) -> Book:
    b = Book(
        title="PGS Test Book",
        author="Aster",
        language="de",
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    yield b
    db.query(GitSyncMapping).filter_by(book_id=b.id).delete()
    db.query(Asset).filter_by(book_id=b.id).delete()
    db.query(Chapter).filter_by(book_id=b.id).delete()
    db.delete(b)
    db.commit()


@pytest.fixture
def repo_clone(tmp_path: Path) -> Path:
    """A fully-formed local git repo with a WBT-shaped commit.

    Acts as the "previously-imported" clone that PGS-02 commits
    back into. Includes a remote pointing to a bare repo also in
    tmp so the URL is real.
    """
    bare = tmp_path / "remote.git"
    git.Repo.init(bare, bare=True)

    work = tmp_path / "work"
    work.mkdir()
    (work / "README.md").write_text("# initial\n", encoding="utf-8")
    repo = git.Repo.init(work)
    repo.index.add(["README.md"])
    repo.index.commit("initial")
    repo.create_remote("origin", str(bare))
    return work


# --- persist_clone_after_import ---


def test_persist_clone_writes_mapping_when_git_dir_present(
    db: Session,
    book: Book,
    repo_clone: Path,
    tmp_path: Path,
) -> None:
    uploads = tmp_path / "uploads"
    uploads.mkdir()

    git_sync_mapping.persist_clone_after_import(
        db,
        staging_path=repo_clone,
        book_id=book.id,
        uploads_dir=uploads,
    )

    mapping = db.get(GitSyncMapping, book.id)
    assert mapping is not None
    assert mapping.repo_url.endswith("remote.git")
    assert mapping.branch in ("main", "master")
    assert len(mapping.last_imported_commit_sha) == 40
    assert Path(mapping.local_clone_path).is_dir()
    assert (Path(mapping.local_clone_path) / ".git").is_dir()


def test_persist_clone_noop_when_no_git_dir(
    db: Session,
    book: Book,
    tmp_path: Path,
) -> None:
    plain = tmp_path / "plain"
    plain.mkdir()
    (plain / "manuscript.md").write_text("hi", encoding="utf-8")

    git_sync_mapping.persist_clone_after_import(
        db,
        staging_path=plain,
        book_id=book.id,
        uploads_dir=tmp_path / "uploads",
    )

    assert db.get(GitSyncMapping, book.id) is None


# --- GET /api/git-sync/{book_id} ---


def test_status_unmapped_book(book: Book) -> None:
    resp = client.get(f"/api/git-sync/{book.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["mapped"] is False
    assert body["repo_url"] is None


def test_status_mapped_book(
    db: Session,
    book: Book,
    repo_clone: Path,
    tmp_path: Path,
) -> None:
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    git_sync_mapping.persist_clone_after_import(
        db,
        staging_path=repo_clone,
        book_id=book.id,
        uploads_dir=uploads,
    )
    db.expire_all()

    resp = client.get(f"/api/git-sync/{book.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["mapped"] is True
    assert body["dirty"] is False
    assert body["branch"] in ("main", "master")
    assert body["last_imported_commit_sha"]
    assert body["local_clone_path"]


# --- POST /api/git-sync/{book_id}/commit ---


def test_commit_happy_path(
    db: Session,
    book: Book,
    repo_clone: Path,
    tmp_path: Path,
) -> None:
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    git_sync_mapping.persist_clone_after_import(
        db,
        staging_path=repo_clone,
        book_id=book.id,
        uploads_dir=uploads,
    )
    db.expire_all()
    mapping = db.get(GitSyncMapping, book.id)
    persisted = Path(mapping.local_clone_path)
    repo = git.Repo(str(persisted))
    head_before = repo.head.commit.hexsha

    db.add(
        Chapter(
            book_id=book.id,
            title="Chapter 1",
            content='{"type":"doc","content":[{"type":"paragraph",'
            '"content":[{"type":"text","text":"hello"}]}]}',
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    resp = client.post(f"/api/git-sync/{book.id}/commit", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["pushed"] is False
    assert len(body["commit_sha"]) == 40
    assert body["commit_sha"] != head_before

    # The new commit advanced HEAD on the persisted clone.
    repo = git.Repo(str(persisted))
    assert repo.head.commit.hexsha == body["commit_sha"]

    # Chapter file landed in the clone.
    chapter_files = list((persisted / "manuscript" / "chapters").glob("*.md"))
    assert chapter_files, "expected chapter file to be scaffolded into clone"

    # last_committed_at was bumped.
    db.expire_all()
    mapping = db.get(GitSyncMapping, book.id)
    assert mapping.last_committed_at is not None


def test_commit_404_on_unmapped_book(book: Book) -> None:
    resp = client.post(f"/api/git-sync/{book.id}/commit", json={})
    assert resp.status_code == 404


def test_commit_410_when_clone_missing(
    db: Session,
    book: Book,
    tmp_path: Path,
) -> None:
    db.add(
        GitSyncMapping(
            book_id=book.id,
            repo_url="https://example.com/repo.git",
            branch="main",
            last_imported_commit_sha="0" * 40,
            local_clone_path=str(tmp_path / "does-not-exist"),
        )
    )
    db.commit()

    resp = client.post(f"/api/git-sync/{book.id}/commit", json={})
    assert resp.status_code == 410


def test_commit_409_on_no_changes(
    db: Session,
    book: Book,
    repo_clone: Path,
    tmp_path: Path,
) -> None:
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    git_sync_mapping.persist_clone_after_import(
        db,
        staging_path=repo_clone,
        book_id=book.id,
        uploads_dir=uploads,
    )
    db.expire_all()

    # First commit succeeds.
    r1 = client.post(f"/api/git-sync/{book.id}/commit", json={})
    assert r1.status_code == 200

    # Second commit with no DB changes -> 409.
    r2 = client.post(f"/api/git-sync/{book.id}/commit", json={})
    assert r2.status_code == 409


def test_commit_with_push_succeeds_against_local_bare_remote(
    db: Session,
    book: Book,
    repo_clone: Path,
    tmp_path: Path,
) -> None:
    """End-to-end push against the bare remote that ``repo_clone``
    fixture set up. No PAT, no SSH - the bare repo is local-fs so
    GitPython pushes through the file:// transport.
    """
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    git_sync_mapping.persist_clone_after_import(
        db,
        staging_path=repo_clone,
        book_id=book.id,
        uploads_dir=uploads,
    )
    db.expire_all()

    db.add(
        Chapter(
            book_id=book.id,
            title="Push Me",
            content='{"type":"doc","content":[]}',
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    resp = client.post(f"/api/git-sync/{book.id}/commit", json={"push": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["pushed"] is True


def test_commit_with_push_returns_409_on_no_remote(
    db: Session,
    book: Book,
    tmp_path: Path,
) -> None:
    """A clone without an ``origin`` remote yields PushFailedError
    with reason='no_remote' -> mapped to 409."""
    work = tmp_path / "no-remote-work"
    work.mkdir()
    (work / "README.md").write_text("# x\n", encoding="utf-8")
    repo = git.Repo.init(work)
    repo.index.add(["README.md"])
    repo.index.commit("initial")

    uploads = tmp_path / "uploads"
    uploads.mkdir()
    git_sync_mapping.persist_clone_after_import(
        db,
        staging_path=work,
        book_id=book.id,
        uploads_dir=uploads,
    )
    db.expire_all()

    db.add(
        Chapter(
            book_id=book.id,
            title="x",
            content='{"type":"doc","content":[]}',
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    resp = client.post(f"/api/git-sync/{book.id}/commit", json={"push": True})
    assert resp.status_code == 409
    body = resp.json()
    assert body["detail"]["reason"] == "no_remote"


# --- service direct call (bypasses HTTP) ---


def test_commit_to_repo_service_direct(
    db: Session,
    book: Book,
    repo_clone: Path,
    tmp_path: Path,
) -> None:
    """Direct service call mirrors the HTTP path; useful for catch-all
    coverage of the service surface from non-HTTP callers (tests, future
    background jobs).
    """
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    git_sync_mapping.persist_clone_after_import(
        db,
        staging_path=repo_clone,
        book_id=book.id,
        uploads_dir=uploads,
    )
    db.expire_all()

    db.add(
        Chapter(
            book_id=book.id,
            title="Direct Call",
            content='{"type":"doc","content":[]}',
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    result = commit_to_repo(db, book_id=book.id, message="custom msg")
    assert result["pushed"] is False
    assert len(result["commit_sha"]) == 40

    persisted = Path(db.get(GitSyncMapping, book.id).local_clone_path)
    repo = git.Repo(str(persisted))
    assert repo.head.commit.message.strip() == "custom msg"
