"""Translation-group import must be idempotent (#762).

The multi-branch path (``import_translation_group`` via the WBT
handler) creates one Book per translation branch but registered NO
``BookImportSource`` rows, so nothing recognised an already-imported
branch. Re-running the same import created the whole group a second
time - observed live on 2026-09-11, where 41 catalog entries produced
112 books because each branch entry re-imported its entire group.

These tests pin the contract at the service layer: the same repo
imported twice yields the same books, and each branch-book carries a
branch-aware source identifier so the duplicate check can see it.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from app.database import SessionLocal
from app.models import Book, BookImportSource, GitSyncMapping
from app.services.translation_import import (
    git_source_identifier,
    import_translation_group,
)


def _git(repo_dir: Path, *args: str) -> None:
    subprocess.run(
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


def _write_wbt(root: Path, *, title: str, lang: str) -> None:
    (root / "config").mkdir(parents=True, exist_ok=True)
    (root / "manuscript" / "chapters").mkdir(parents=True, exist_ok=True)
    (root / "config" / "metadata.yaml").write_text(
        f"title: {title}\nauthor: Test Author\nlang: {lang}\n", encoding="utf-8"
    )
    (root / "manuscript" / "chapters" / "01-ch.md").write_text(
        f"# Chapter\n\n{title}\n", encoding="utf-8"
    )


def _two_branch_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "group-repo"
    repo.mkdir()
    _git(repo, "init", "-b", "main")
    _write_wbt(repo, title="English Book", lang="en")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "main")
    _git(repo, "checkout", "-b", "main-de")
    _write_wbt(repo, title="Deutsches Buch", lang="de")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "main-de")
    _git(repo, "checkout", "main")
    return repo


def _cleanup(book_ids: list[str]) -> None:
    session = SessionLocal()
    try:
        for book_id in book_ids:
            for mapping in (
                session.query(GitSyncMapping).filter(GitSyncMapping.book_id == book_id).all()
            ):
                if mapping.local_clone_path:
                    shutil.rmtree(mapping.local_clone_path, ignore_errors=True)
                session.delete(mapping)
            for row in (
                session.query(BookImportSource).filter(BookImportSource.book_id == book_id).all()
            ):
                session.delete(row)
            book = session.get(Book, book_id)
            if book is not None:
                session.delete(book)
        session.commit()
    finally:
        session.close()


class TestSourceIdentifier:
    def test_identifier_is_branch_aware_and_normalized(self) -> None:
        ssh = git_source_identifier("git@github.com:astrapi69/some-book.git", "main-de")
        https = git_source_identifier("https://github.com/astrapi69/some-book", "main-de")
        assert ssh == https, "ssh and https forms of one repo must collide"
        assert ssh.startswith("git:")
        assert ssh.endswith("#main-de")

    def test_different_branches_do_not_collide(self) -> None:
        url = "https://github.com/astrapi69/some-book"
        assert git_source_identifier(url, "main") != git_source_identifier(url, "main-de")


class TestIdempotency:
    def test_second_import_creates_no_duplicate_books(self, tmp_path: Path) -> None:
        repo = _two_branch_repo(tmp_path)
        uploads = tmp_path / "uploads"
        uploads.mkdir()
        session = SessionLocal()
        created: list[str] = []
        try:
            first = import_translation_group(session, git_url=str(repo), uploads_dir=uploads)
            created.extend(book.book_id for book in first.books)
            assert len(first.books) == 2

            before = session.query(Book).filter(Book.deleted_at.is_(None)).count()

            second = import_translation_group(session, git_url=str(repo), uploads_dir=uploads)
            after = session.query(Book).filter(Book.deleted_at.is_(None)).count()
            created.extend(book.book_id for book in second.books if book.book_id not in created)

            assert after == before, "re-import must not create duplicate books"
            assert {b.book_id for b in second.books} == {b.book_id for b in first.books}
        finally:
            session.close()
            _cleanup(created)

    def test_each_branch_book_gets_its_own_import_source_row(self, tmp_path: Path) -> None:
        repo = _two_branch_repo(tmp_path)
        uploads = tmp_path / "uploads"
        uploads.mkdir()
        session = SessionLocal()
        created: list[str] = []
        try:
            result = import_translation_group(session, git_url=str(repo), uploads_dir=uploads)
            created.extend(book.book_id for book in result.books)

            for imported in result.books:
                row = (
                    session.query(BookImportSource)
                    .filter(BookImportSource.book_id == imported.book_id)
                    .one()
                )
                assert row.source_identifier == git_source_identifier(str(repo), imported.branch)
                assert row.source_type == "git"
        finally:
            session.close()
            _cleanup(created)


class TestCanonicalRemote:
    def test_staging_clone_records_the_real_remote_not_the_temp_path(self, tmp_path: Path) -> None:
        """The WBT handler hands this service a local STAGING clone, so
        the fresh clone's origin is a throwaway /tmp path with a new
        UUID per run. Persisting that produced dead GitSyncMapping URLs
        and made the #762 identifier unrecognisable next time (observed
        on all 21 group books of the 2026-09-11 import)."""
        upstream = _two_branch_repo(tmp_path)
        staging = tmp_path / "staging-clone"
        subprocess.run(
            ["git", "clone", str(upstream), str(staging)],
            check=True,
            capture_output=True,
            env={
                "PATH": "/usr/bin:/bin",
                "HOME": str(tmp_path),
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_SYSTEM": "/dev/null",
            },
        )

        uploads = tmp_path / "uploads"
        uploads.mkdir()
        session = SessionLocal()
        created: list[str] = []
        try:
            result = import_translation_group(session, git_url=str(staging), uploads_dir=uploads)
            created.extend(book.book_id for book in result.books)
            assert result.books

            for imported in result.books:
                mapping = (
                    session.query(GitSyncMapping)
                    .filter(GitSyncMapping.book_id == imported.book_id)
                    .one()
                )
                assert mapping.repo_url == str(upstream), (
                    "must record the upstream remote, not the staging clone"
                )
                row = (
                    session.query(BookImportSource)
                    .filter(BookImportSource.book_id == imported.book_id)
                    .one()
                )
                assert row.source_identifier == git_source_identifier(
                    str(upstream), imported.branch
                )
        finally:
            session.close()
            _cleanup(created)

    def test_reimport_through_a_fresh_staging_clone_is_still_idempotent(
        self, tmp_path: Path
    ) -> None:
        """The real orchestrator path: each detect/git run stages the
        repo under a NEW uuid directory. Idempotency must survive that."""
        upstream = _two_branch_repo(tmp_path)
        uploads = tmp_path / "uploads"
        uploads.mkdir()
        session = SessionLocal()
        created: list[str] = []
        try:
            ids = []
            for run in ("first", "second"):
                staging = tmp_path / f"staging-{run}"
                subprocess.run(
                    ["git", "clone", str(upstream), str(staging)],
                    check=True,
                    capture_output=True,
                    env={
                        "PATH": "/usr/bin:/bin",
                        "HOME": str(tmp_path),
                        "GIT_CONFIG_GLOBAL": "/dev/null",
                        "GIT_CONFIG_SYSTEM": "/dev/null",
                    },
                )
                # The WBT handler materialises the translation branches as
                # local heads in the staging clone before delegating; without
                # that step a clone-of-a-clone only sees the default branch.
                import git as gitpython

                from app.services.translation_import import (
                    _enumerate_translation_branches,
                )

                _enumerate_translation_branches(gitpython.Repo(str(staging)))

                result = import_translation_group(
                    session, git_url=str(staging), uploads_dir=uploads
                )
                created.extend(b.book_id for b in result.books if b.book_id not in created)
                ids.append({b.book_id for b in result.books})

            assert ids[0] == ids[1], "a second staging clone must reuse the same books"
            assert len(created) == 2
        finally:
            session.close()
            _cleanup(created)
