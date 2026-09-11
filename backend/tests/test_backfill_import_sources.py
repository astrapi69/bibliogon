"""Backfill of missing BookImportSource rows (#762, legacy data).

The idempotency fix only helps books that carry a source row. Books
imported through the multi-branch path BEFORE the fix have none - and
worse, their GitSyncMapping.repo_url points at the throwaway staging
clone (/tmp/bibliogon_import_staging/imp-<uuid>/payload/<slug>), so
there is nothing durable to derive an identifier from.

The script therefore has two modes: a generic backfill from mappings
that already carry a real remote, and a catalog-assisted repair that
maps a dead staging path back to its real URL by repo slug. Both must
be idempotent - re-running changes nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import backfill_import_sources as backfill  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import Book, BookImportSource, GitSyncMapping  # noqa: E402


@pytest.fixture()
def session():
    db = SessionLocal()
    created: list[str] = []
    yield db, created
    for book_id in created:
        for row in db.query(BookImportSource).filter(BookImportSource.book_id == book_id):
            db.delete(row)
        for mapping in db.query(GitSyncMapping).filter(GitSyncMapping.book_id == book_id):
            db.delete(mapping)
        book = db.get(Book, book_id)
        if book is not None:
            db.delete(book)
    db.commit()
    db.close()


def _book_with_mapping(db, created, *, title: str, repo_url: str, branch: str) -> str:
    book = Book(title=title, author="Test", language="de")
    db.add(book)
    db.flush()
    created.append(book.id)
    db.add(
        GitSyncMapping(
            book_id=book.id,
            repo_url=repo_url,
            branch=branch,
            last_imported_commit_sha="0" * 40,
            local_clone_path="/tmp/does-not-matter",
        )
    )
    db.commit()
    return book.id


class TestGenericBackfill:
    def test_creates_a_row_for_a_real_remote(self, session) -> None:
        db, created = session
        book_id = _book_with_mapping(
            db,
            created,
            title="Echtes Remote Buch",
            repo_url="git@github.com:astrapi69/some-book.git",
            branch="main-de",
        )

        report = backfill.backfill(db, dry_run=False)

        row = db.query(BookImportSource).filter(BookImportSource.book_id == book_id).one()
        assert row.source_identifier == "git:github.com/astrapi69/some-book#main-de"
        assert row.source_type == "git"
        assert report.created >= 1

    def test_is_idempotent(self, session) -> None:
        db, created = session
        _book_with_mapping(
            db,
            created,
            title="Zweimal Buch",
            repo_url="https://github.com/astrapi69/twice",
            branch="main",
        )

        first = backfill.backfill(db, dry_run=False)
        second = backfill.backfill(db, dry_run=False)

        assert first.created >= 1
        assert second.created == 0, "second run must be a no-op"

    def test_dry_run_writes_nothing(self, session) -> None:
        db, created = session
        book_id = _book_with_mapping(
            db,
            created,
            title="Dry Run Buch",
            repo_url="https://github.com/astrapi69/dry",
            branch="main",
        )

        report = backfill.backfill(db, dry_run=True)

        assert report.created >= 1, "dry run still reports what it would do"
        assert db.query(BookImportSource).filter(BookImportSource.book_id == book_id).count() == 0

    def test_skips_dead_staging_paths_without_a_catalog(self, session) -> None:
        db, created = session
        book_id = _book_with_mapping(
            db,
            created,
            title="Staging Buch",
            repo_url="/tmp/bibliogon_import_staging/imp-abc/payload/some-book",
            branch="main-de",
        )

        report = backfill.backfill(db, dry_run=False)

        assert db.query(BookImportSource).filter(BookImportSource.book_id == book_id).count() == 0
        assert report.unresolved >= 1


class TestCatalogRepair:
    def test_maps_a_staging_path_back_to_the_real_url(self, session, tmp_path) -> None:
        db, created = session
        book_id = _book_with_mapping(
            db,
            created,
            title="Katalog Buch",
            repo_url="/tmp/bibliogon_import_staging/imp-xyz/payload/ai-for-everyone",
            branch="main-de",
        )
        catalog = tmp_path / "book-catalog.yaml"
        catalog.write_text(
            "books:\n  - repo_url: git@github.com:astrapi69/ai-for-everyone.git\n",
            encoding="utf-8",
        )

        report = backfill.backfill(db, dry_run=False, catalog_path=catalog)

        row = db.query(BookImportSource).filter(BookImportSource.book_id == book_id).one()
        assert row.source_identifier == "git:github.com/astrapi69/ai-for-everyone#main-de"
        mapping = db.query(GitSyncMapping).filter(GitSyncMapping.book_id == book_id).one()
        assert mapping.repo_url == "git@github.com:astrapi69/ai-for-everyone.git", (
            "the dead staging URL must be repaired too, or git-sync stays broken"
        )
        assert report.repaired >= 1

    def test_branch_suffixed_staging_slug_is_matched(self, session, tmp_path) -> None:
        # #760 names the staging dir <slug>@<branch>.
        db, created = session
        book_id = _book_with_mapping(
            db,
            created,
            title="Suffix Buch",
            repo_url="/tmp/bibliogon_import_staging/imp-1/payload/eternity-ebook@main",
            branch="main-de",
        )
        catalog = tmp_path / "book-catalog.yaml"
        catalog.write_text(
            "books:\n  - repo_url: git@github.com:astrapi69/eternity-ebook.git\n",
            encoding="utf-8",
        )

        backfill.backfill(db, dry_run=False, catalog_path=catalog)

        row = db.query(BookImportSource).filter(BookImportSource.book_id == book_id).one()
        assert row.source_identifier.startswith("git:github.com/astrapi69/eternity-ebook#")

    def test_truncated_legacy_slug_resolves_via_unique_prefix(self, session, tmp_path) -> None:
        """Pre-fix staging dirs lost trailing letters to the
        rstrip(".git") bug ("Die-Geister-der-Zeit" -> "...der-Ze").
        Those rows already exist in live databases, so the repair must
        still resolve them - but only when exactly ONE catalog slug
        starts with the truncated name."""
        db, created = session
        book_id = _book_with_mapping(
            db,
            created,
            title="Die Geister der Zeit",
            repo_url="/tmp/bibliogon_import_staging/imp-9/payload/Die-Geister-der-Ze",
            branch="main-en",
        )
        catalog = tmp_path / "book-catalog.yaml"
        catalog.write_text(
            "books:\n"
            "  - repo_url: git@github.com:astrapi69/Die-Geister-der-Zeit.git\n"
            "  - repo_url: git@github.com:astrapi69/other-book.git\n",
            encoding="utf-8",
        )

        backfill.backfill(db, dry_run=False, catalog_path=catalog)

        row = db.query(BookImportSource).filter(BookImportSource.book_id == book_id).one()
        assert row.source_identifier == ("git:github.com/astrapi69/die-geister-der-zeit#main-en")

    def test_ambiguous_prefix_is_left_unresolved(self, session, tmp_path) -> None:
        db, created = session
        book_id = _book_with_mapping(
            db,
            created,
            title="Mehrdeutig",
            repo_url="/tmp/bibliogon_import_staging/imp-9/payload/book",
            branch="main",
        )
        catalog = tmp_path / "book-catalog.yaml"
        catalog.write_text(
            "books:\n"
            "  - repo_url: git@github.com:astrapi69/book-one.git\n"
            "  - repo_url: git@github.com:astrapi69/book-two.git\n",
            encoding="utf-8",
        )

        report = backfill.backfill(db, dry_run=False, catalog_path=catalog)

        assert (
            db.query(BookImportSource).filter(BookImportSource.book_id == book_id).count() == 0
        ), "an ambiguous prefix must never guess"
        assert report.unresolved >= 1

    def test_replaces_a_signature_row_on_a_git_imported_book(self, session, tmp_path) -> None:
        """Book.import_source is 1:1, so a git-imported book cannot hold
        both identities. For a book that came from git, the (url, branch)
        pair is the stable one - the folder signature hashes the staging
        DIRECTORY NAME and silently breaks whenever that changes (the
        #760 branch suffix, the slug fix). Five of the author's books
        regressed to "would import" exactly that way.
        """
        db, created = session
        book_id = _book_with_mapping(
            db,
            created,
            title="Signature Buch",
            repo_url="git@github.com:astrapi69/sig-book.git",
            branch="main",
        )
        db.add(
            BookImportSource(
                book_id=book_id,
                source_identifier="signature:deadbeef",
                source_type="wbt-zip",
                format_name="wbt-zip",
            )
        )
        db.commit()

        report = backfill.backfill(db, dry_run=False)

        row = db.query(BookImportSource).filter(BookImportSource.book_id == book_id).one()
        assert row.source_identifier == "git:github.com/astrapi69/sig-book#main"
        assert row.source_type == "git"
        assert report.replaced >= 1

    def test_leaves_an_existing_git_row_untouched(self, session) -> None:
        db, created = session
        book_id = _book_with_mapping(
            db,
            created,
            title="Schon Git Buch",
            repo_url="git@github.com:astrapi69/already.git",
            branch="main",
        )
        backfill.backfill(db, dry_run=False)
        second = backfill.backfill(db, dry_run=False)
        assert second.created == 0 and second.replaced == 0
        assert db.query(BookImportSource).filter(BookImportSource.book_id == book_id).count() == 1
