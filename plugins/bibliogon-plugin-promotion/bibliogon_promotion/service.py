"""Database side of the portfolio board (#782).

Reads and writes the per-format retail state, composes it with the
retail identity that already lives on ``Book``, and applies a batch of
CSV rows idempotently.

Every write goes through :func:`set_format_state`, which is what keeps
the split storage honest: the status and store URL land in
``book_format_states``, the ASIN lands in the matching ``Book.asin_*``
column, and no caller has to remember the division.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.exceptions import NotFoundError
from app.models import Book, BookFormatState, BookImportSource
from app.services.translation_import import git_source_identifier
from bibliogon_promotion.portfolio import (
    ASIN_FIELD_BY_FORMAT,
    FORMATS,
    FormatEntry,
    PortfolioCsvRow,
    asin_from_url,
    gaps_of,
    normalize_format,
    normalize_status,
    status_for_link,
)


@dataclass
class ImportReport:
    """Outcome of an idempotent CSV apply run."""

    dry_run: bool
    total_rows: int = 0
    matched: int = 0
    changed: int = 0
    unchanged: int = 0
    unmatched: list[str] = field(default_factory=list)
    matched_by_repo: int = 0
    matched_by_title: int = 0


def get_book(db: Session, book_id: str) -> Book:
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if book is None:
        raise NotFoundError(f"Book {book_id} not found")
    return book


def _states_by_format(db: Session, book_id: str) -> dict[str, BookFormatState]:
    rows = db.query(BookFormatState).filter(BookFormatState.book_id == book_id).all()
    return {row.book_format: row for row in rows}


def compose_entries(book: Book, states: dict[str, BookFormatState]) -> list[FormatEntry]:
    """One entry per canonical format, whether or not a row exists.

    A book with no rows at all still reports three formats, all
    ``missing`` - the board is a worklist, so absent must be visible.
    """
    entries = []
    for book_format in FORMATS:
        state = states.get(book_format)
        entries.append(
            FormatEntry(
                book_format=book_format,
                status=state.status if state else "missing",
                store_url=state.store_url if state else None,
                asin=getattr(book, ASIN_FIELD_BY_FORMAT[book_format], None),
            )
        )
    return entries


def set_format_state(
    db: Session,
    book: Book,
    book_format: str,
    *,
    status: str | None = None,
    store_url: str | None = None,
    asin: str | None = None,
) -> bool:
    """Upsert one format's state. Returns whether anything changed.

    The return value is what makes a re-run of the CSV import report
    "unchanged" instead of rewriting every row.
    """
    canonical_format = normalize_format(book_format)
    state = (
        db.query(BookFormatState)
        .filter(
            BookFormatState.book_id == book.id,
            BookFormatState.book_format == canonical_format,
        )
        .first()
    )
    if state is None:
        state = BookFormatState(book_id=book.id, book_format=canonical_format, status="missing")
        db.add(state)
        changed = True
    else:
        changed = False

    if status is not None:
        canonical_status = normalize_status(status)
        if state.status != canonical_status:
            state.status = canonical_status
            changed = True
    if store_url is not None and state.store_url != (store_url or None):
        state.store_url = store_url or None
        changed = True
    if asin is not None:
        asin_field = ASIN_FIELD_BY_FORMAT[canonical_format]
        if getattr(book, asin_field, None) != (asin or None):
            setattr(book, asin_field, asin or None)
            changed = True
    return changed


def portfolio_row(db: Session, book: Book) -> dict:
    entries = compose_entries(book, _states_by_format(db, book.id))
    source = db.query(BookImportSource).filter(BookImportSource.book_id == book.id).first()
    return {
        "book_id": book.id,
        "title": book.title,
        "author": book.author,
        "language": book.language,
        "status": book.status,
        "universal_link": book.universal_link,
        "source_identifier": source.source_identifier if source else None,
        "formats": [entry.__dict__ for entry in entries],
        "gaps": gaps_of(entries),
    }


def portfolio_rows(
    db: Session,
    *,
    language: str | None = None,
    author: str | None = None,
    gaps_only: bool = False,
) -> list[dict]:
    """The whole board, newest filter applied last.

    Ordering is by title so two runs read the same; the caller sorts
    differently only if the UI asks.
    """
    query = db.query(Book).filter(Book.deleted_at.is_(None))
    if language:
        query = query.filter(Book.language == language)
    if author:
        query = query.filter(Book.author == author)
    rows = [portfolio_row(db, book) for book in query.order_by(Book.title).all()]
    if gaps_only:
        rows = [row for row in rows if row["gaps"]]
    return rows


def _match_index(db: Session) -> tuple[dict[str, Book], dict[str, Book]]:
    """Two lookup tables: by git source identifier, and by title."""
    books = db.query(Book).filter(Book.deleted_at.is_(None)).all()
    by_title: dict[str, Book] = {}
    for book in books:
        by_title.setdefault((book.title or "").strip().lower(), book)

    by_source: dict[str, Book] = {}
    known = {book.id: book for book in books}
    for source in db.query(BookImportSource).all():
        book = known.get(source.book_id)
        if book is not None:
            by_source.setdefault(source.source_identifier, book)
    return by_source, by_title


def _find_book(
    row: PortfolioCsvRow, by_source: dict[str, Book], by_title: dict[str, Book]
) -> tuple[Book | None, str]:
    """Match a CSV row to a book, repo first, title as fallback.

    The repo identifier is the reliable key now that every imported
    book carries a stable ``git:<host>/<owner>/<repo>#<branch>`` row
    (#762); titles drift and repeat across translations.
    """
    if row.github_url:
        if row.github_branch:
            candidate = by_source.get(git_source_identifier(row.github_url, row.github_branch))
            if candidate is not None:
                return candidate, "repo"
        prefix = git_source_identifier(row.github_url, "")
        matches = [book for key, book in by_source.items() if key.startswith(prefix)]
        if len(matches) == 1:
            return matches[0], "repo"
    candidate = by_title.get((row.title or "").strip().lower())
    return (candidate, "title") if candidate is not None else (None, "")


def apply_csv_rows(db: Session, rows: list[PortfolioCsvRow], *, dry_run: bool) -> ImportReport:
    """Apply portfolio rows to the matching books, idempotently.

    A second run over unchanged input reports every row as unchanged
    and writes nothing - the discipline #762 was missing.
    """
    report = ImportReport(dry_run=dry_run, total_rows=len(rows))
    by_source, by_title = _match_index(db)

    for row in rows:
        book, how = _find_book(row, by_source, by_title)
        if book is None:
            report.unmatched.append(row.title)
            continue
        report.matched += 1
        if how == "repo":
            report.matched_by_repo += 1
        else:
            report.matched_by_title += 1

        changed = False
        if row.universal_link is not None and book.universal_link != row.universal_link:
            book.universal_link = row.universal_link
            changed = True
        for book_format, link in row.links.items():
            if set_format_state(
                db,
                book,
                book_format,
                status=status_for_link(link),
                store_url=link,
                asin=asin_from_url(link),
            ):
                changed = True

        if changed:
            report.changed += 1
        else:
            report.unchanged += 1

    if dry_run:
        db.rollback()
    else:
        db.commit()
    return report
