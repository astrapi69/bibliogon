"""Typed projection of report downloads onto records (#1129).

Contract per cell kind, stated once: a required cell that is empty or
unreadable fails the import and names its row and column; an optional
cell that is empty becomes ``None``; a header outside the declared
contract fails the whole file. Nothing is skipped silently, apart from
rows in which every cell is empty (the trailing blanks spreadsheet
exports produce).
"""

from __future__ import annotations

import csv
import io
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
from typing import TypeVar

from bibliogon_kdp.finance.columns import CONTRACTS, ColumnContract
from bibliogon_kdp.finance.money import parse_decimal, parse_int, parse_month

BOOK_FORMATS: tuple[str, ...] = ("ebook", "paperback", "hardcover")


class ReportFormatError(ValueError):
    """The report does not match its declared contract."""

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("; ".join(problems))


@dataclass
class RevenueRecord:
    """One revenue row of a KDP royalty or KENP report."""

    kind: str
    month: str
    marketplace: str
    book_format: str
    asin: str | None
    isbn: str | None
    title: str | None
    author: str | None
    royalty_type: str | None = None
    transaction_type: str | None = None
    units_sold: int = 0
    units_refunded: int = 0
    net_units: int = 0
    kenp_pages: int = 0
    royalty: Decimal | None = None
    currency: str | None = None


@dataclass
class AdSpendRecord:
    """One row of an Amazon Ads advertised-product report."""

    month: str
    marketplace: str
    campaign: str
    asin: str
    spend: Decimal
    currency: str
    impressions: int
    clicks: int
    orders: int | None


@dataclass
class ParsedReport:
    kind: str
    revenue: list[RevenueRecord] = field(default_factory=list)
    ads: list[AdSpendRecord] = field(default_factory=list)


Row = dict[str, str]
T = TypeVar("T")


def parse_report(
    kind: str,
    raw: bytes,
    *,
    book_format: str | None = None,
    marketplace: str | None = None,
) -> ParsedReport:
    """Parse one downloaded report.

    Args:
        kind: ``kdp_royalty``, ``kdp_kenp`` or ``amazon_ads``.
        raw: File content (CSV; comma, semicolon or tab separated).
        book_format: Required for ``kdp_royalty`` - KDP ships one sheet
            per format and the eBook sheet has no format column.
        marketplace: Required for ``amazon_ads`` - an Ads account belongs
            to one marketplace and its report does not name it.

    Raises:
        ReportFormatError: On any deviation from the declared contract.
    """
    contract = CONTRACTS.get(kind)
    if contract is None:
        raise ReportFormatError([f"unknown report kind {kind!r}"])
    rows = _read_rows(raw, contract)
    if kind == "kdp_royalty":
        fmt = _require_choice("book_format", book_format, BOOK_FORMATS)
        return ParsedReport(kind, revenue=_project(rows, lambda r: _royalty(r, fmt)))
    if kind == "kdp_kenp":
        return ParsedReport(kind, revenue=_project(rows, _kenp))
    market = _require_text("marketplace", marketplace)
    return ParsedReport(kind, ads=_project(rows, lambda r: _ad(r, market)))


def _require_choice(name: str, value: str | None, choices: tuple[str, ...]) -> str:
    if value not in choices:
        raise ReportFormatError([f"{name} must be one of {', '.join(choices)}, got {value!r}"])
    return value


def _require_text(name: str, value: str | None) -> str:
    if not value or not value.strip():
        raise ReportFormatError([f"{name} is required for this report kind"])
    return value.strip()


def _decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ReportFormatError([f"file is not UTF-8 text: {exc}"]) from exc


def _read_rows(raw: bytes, contract: ColumnContract) -> list[tuple[int, Row]]:
    """Header check plus the non-blank rows, numbered as in the file."""
    text = _decode(raw)
    if not text.strip():
        raise ReportFormatError(["report has no data rows"])
    delimiter = max((",", ";", "\t"), key=text.splitlines()[0].count)
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    headers = [cell.strip() for cell in next(reader)]
    _check_headers(headers, contract)
    rows = []
    for number, cells in enumerate(reader, start=2):
        if not any(cell.strip() for cell in cells):
            continue
        if len(cells) != len(headers):
            raise ReportFormatError(
                [f"row {number}: {len(cells)} cells, header has {len(headers)}"]
            )
        rows.append((number, dict(zip(headers, (c.strip() for c in cells), strict=True))))
    if not rows:
        raise ReportFormatError(["report has no data rows"])
    return rows


def _check_headers(headers: list[str], contract: ColumnContract) -> None:
    problems = []
    unknown = [h for h in headers if h not in contract.known()]
    if unknown:
        problems.append(f"unknown column(s) for {contract.kind}: {', '.join(unknown)}")
    missing = [h for h in contract.required if h not in headers]
    if missing:
        problems.append(f"missing required column(s) for {contract.kind}: {', '.join(missing)}")
    duplicates = sorted({h for h in headers if headers.count(h) > 1})
    if duplicates:
        problems.append(f"duplicate column(s): {', '.join(duplicates)}")
    if problems:
        raise ReportFormatError(problems)


def _project(rows: list[tuple[int, Row]], build: Callable[[Row], T]) -> list[T]:
    """Apply ``build`` per row, collecting every bad row before failing."""
    records, problems = [], []
    for number, row in rows:
        try:
            records.append(build(row))
        except ValueError as exc:
            problems.append(f"row {number}: {exc}")
    if problems:
        raise ReportFormatError(problems)
    return records


def _text(row: Row, column: str) -> str:
    value = row.get(column, "")
    if not value:
        raise ValueError(f"{column}: required cell is empty")
    return value


def _optional(row: Row, column: str) -> str | None:
    return row.get(column) or None


def _royalty(row: Row, book_format: str) -> RevenueRecord:
    return RevenueRecord(
        kind="royalty",
        month=parse_month(_text(row, "Royalty Date"), field="Royalty Date"),
        marketplace=_text(row, "Marketplace"),
        book_format=book_format,
        asin=_text(row, "ASIN"),
        isbn=_optional(row, "ISBN"),
        title=_text(row, "Title"),
        author=_optional(row, "Author Name"),
        royalty_type=_optional(row, "Royalty Type"),
        transaction_type=_optional(row, "Transaction Type"),
        units_sold=parse_int(_text(row, "Units Sold"), field="Units Sold"),
        units_refunded=parse_int(_text(row, "Units Refunded"), field="Units Refunded"),
        net_units=parse_int(_text(row, "Net Units Sold"), field="Net Units Sold"),
        royalty=parse_decimal(_text(row, "Royalty"), field="Royalty"),
        currency=_text(row, "Currency").upper(),
    )


def _kenp(row: Row) -> RevenueRecord:
    pages_column = "Kindle Edition Normalized Pages (KENP) Read"
    return RevenueRecord(
        kind="kenp",
        month=parse_month(_text(row, "Date"), field="Date"),
        marketplace=_text(row, "Marketplace"),
        book_format="ebook",
        asin=_text(row, "ASIN"),
        isbn=None,
        title=_optional(row, "Title"),
        author=_optional(row, "Author Name"),
        kenp_pages=parse_int(_text(row, pages_column), field=pages_column),
    )


def _ad_month(row: Row) -> str:
    if row.get("Date"):
        return parse_month(row["Date"], field="Date")
    if row.get("Start Date") and row.get("End Date"):
        start = parse_month(row["Start Date"], field="Start Date")
        end = parse_month(row["End Date"], field="End Date")
        if start != end:
            raise ValueError(
                f"Start Date/End Date spans {start} to {end}; spend cannot be "
                "assigned to one month - download a daily or monthly report"
            )
        return start
    raise ValueError("Date (or Start Date and End Date): required cell is empty")


def _ad(row: Row, marketplace: str) -> AdSpendRecord:
    orders = _optional(row, "14 Day Total Orders (#)")
    return AdSpendRecord(
        month=_ad_month(row),
        marketplace=marketplace,
        campaign=_text(row, "Campaign Name"),
        asin=_text(row, "Advertised ASIN"),
        spend=parse_decimal(_text(row, "Spend"), field="Spend"),
        currency=_text(row, "Currency").upper(),
        impressions=parse_int(_text(row, "Impressions"), field="Impressions"),
        clicks=parse_int(_text(row, "Clicks"), field="Clicks"),
        orders=parse_int(orders, field="14 Day Total Orders (#)") if orders else None,
    )
