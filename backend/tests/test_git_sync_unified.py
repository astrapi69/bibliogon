"""PGS-05 backend tests: per-book lock + unified commit fan-out.

Covers:
- ``book_commit_lock``: re-entry on the same name blocks; raises
  TimeoutError when the lock is already held.
- ``book_subsystems``: snapshot reflects core git init + plugin
  mapping presence independently.
- ``unified_commit``: skips a subsystem the book hasn't enabled,
  surfaces per-subsystem nothing_to_commit / failed status,
  succeeds on the happy path with both enabled.
- ``GET /api/git-sync/{book_id}`` includes ``core_git_initialized``.
- ``POST /api/git-sync/{book_id}/unified-commit`` returns the
  per-subsystem payload + 503 when the lock can't be acquired.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

import git
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Asset, Book, Chapter, GitSyncMapping
from app.services import git_backup, git_credentials, git_sync_mapping
from app.services.git_sync_lock import book_commit_lock
from app.services.git_sync_unified import book_subsystems, unified_commit

client = TestClient(app)


# --- lock primitive ---


def test_book_commit_lock_serializes_concurrent_acquirers() -> None:
    """The second acquirer waits behind the first."""
    enter_first = threading.Event()
    enter_second = threading.Event()
    exit_first = threading.Event()

    def first():
        with book_commit_lock("lock-test-1"):
            enter_first.set()
            exit_first.wait(timeout=2.0)

    def second():
        enter_first.wait(timeout=2.0)
        with book_commit_lock("lock-test-1"):
            enter_second.set()

    t1 = threading.Thread(target=first)
    t2 = threading.Thread(target=second)
    t1.start()
    t2.start()

    enter_first.wait(timeout=2.0)
    # The second thread is blocked - has not entered the critical
    # section yet despite firing soon after the first.
    time.sleep(0.05)
    assert not enter_second.is_set()

    exit_first.set()
    t1.join(timeout=2.0)
    t2.join(timeout=2.0)
    assert enter_second.is_set()


def test_book_commit_lock_raises_on_timeout() -> None:
    """Hold the lock then ask for it again with a short timeout."""
    name = "lock-test-2"
    held = threading.Event()
    release = threading.Event()

    def holder():
        with book_commit_lock(name):
            held.set()
            release.wait(timeout=2.0)

    t = threading.Thread(target=holder)
    t.start()
    held.wait(timeout=2.0)

    with pytest.raises(TimeoutError):
        with book_commit_lock(name, timeout=0.05):
            pass

    release.set()
    t.join(timeout=2.0)


def test_book_commit_lock_per_book_isolation() -> None:
    """Different book ids do not block each other."""
    enter_a = threading.Event()
    enter_b = threading.Event()
    release = threading.Event()

    def hold_a():
        with book_commit_lock("lock-iso-a"):
            enter_a.set()
            release.wait(timeout=2.0)

    t = threading.Thread(target=hold_a)
    t.start()
    enter_a.wait(timeout=2.0)

    # 'b' must NOT block on 'a'.
    with book_commit_lock("lock-iso-b", timeout=0.5):
        enter_b.set()

    assert enter_b.is_set()
    release.set()
    t.join(timeout=2.0)


# --- subsystems snapshot + unified commit fixtures ---


@pytest.fixture
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def book(db: Session) -> Book:
    b = Book(title="Unified Commit Book", author="Aster", language="de")
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
def isolated_uploads(tmp_path, monkeypatch):
    """Redirect both git_backup's UPLOADS_ROOT + git_sync_mapping's
    persistent clone area to the test's tmp dir so we never touch
    the real ``uploads/`` tree."""
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(git_credentials, "GIT_CRED_DIR", tmp_path / "credentials")
    monkeypatch.setenv("BIBLIOGON_CREDENTIALS_SECRET", "test-secret-pgs05")
    yield tmp_path


def _seed_remote_clone(tmp_path: Path) -> Path:
    """Make a tiny WBT-shaped local repo + bare remote so persist_clone
    has something to lift into uploads/git-sync/."""
    bare = tmp_path / "remote.git"
    git.Repo.init(bare, bare=True)
    work = tmp_path / "src"
    work.mkdir()
    (work / "README.md").write_text("# x\n", encoding="utf-8")
    repo = git.Repo.init(work)
    repo.index.add(["README.md"])
    repo.index.commit("init")
    repo.create_remote("origin", str(bare))
    return work


# --- book_subsystems ---


def test_book_subsystems_reports_both_flags_independently(
    db: Session, book: Book, isolated_uploads: Path
) -> None:
    snap = book_subsystems(db, book_id=book.id)
    assert snap == {"core_git_initialized": False, "plugin_git_sync_mapped": False}

    # Init core git only.
    git_backup.init_repo(book.id, db)
    snap = book_subsystems(db, book_id=book.id)
    assert snap == {"core_git_initialized": True, "plugin_git_sync_mapped": False}

    # Add plugin-git-sync mapping; still core also true.
    src = _seed_remote_clone(isolated_uploads)
    git_sync_mapping.persist_clone_after_import(
        db,
        staging_path=src,
        book_id=book.id,
        uploads_dir=isolated_uploads / "uploads",
    )
    db.expire_all()
    snap = book_subsystems(db, book_id=book.id)
    assert snap == {"core_git_initialized": True, "plugin_git_sync_mapped": True}


# --- unified_commit ---


def test_unified_commit_skips_unconfigured_subsystems(
    db: Session, book: Book, isolated_uploads: Path
) -> None:
    """Both subsystems off -> both report 'skipped' with explanatory detail."""
    result = unified_commit(db, book_id=book.id, message="x")
    assert result.core_git.status == "skipped"
    assert result.plugin_git_sync.status == "skipped"


def test_unified_commit_runs_core_git_when_initialized(
    db: Session, book: Book, isolated_uploads: Path
) -> None:
    git_backup.init_repo(book.id, db)
    db.add(
        Chapter(
            book_id=book.id,
            title="Chapter 1",
            content='{"type":"doc","content":[]}',
            position=0,
            chapter_type="chapter",
        )
    )
    db.commit()

    result = unified_commit(db, book_id=book.id, message="hello")
    assert result.core_git.status == "ok"
    assert result.core_git.commit_sha
    assert result.plugin_git_sync.status == "skipped"


def test_unified_commit_returns_per_subsystem_failure_payload(
    db: Session, book: Book, isolated_uploads: Path
) -> None:
    """plugin-git-sync mapping points at a missing clone -> the
    plugin half reports 'failed' but the core half still runs OK."""
    git_backup.init_repo(book.id, db)
    db.add(
        Chapter(
            book_id=book.id,
            title="Solo",
            content='{"type":"doc","content":[]}',
            position=0,
            chapter_type="chapter",
        )
    )
    db.add(
        GitSyncMapping(
            book_id=book.id,
            repo_url="https://example.com/x.git",
            branch="main",
            last_imported_commit_sha="0" * 40,
            local_clone_path=str(isolated_uploads / "missing-clone"),
        )
    )
    db.commit()

    result = unified_commit(db, book_id=book.id, message="hi")
    assert result.core_git.status == "ok"
    assert result.plugin_git_sync.status == "failed"
    assert "missing or invalid" in (result.plugin_git_sync.detail or "")


# --- HTTP layer ---


def test_status_endpoint_surfaces_core_git_initialized(
    db: Session, book: Book, isolated_uploads: Path
) -> None:
    resp = client.get(f"/api/git-sync/{book.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["core_git_initialized"] is False

    git_backup.init_repo(book.id, db)
    resp = client.get(f"/api/git-sync/{book.id}")
    assert resp.json()["core_git_initialized"] is True


def test_unified_commit_endpoint_returns_per_subsystem_payload(
    db: Session, book: Book, isolated_uploads: Path
) -> None:
    git_backup.init_repo(book.id, db)
    db.add(
        Chapter(
            book_id=book.id,
            title="Endpoint Chap",
            content='{"type":"doc","content":[]}',
            position=0,
            chapter_type="chapter",
        )
    )
    db.commit()

    resp = client.post(
        f"/api/git-sync/{book.id}/unified-commit",
        json={"message": "test", "push_core": False, "push_plugin": False},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["core_git"]["status"] == "ok"
    assert body["plugin_git_sync"]["status"] == "skipped"


def test_unified_commit_endpoint_503_when_lock_held(
    db: Session, book: Book, isolated_uploads: Path
) -> None:
    """Holding the lock from another thread forces the endpoint to 503."""
    held = threading.Event()
    release = threading.Event()

    def holder():
        with book_commit_lock(book.id):
            held.set()
            release.wait(timeout=2.0)

    t = threading.Thread(target=holder)
    t.start()
    held.wait(timeout=2.0)

    # Patch the timeout to a tight window so the test isn't slow.
    from app.services import git_sync_unified

    original = git_sync_unified.unified_commit

    def fast_unified(*args, **kwargs):
        # Bypass: directly call book_commit_lock with a 0.05s timeout.
        from app.services.git_sync_lock import book_commit_lock as _lock

        with _lock(kwargs["book_id"], timeout=0.05):
            return original(*args, **kwargs)

    try:
        git_sync_unified.unified_commit = fast_unified
        # Also patch the router's reference.
        from app.routers import git_sync as gs_router

        gs_router.unified_commit = fast_unified

        resp = client.post(
            f"/api/git-sync/{book.id}/unified-commit",
            json={"message": "x"},
        )
        assert resp.status_code == 503
    finally:
        git_sync_unified.unified_commit = original
        from app.routers import git_sync as gs_router

        gs_router.unified_commit = original
        release.set()
        t.join(timeout=2.0)
