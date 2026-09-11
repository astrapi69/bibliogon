#!/usr/bin/env python3
"""Repair image paths in already-imported chapters (#789).

Some manuscripts carry raw HTML written with German typographic quotes
and a stray space before the extension::

    <img src=„assets/ewigkeit-das-selbst-02. png“ alt=„Schleife“ />

Per the HTML spec an unquoted attribute value ends at whitespace, so a
parser reads that source as ``„assets/ewigkeit-das-selbst-02.`` - quote
included, extension gone. The import-time rewrite therefore never
matched, the chapter kept a path that resolves to nothing, and every
EPUB or PDF export of that book failed with ``MissingImagesError``.

The matcher now covers the German quote pair, so new imports are clean.
This script applies the same rewrite to the rows that were imported
before the fix. It is idempotent, reports per book, and writes nothing
under ``--dry-run``.

Usage::

    cd backend && poetry run python ../scripts/repair_image_paths.py --dry-run
    cd backend && poetry run python ../scripts/repair_image_paths.py
    cd backend && poetry run python ../scripts/repair_image_paths.py --book-id <id>
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = REPO_ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@dataclass
class BookOutcome:
    """What the rewrite did to one book."""

    book_id: str
    title: str
    chapters_repaired: int


@dataclass
class RepairReport:
    dry_run: bool
    books: list[BookOutcome] = field(default_factory=list)
    books_scanned: int = 0

    @property
    def chapters_repaired(self) -> int:
        return sum(outcome.chapters_repaired for outcome in self.books)


def repair_all(db, *, dry_run: bool, book_ids: list[str] | None = None) -> RepairReport:
    """Rewrite unresolved image sources across every (or one) book.

    Args:
        db: An open SQLAlchemy session.
        dry_run: Report without committing; the session is rolled back.
        book_ids: Restrict the run to these books.

    Returns:
        A :class:`RepairReport` naming every book that changed.
    """
    from app.models import Book
    from app.services.backup.asset_utils import rewrite_image_paths

    report = RepairReport(dry_run=dry_run)
    query = db.query(Book).filter(Book.deleted_at.is_(None))
    if book_ids:
        query = query.filter(Book.id.in_(book_ids))

    for book in query.order_by(Book.title).all():
        report.books_scanned += 1
        repaired = rewrite_image_paths(db, book.id)
        if repaired:
            report.books.append(
                BookOutcome(book_id=book.id, title=book.title, chapters_repaired=repaired)
            )

    if dry_run:
        db.rollback()
    else:
        db.commit()
    return report


def render_report(report: RepairReport) -> str:
    """Human-readable summary of one repair run."""
    mode = "dry run - nothing written" if report.dry_run else "applied"
    lines = [f"image-path repair ({mode})", f"  books scanned: {report.books_scanned}"]
    for outcome in report.books:
        lines.append(f"    {outcome.book_id}  {outcome.chapters_repaired:>3} chapter(s)  {outcome.title}")
    lines.append(f"  chapters repaired: {report.chapters_repaired}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="Report without writing")
    parser.add_argument(
        "--book-id",
        action="append",
        dest="book_ids",
        help="Restrict the run to this book (repeatable)",
    )
    args = parser.parse_args(argv)

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        report = repair_all(db, dry_run=args.dry_run, book_ids=args.book_ids)
    finally:
        db.close()

    print(render_report(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
