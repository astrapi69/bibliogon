"""GH#16: WBT ZIP / folder import iterates ``main`` + ``main-XX``
branches when the user opted into git adoption.

Covers:

- Multi-branch fixture (``main`` + ``main-de``) imports as two Books
  with one shared ``translation_group_id``.
- ``adopt_with_remote`` keeps the per-book clone's ``origin``;
  ``adopt_without_remote`` strips it (best-effort).
- Single-branch fixture falls through to the existing single-Book
  path with no ``translation_group_id`` mutation.
- ``start_fresh`` git_adoption skips multi-branch detection even
  when the .git/ has multiple matching branches.
- No ``.git/`` (legacy WBT ZIP) keeps the single-branch path.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.handlers.wbt import WbtImportHandler
from app.models import Book, GitSyncMapping


# --- fixtures ---


def _git(repo_dir: Path, *args: str) -> str:
    """Run a git CLI command in ``repo_dir``. Avoids GitPython's
    occasional config-write quirks in test env."""
    result = subprocess.run(
        ["git", *args],
        cwd=str(repo_dir),
        check=True,
        capture_output=True,
        text=True,
        env={
            "GIT_AUTHOR_NAME": "Test",
            "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "Test",
            "GIT_COMMITTER_EMAIL": "test@example.com",
            "PATH": "/usr/bin:/bin",
            "HOME": str(repo_dir),
            "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_CONFIG_SYSTEM": "/dev/null",
        },
    )
    return result.stdout


def _write_wbt(project_root: Path, *, title: str, lang: str, body: str) -> None:
    (project_root / "config").mkdir(parents=True, exist_ok=True)
    (project_root / "manuscript" / "chapters").mkdir(parents=True, exist_ok=True)
    (project_root / "config" / "metadata.yaml").write_text(
        f"title: {title}\nauthor: Test Author\nlang: {lang}\n",
        encoding="utf-8",
    )
    (project_root / "manuscript" / "chapters" / "01-ch.md").write_text(
        f"# Chapter 1\n\n{body}\n", encoding="utf-8"
    )


def _multi_branch_repo(tmp_path: Path) -> Path:
    """Build a directory containing a real ``.git/`` with ``main`` +
    ``main-de`` branches, each carrying its own metadata.yaml /
    chapter content. Returns the project root path. Uses the git
    CLI so the .git state matches what a real WBT repo looks like.
    """
    repo = tmp_path / "wbt-multi"
    repo.mkdir()
    _git(repo, "init", "-b", "main")

    _write_wbt(repo, title="English Book", lang="en", body="Hello")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "main")

    _git(repo, "checkout", "-b", "main-de")
    _write_wbt(repo, title="Deutsches Buch", lang="de", body="Hallo")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "main-de")

    _git(repo, "checkout", "main")
    return repo


def _single_branch_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "wbt-single"
    repo.mkdir()
    _git(repo, "init", "-b", "main")
    _write_wbt(repo, title="Solo Book", lang="en", body="Solo")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "single")
    return repo


def _zip_no_git(tmp_path: Path) -> Path:
    """Plain WBT directory with NO .git/ to confirm legacy ZIP
    imports still flow through the single-branch path."""
    repo = tmp_path / "wbt-no-git"
    repo.mkdir()
    _write_wbt(repo, title="Legacy Book", lang="en", body="Legacy")
    return repo


# --- helpers ---


def _execute_with_adoption(project_root: Path, adoption: str | None) -> str:
    """Run handler.execute against a directory project root with the
    given git_adoption choice. Returns the primary book ID."""
    handler = WbtImportHandler()
    detected = handler.detect(str(project_root))
    return handler.execute(
        str(project_root),
        detected,
        overrides={},
        duplicate_action="create",
        git_adoption=adoption,
    )


def _cleanup_books(book_ids: list[str], session: Session) -> None:
    for bid in book_ids:
        for mapping in session.query(GitSyncMapping).filter(GitSyncMapping.book_id == bid).all():
            if mapping.local_clone_path:
                shutil.rmtree(mapping.local_clone_path, ignore_errors=True)
            session.delete(mapping)
        book = session.get(Book, bid)
        if book is not None:
            session.delete(book)
    session.commit()


# --- tests ---


def test_multi_branch_import_creates_one_book_per_branch(tmp_path: Path) -> None:
    project_root = _multi_branch_repo(tmp_path)
    primary_id = _execute_with_adoption(project_root, "adopt_with_remote")

    session = SessionLocal()
    try:
        primary = session.get(Book, primary_id)
        assert primary is not None
        assert primary.translation_group_id is not None

        # Sibling on translation_group_id, not by row count - the test
        # DB persists across cases, so rely on the group id.
        siblings = (
            session.query(Book)
            .filter(Book.translation_group_id == primary.translation_group_id)
            .all()
        )
        assert len(siblings) == 2
        languages = sorted(b.language for b in siblings if b.language)
        assert languages == ["de", "en"]

        # Each book got its own GitSyncMapping with the source branch.
        for sibling in siblings:
            mapping = (
                session.query(GitSyncMapping).filter(GitSyncMapping.book_id == sibling.id).one()
            )
            expected_branch = "main" if sibling.language == "en" else "main-de"
            assert mapping.branch == expected_branch

        # Primary returned by execute is the HEAD branch (=> main =>
        # the en book) so the orchestrator's single-ID contract picks
        # the language the user originally checked out.
        assert primary.language == "en"

        _cleanup_books([s.id for s in siblings], session)
    finally:
        session.close()


def test_multi_branch_adopt_without_remote_strips_origin(tmp_path: Path) -> None:
    project_root = _multi_branch_repo(tmp_path)
    primary_id = _execute_with_adoption(project_root, "adopt_without_remote")

    session = SessionLocal()
    try:
        primary = session.get(Book, primary_id)
        assert primary is not None
        siblings = (
            session.query(Book)
            .filter(Book.translation_group_id == primary.translation_group_id)
            .all()
        )

        for sibling in siblings:
            mapping = (
                session.query(GitSyncMapping).filter(GitSyncMapping.book_id == sibling.id).one()
            )
            # adopt_without_remote: GitSyncMapping.repo_url cleared
            # so the wizard's "no remote" choice is reflected in the
            # mapping snapshot.
            assert mapping.repo_url == ""

        _cleanup_books([s.id for s in siblings], session)
    finally:
        session.close()


def test_single_branch_repo_uses_single_path(tmp_path: Path) -> None:
    project_root = _single_branch_repo(tmp_path)
    book_id = _execute_with_adoption(project_root, "adopt_with_remote")

    session = SessionLocal()
    try:
        book = session.get(Book, book_id)
        assert book is not None
        # Single-branch path: no translation_group_id assignment.
        assert book.translation_group_id is None

        _cleanup_books([book_id], session)
    finally:
        session.close()


def test_start_fresh_skips_multi_branch_path(tmp_path: Path) -> None:
    """Even when the repo has multiple branches, ``start_fresh`` is
    the user's explicit "I do not want any git" choice. Multi-branch
    must NOT trigger; only the working-tree branch imports."""
    project_root = _multi_branch_repo(tmp_path)
    book_id = _execute_with_adoption(project_root, "start_fresh")

    session = SessionLocal()
    try:
        book = session.get(Book, book_id)
        assert book is not None
        assert book.translation_group_id is None
        # Confirm no GitSyncMapping was created.
        mapping_count = (
            session.query(GitSyncMapping).filter(GitSyncMapping.book_id == book.id).count()
        )
        assert mapping_count == 0

        _cleanup_books([book_id], session)
    finally:
        session.close()


def test_no_git_dir_uses_single_path(tmp_path: Path) -> None:
    """Legacy WBT ZIP without .git/: even with git_adoption set, the
    multi-branch path is a no-op (no .git/, nothing to enumerate),
    and execute falls through to the single-Book import."""
    project_root = _zip_no_git(tmp_path)
    book_id = _execute_with_adoption(project_root, "adopt_with_remote")

    session = SessionLocal()
    try:
        book = session.get(Book, book_id)
        assert book is not None
        assert book.translation_group_id is None
        _cleanup_books([book_id], session)
    finally:
        session.close()
