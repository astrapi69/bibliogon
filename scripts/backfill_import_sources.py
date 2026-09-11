#!/usr/bin/env python3
"""Backfill missing ``BookImportSource`` rows for git-imported books (#762).

The idempotency fix only protects books that carry a source row. Books
imported through the multi-branch translation path BEFORE the fix have
none, so re-importing their repository would create the whole group a
second time (observed 2026-09-11: 41 catalog entries produced 112
books).

Two modes, because the legacy data is worse than just missing rows:

1. **Generic backfill** - every ``GitSyncMapping`` whose ``repo_url``
   is a real remote gets a branch-aware source row.
2. **Catalog repair** (``--catalog``) - the pre-fix group import stored
   the throwaway STAGING clone as ``repo_url``
   (``/tmp/bibliogon_import_staging/imp-<uuid>/payload/<slug>``), which
   is both unusable as an identifier and dead for git-sync. Matching the
   trailing slug against a book catalog recovers the real URL, repairs
   the mapping, and then writes the row.

Both modes are idempotent: an existing row is never duplicated, and
``--dry-run`` reports without writing.

Usage::

    cd backend && poetry run python ../scripts/backfill_import_sources.py --dry-run
    cd backend && poetry run python ../scripts/backfill_import_sources.py \\
        --catalog ../book-catalog.yaml
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = REPO_ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import yaml  # noqa: E402

from app.models import Book, BookImportSource, GitSyncMapping  # noqa: E402
from app.services.translation_import import git_source_identifier  # noqa: E402

REAL_REMOTE_PREFIXES = ("git@", "http://", "https://", "ssh://")
STAGING_MARKER = "/bibliogon_import_staging/"


@dataclass
class BackfillReport:
    """Outcome counts plus the unresolved slugs, for the CLI summary."""

    created: int = 0
    repaired: int = 0
    replaced: int = 0
    already_present: int = 0
    unresolved: int = 0
    unresolved_slugs: set[str] = field(default_factory=set)


def _slug_from_staging_path(repo_url: str) -> str | None:
    """Repo slug out of a dead staging path, or None.

    ``.../payload/eternity-ebook@main`` -> ``eternity-ebook`` (#760
    suffixes the staging dir with the cloned branch).
    """
    if STAGING_MARKER not in repo_url:
        return None
    tail = repo_url.rstrip("/").rsplit("/", 1)[-1]
    tail = tail.split("@", 1)[0]
    return re.sub(r"\.git$", "", tail) or None


def load_catalog_urls(catalog_path: Path) -> dict[str, str]:
    """Map repo slug -> repo URL from a bulk-import catalog."""
    parsed = yaml.safe_load(catalog_path.read_text(encoding="utf-8")) or {}
    urls: dict[str, str] = {}
    for entry in parsed.get("books") or []:
        url = entry if isinstance(entry, str) else (entry or {}).get("repo_url")
        if not url:
            continue
        slug = re.sub(r"\.git$", "", str(url).rstrip("/").rsplit("/", 1)[-1])
        slug = slug.rsplit(":", 1)[-1]
        if slug:
            urls[slug.lower()] = str(url)
    return urls


def _recover_url(slug: str, catalog: dict[str, str]) -> str | None:
    """Catalog URL for a staging slug, exact match first.

    Falls back to a UNIQUE prefix match, because pre-fix staging dirs
    lost trailing letters to a ``rstrip(".git")`` bug (it strips
    characters from the set, not the suffix): ``Die-Geister-der-Zeit``
    landed on disk as ``Die-Geister-der-Ze``. An ambiguous prefix is
    left unresolved rather than guessed.
    """
    key = slug.lower()
    if key in catalog:
        return catalog[key]
    matches = [url for candidate, url in catalog.items() if candidate.startswith(key)]
    return matches[0] if len(matches) == 1 else None


def backfill(
    db,
    *,
    dry_run: bool,
    catalog_path: Path | None = None,
    log=lambda message: None,
) -> BackfillReport:
    """Create the missing source rows; repair dead staging URLs when a
    catalog is given.

    Args:
        db: Open SQLAlchemy session.
        dry_run: Report only, write nothing.
        catalog_path: Optional bulk-import catalog for slug recovery.
        log: Per-action sink for the CLI.

    Returns:
        Counts of created / repaired / already-present / unresolved.
    """
    report = BackfillReport()
    catalog = load_catalog_urls(catalog_path) if catalog_path else {}

    for mapping in db.query(GitSyncMapping).all():
        book = db.get(Book, mapping.book_id)
        if book is None or book.deleted_at is not None:
            continue

        existing = (
            db.query(BookImportSource).filter(BookImportSource.book_id == mapping.book_id).first()
        )
        if existing is not None and existing.source_type == "git":
            report.already_present += 1
            continue
        # ``Book.import_source`` is 1:1, so a git-imported book cannot
        # carry both identities. Its content signature hashes the staging
        # DIRECTORY NAME and breaks whenever that changes, while the
        # (url, branch) pair does not - so for a book that demonstrably
        # came from git, the git identity replaces the signature row.
        replacing = existing is not None

        repo_url = mapping.repo_url or ""
        repaired = False
        if not repo_url.startswith(REAL_REMOTE_PREFIXES):
            slug = _slug_from_staging_path(repo_url)
            recovered = _recover_url(slug, catalog) if slug else None
            if recovered is None:
                report.unresolved += 1
                if slug:
                    report.unresolved_slugs.add(slug)
                continue
            repo_url = recovered
            repaired = True

        identifier = git_source_identifier(repo_url, mapping.branch)
        log(f"{book.title[:40]:42} {mapping.branch:10} -> {identifier}")
        if not dry_run:
            if repaired:
                mapping.repo_url = repo_url
                db.add(mapping)
            if replacing:
                existing.source_identifier = identifier
                existing.source_type = "git"
                db.add(existing)
            else:
                db.add(
                    BookImportSource(
                        book_id=mapping.book_id,
                        source_identifier=identifier,
                        source_type="git",
                        format_name="wbt-zip",
                    )
                )
        if replacing:
            report.replaced += 1
        else:
            report.created += 1
        if repaired:
            report.repaired += 1

    if not dry_run:
        db.commit()
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="Report without writing")
    parser.add_argument(
        "--catalog",
        type=Path,
        help="Bulk-import catalog used to recover dead staging URLs by repo slug",
    )
    args = parser.parse_args(argv)

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        report = backfill(
            db,
            dry_run=args.dry_run,
            catalog_path=args.catalog,
            log=lambda message: print("  " + message),
        )
    finally:
        db.close()

    print()
    print(
        f"created: {report.created}  replaced signature rows: {report.replaced}  "
        f"(repaired URLs: {report.repaired})  "
        f"already present: {report.already_present}  unresolved: {report.unresolved}"
    )
    if report.unresolved_slugs:
        print("unresolved slugs (pass --catalog to recover):")
        for slug in sorted(report.unresolved_slugs):
            print(f"  {slug}")
    if args.dry_run:
        print("DRY RUN - nothing written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
