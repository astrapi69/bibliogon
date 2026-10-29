"""Database side of the finance import: reports, rates, costs (#1129).

Import semantics, stated once:

* **The newest download of a month is the truth.** Importing a report
  replaces every stored line of the same scope (kind, channel, format
  and month for sales; marketplace and month for ads). That is how a
  later download, now carrying refunds, corrects the month.
* **The same content twice changes nothing.** Before writing, the new
  lines are compared with the stored lines of the scope; when they are
  equal the import reports ``unchanged`` and writes no row, not even an
  import-log entry.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.exceptions import ConflictError, NotFoundError, ValidationError
from app.models import (
    Book,
    FinanceAdLine,
    FinanceFxRate,
    FinanceImport,
    FinanceKenpRate,
    FinanceRevenueLine,
    FinanceTitleCost,
)
from bibliogon_kdp.finance.parsing import (
    AdSpendRecord,
    ParsedReport,
    ReportFormatError,
    RevenueRecord,
    parse_report,
)

CHANNEL_BY_KIND = {"kdp_royalty": "kdp", "kdp_kenp": "kdp", "amazon_ads": "kdp"}
_REVENUE_FIELDS = (
    "sales_channel",
    "kind",
    "month",
    "marketplace",
    "book_format",
    "asin",
    "isbn",
    "title_text",
    "author_text",
    "royalty_type",
    "transaction_type",
    "units_sold",
    "units_refunded",
    "net_units",
    "kenp_pages",
    "royalty",
    "currency",
)
_AD_FIELDS = (
    "month",
    "marketplace",
    "campaign",
    "asin",
    "impressions",
    "clicks",
    "orders",
    "spend",
    "currency",
)


def normalize_isbn(value: str | None) -> str | None:
    """Digits (and a trailing X) only, so ``978-0-...`` matches ``9780...``."""
    if not value:
        return None
    cleaned = "".join(ch for ch in value.upper() if ch.isdigit() or ch == "X")
    return cleaned or None


class BookIndex:
    """ASIN/ISBN lookup over the existing ``Book`` columns - no second register."""

    def __init__(self, books: Iterable[Book]) -> None:
        self.by_code: dict[str, tuple[str, str]] = {}
        for book in books:
            for book_format in ("ebook", "paperback", "hardcover"):
                asin = getattr(book, f"asin_{book_format}", None)
                isbn = normalize_isbn(getattr(book, f"isbn_{book_format}", None))
                for code in (asin, isbn):
                    if code:
                        self.by_code.setdefault(code.upper(), (book.id, book_format))

    @classmethod
    def load(cls, db: Session) -> BookIndex:
        return cls(db.query(Book).filter(Book.deleted_at.is_(None)).all())

    def match(self, *codes: str | None) -> tuple[str, str] | None:
        for code in codes:
            if code and code.upper() in self.by_code:
                return self.by_code[code.upper()]
        return None


def _revenue_row(record: RevenueRecord, channel: str) -> dict:
    return {
        "sales_channel": channel,
        "kind": record.kind,
        "month": record.month,
        "marketplace": record.marketplace,
        "book_format": record.book_format,
        "asin": record.asin,
        "isbn": normalize_isbn(record.isbn),
        "title_text": record.title,
        "author_text": record.author,
        "royalty_type": record.royalty_type,
        "transaction_type": record.transaction_type,
        "units_sold": record.units_sold,
        "units_refunded": record.units_refunded,
        "net_units": record.net_units,
        "kenp_pages": record.kenp_pages,
        "royalty": record.royalty,
        "currency": record.currency,
    }


def _ad_row(record: AdSpendRecord) -> dict:
    return {name: getattr(record, name) for name in _AD_FIELDS}


def canonical_value(value: object) -> str:
    """``33``, ``33.0`` and ``33.00`` are one amount, whichever file it came from."""
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    return str(value)


def _signature(rows: Iterable[dict], fields: tuple[str, ...]) -> list[tuple]:
    return sorted(tuple(canonical_value(row[name]) for name in fields) for row in rows)


def _stored(model: type, query_rows: Iterable, fields: tuple[str, ...]) -> list[dict]:
    return [{name: getattr(row, name) for name in fields} for row in query_rows]


def _scope_query(db: Session, kind: str, rows: list[dict], months: list[str]):
    if kind == "amazon_ads":
        return db.query(FinanceAdLine).filter(
            FinanceAdLine.marketplace == rows[0]["marketplace"], FinanceAdLine.month.in_(months)
        )
    return db.query(FinanceRevenueLine).filter(
        FinanceRevenueLine.sales_channel == rows[0]["sales_channel"],
        FinanceRevenueLine.kind == rows[0]["kind"],
        FinanceRevenueLine.book_format == rows[0]["book_format"],
        FinanceRevenueLine.month.in_(months),
    )


def _parse(
    kind: str, raw: bytes, book_format: str | None, marketplace: str | None, sheet: str | None
) -> tuple[list[dict], ParsedReport]:
    try:
        parsed = parse_report(
            kind, raw, book_format=book_format, marketplace=marketplace, sheet=sheet
        )
    except ReportFormatError as exc:
        raise ValidationError(f"Report does not match the {kind} contract: {exc}") from exc
    if kind == "amazon_ads":
        return [_ad_row(record) for record in parsed.ads], parsed
    return [_revenue_row(record, CHANNEL_BY_KIND[kind]) for record in parsed.revenue], parsed


def _unmatched(db: Session, rows: list[dict]) -> list[str]:
    index = BookIndex.load(db)
    missing = {
        row.get("asin") or row.get("isbn") or ""
        for row in rows
        if index.match(row.get("asin"), row.get("isbn")) is None
    }
    return sorted(code for code in missing if code)


def import_report(
    db: Session,
    *,
    kind: str,
    raw: bytes,
    filename: str | None,
    book_format: str | None = None,
    marketplace: str | None = None,
    sheet: str | None = None,
    dry_run: bool = False,
) -> dict:
    """Parse, compare with the stored scope and replace it.

    Returns:
        ``status`` (``imported`` | ``unchanged`` | ``dry_run``), the
        months covered, the row count, how many stored rows were
        replaced, the ASIN/ISBN codes no book carries, and where the
        table was found (``sheet`` for a workbook, 1-based ``header_row``).

    Raises:
        ValidationError: When the file breaks its column contract.
    """
    rows, parsed = _parse(kind, raw, book_format, marketplace, sheet)
    months = sorted({row["month"] for row in rows})
    fields = _AD_FIELDS if kind == "amazon_ads" else _REVENUE_FIELDS
    model = FinanceAdLine if kind == "amazon_ads" else FinanceRevenueLine
    stored = _scope_query(db, kind, rows, months).all()
    outcome = {
        "kind": kind,
        "months": months,
        "rows": len(rows),
        "replaced": len(stored),
        "unmatched": _unmatched(db, rows),
        "sheet": parsed.sheet,
        "header_row": parsed.header_row,
    }
    if _signature(_stored(model, stored, fields), fields) == _signature(rows, fields):
        return {**outcome, "status": "unchanged", "replaced": 0}
    if dry_run:
        return {**outcome, "status": "dry_run"}
    _replace(db, kind, raw, filename, rows, months, stored, model, book_format, marketplace)
    return {**outcome, "status": "imported"}


def _replace(
    db: Session,
    kind: str,
    raw: bytes,
    filename: str | None,
    rows: list[dict],
    months: list[str],
    stored: list,
    model: type,
    book_format: str | None,
    marketplace: str | None,
) -> None:
    log = FinanceImport(
        kind=kind,
        sales_channel=CHANNEL_BY_KIND[kind],
        book_format=book_format if kind == "kdp_royalty" else None,
        marketplace=marketplace if kind == "amazon_ads" else None,
        filename=filename,
        file_sha256=hashlib.sha256(raw).hexdigest(),
        months=json.dumps(months),
        row_count=len(rows),
    )
    db.add(log)
    db.flush()
    for row in stored:
        db.delete(row)
    db.flush()
    db.add_all(model(import_id=log.id, **row) for row in rows)
    db.commit()


def list_imports(db: Session) -> list[FinanceImport]:
    return db.query(FinanceImport).order_by(FinanceImport.imported_at.desc()).all()


def set_kenp_rate(
    db: Session, month: str, marketplace: str, rate: Decimal, currency: str
) -> FinanceKenpRate:
    """Upsert the per-page rate of one month and marketplace."""
    row = db.query(FinanceKenpRate).filter_by(month=month, marketplace=marketplace).first()
    if row is None:
        row = FinanceKenpRate(month=month, marketplace=marketplace)
        db.add(row)
    row.rate, row.currency = rate, currency.upper()
    db.commit()
    return row


def set_fx_rate(
    db: Session,
    month: str,
    currency: str,
    base_currency: str,
    rate: Decimal,
    *,
    source: str | None = None,
    replace: bool = False,
) -> FinanceFxRate:
    """Store a monthly exchange rate; an existing different rate needs ``replace``.

    Raises:
        ConflictError: When a different rate is stored and ``replace`` is off.
    """
    currency, base_currency = currency.upper(), base_currency.upper()
    row = (
        db.query(FinanceFxRate)
        .filter_by(month=month, currency=currency, base_currency=base_currency)
        .first()
    )
    if row is not None and row.rate != rate and not replace:
        raise ConflictError(
            f"{month} {currency}->{base_currency} is already stored as {row.rate}; "
            "pass replace=true to change a rate past evaluations used"
        )
    if row is None:
        row = FinanceFxRate(month=month, currency=currency, base_currency=base_currency)
        db.add(row)
    row.rate, row.source = rate, source
    db.commit()
    return row


def add_cost(
    db: Session,
    *,
    book_id: str,
    cost_date: date,
    amount: Decimal,
    currency: str,
    category: str,
    note: str | None,
) -> FinanceTitleCost:
    """Record one direct cost of a title.

    Raises:
        NotFoundError: When the book does not exist.
    """
    if db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first() is None:
        raise NotFoundError(f"Book {book_id} not found")
    cost = FinanceTitleCost(
        book_id=book_id,
        cost_date=cost_date,
        amount=amount,
        currency=currency.upper(),
        category=category,
        note=note,
    )
    db.add(cost)
    db.commit()
    return cost


def list_costs(db: Session, book_id: str | None = None) -> list[FinanceTitleCost]:
    query = db.query(FinanceTitleCost)
    if book_id:
        query = query.filter(FinanceTitleCost.book_id == book_id)
    return query.order_by(FinanceTitleCost.cost_date, FinanceTitleCost.id).all()


def delete_cost(db: Session, cost_id: str) -> None:
    """Raises: NotFoundError when no such cost exists."""
    cost = db.get(FinanceTitleCost, cost_id)
    if cost is None:
        raise NotFoundError(f"Cost {cost_id} not found")
    db.delete(cost)
    db.commit()
