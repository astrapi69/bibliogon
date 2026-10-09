"""#989: the per-book PAT must never be written into ``.git/config``.

The three remote operations - the git-sync push, the git-sync fetch and
the git-backup push/pull - used to authenticate by embedding the token
in the remote URL and calling ``Remote.set_url``, which is
``git remote set-url``: it rewrites ``.git/config`` on disk. The URL was
restored in a ``finally``, so the token was only there for the duration
of the transfer - but "only for the duration" still means anything that
reads the working copy in that window picks it up, and a crash, a kill
or a container stop between the write and the restore leaves it there
with nothing to notice.

Each operation here is probed at the moment git would go to the network:
the probe reads ``.git/config`` from disk and the environment the git
invocation is about to receive, then fails the transfer. The pair of
assertions is deliberate - the token must be absent from the file AND
present for the invocation, so a change that simply stopped
authenticating could not pass.
"""

from __future__ import annotations

from pathlib import Path

import git
import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Book, GitSyncMapping
from app.services.git import backup as git_backup
from app.services.git import credentials as git_credentials

PAT = "ghp_this_token_must_never_touch_disk"
REMOTE_URL = "https://github.com/astrapi69/not-a-real-repo.git"


@pytest.fixture(autouse=True)
def _isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(git_credentials, "GIT_CRED_DIR", tmp_path / "creds")
    monkeypatch.setenv("BIBLIOGON_CREDENTIALS_SECRET", "test-secret-989")
    yield


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _repo_with_https_origin(path: Path) -> git.Repo:
    """A repo with one commit and an https ``origin`` that cannot be reached."""
    path.mkdir(parents=True, exist_ok=True)
    repo = git.Repo.init(path)
    (path / "README.md").write_text("probe\n", encoding="utf-8")
    repo.git.add(A=True)
    repo.index.commit("probe")
    repo.create_remote("origin", REMOTE_URL)
    return repo


def _probe(monkeypatch: pytest.MonkeyPatch, clone: Path) -> dict[str, object]:
    """Capture the on-disk config and the git environment, then fail.

    Patches both ``Remote.push`` and ``Remote.fetch`` so the same probe
    serves every call site without reaching the network.
    """
    seen: dict[str, object] = {}

    def capture(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        seen["config"] = (clone / ".git" / "config").read_text(encoding="utf-8")
        seen["env"] = dict(self.repo.git._environment)
        seen["options"] = list(self.repo.git._persistent_git_options or [])
        raise git.GitCommandError(["git", "push"], 128, b"fatal: Authentication failed for probe")

    monkeypatch.setattr(git.remote.Remote, "push", capture)
    monkeypatch.setattr(git.remote.Remote, "fetch", capture)
    return seen


def _assert_token_off_disk_but_available(seen: dict[str, object]) -> None:
    assert seen, "the probe never ran - the operation did not reach a transfer"
    config = str(seen["config"])
    assert PAT not in config
    assert "x-access-token" not in config
    env = seen["env"]
    assert isinstance(env, dict)
    assert PAT in env.values(), "the token never reached the git invocation"
    assert PAT not in " ".join(str(o) for o in seen["options"] or [])


# --- the helper against the real git binary ---


def test_the_credential_helper_answers_git_itself() -> None:
    """Pin the helper string against git, not against a substring of it.

    ``credential fill`` is the same code path a transfer takes to obtain
    a username and password, so a quoting or printf regression in the
    helper fails here - which no assertion about the string's contents
    would catch.
    """
    import os
    import subprocess

    git_credentials.save_pat("book-real-git", PAT)
    auth = git_credentials.pat_git_config("https://example.com/x.git", "book-real-git")
    assert auth is not None
    options, env = auth
    command = ["git", *[part for option in options for part in ("-c", option)]]
    command += ["credential", "fill"]
    result = subprocess.run(  # noqa: S603 - fixed argv, no shell
        command,
        input="protocol=https\nhost=example.com\n\n",
        capture_output=True,
        text=True,
        env={**os.environ, **env},
        check=True,
    )
    assert f"username={git_credentials.PAT_USERNAME}" in result.stdout
    assert f"password={PAT}" in result.stdout


# --- git-sync push ---


def test_sync_push_keeps_the_pat_off_disk(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app.services.git.sync_commit import PushFailedError, _push

    clone = tmp_path / "clone"
    repo = _repo_with_https_origin(clone)
    git_credentials.save_pat("book-sync-push", PAT)
    seen = _probe(monkeypatch, clone)

    with pytest.raises(PushFailedError):
        _push(clone, branch=repo.active_branch.name, book_id="book-sync-push")

    _assert_token_off_disk_but_available(seen)
    assert PAT not in (clone / ".git" / "config").read_text(encoding="utf-8")


# --- git-sync fetch ---


def test_sync_fetch_keeps_the_pat_off_disk(
    db: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    from app.services.git.sync_diff import RemoteUnreachableError, fetch_remote_updates

    book = Book(title="PAT Fetch Book", author="Aster", language="de")
    db.add(book)
    db.commit()
    db.refresh(book)
    clone = tmp_path / "fetch-clone"
    repo = _repo_with_https_origin(clone)
    db.add(
        GitSyncMapping(
            book_id=book.id,
            repo_url=REMOTE_URL,
            branch=repo.active_branch.name,
            last_imported_commit_sha=repo.head.commit.hexsha,
            local_clone_path=str(clone),
        )
    )
    db.commit()
    git_credentials.save_pat(book.id, PAT)
    seen = _probe(monkeypatch, clone)

    try:
        with pytest.raises(RemoteUnreachableError):
            fetch_remote_updates(db, book_id=book.id)
        _assert_token_off_disk_but_available(seen)
    finally:
        db.query(GitSyncMapping).filter_by(book_id=book.id).delete()
        db.delete(book)
        db.commit()


# --- git-backup push + pull ---


def _backup_book(db: Session, tmp_path: Path) -> tuple[Book, Path]:
    book = Book(title="PAT Backup Book", author="Aster", language="de")
    db.add(book)
    db.commit()
    db.refresh(book)
    clone = git_backup.repo_path(book.id)
    _repo_with_https_origin(clone)
    (clone / git_backup.GIT_CONFIG_FILENAME).write_text(f"url: {REMOTE_URL}\n", encoding="utf-8")
    git_credentials.save_pat(book.id, PAT)
    return book, clone


@pytest.mark.parametrize("operation", ["push", "pull"])
def test_git_backup_keeps_the_pat_off_disk(
    operation: str, db: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    book, clone = _backup_book(db, tmp_path)
    seen = _probe(monkeypatch, clone)
    try:
        with pytest.raises(Exception):
            getattr(git_backup, operation)(book.id, db)
        _assert_token_off_disk_but_available(seen)
    finally:
        db.delete(book)
        db.commit()
