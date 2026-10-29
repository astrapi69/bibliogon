"""KDP payments report: Amazon's applied exchange rates and tax (#1147).

The payments download is hierarchical, so a flat column contract cannot
describe it. A payment row (one marketplace payout for one sales month)
is followed by its detail rows (one per source: eBook sales, paperback
sales, Kindle Unlimited). ``Währung`` appears twice - the marketplace
currency, then the payout currency - so columns are mapped by position
against the exact header sequence of a real download.

Every relation that held on the real file is checked per payment, and a
deviation fails the import instead of being stored: details sum to their
payment, net = accrued - tax, a foreign-currency payout carries a rate
and equals net x rate, details share the payment's month and currency.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from bibliogon_kdp.finance.money import parse_decimal, parse_month
from bibliogon_kdp.finance.parsing import ReportFormatError
from bibliogon_kdp.finance.tables import HEADER_SEARCH_ROWS, TableError, cell_text, read_grid

#: Header of a German-language KDP payments download, in column order.
DE_HEADERS: tuple[str, ...] = (
    "Verkaufszeitraum - Anfangsdatum",
    "Verkaufszeitraum - Endedatum",
    "Marketplace",
    "Zahlungsnummer",
    "Detail",
    "Datum",
    "Zahlungsart",
    "Währung",
    "Aufgelaufene Tantiemen",
    "Steuereinbehaltung",
    "Nettoeinnahmen",
    "Source",
    "Wechselkurs",
    "Währung",
    "Zahlungsbetrag",
    "Zahlungsstatus",
)
(
    START,
    END,
    MARKET,
    NUMBER,
    DETAIL,
    DATE,
    METHOD,
    CURRENCY,
    ACCRUED,
    TAX,
    NET,
    SOURCE,
    RATE,
    PAYOUT_CURRENCY,
    PAYOUT,
    STATUS,
) = range(len(DE_HEADERS))

CENT = Decimal("0.01")
PAYOUT_TOLERANCE = Decimal("0.02")


@dataclass
class PaymentLine:
    """One detail row: what one source earned in the payment's month."""

    sales_month: str
    source: str
    currency: str
    accrued: Decimal
    tax: Decimal
    net: Decimal


@dataclass
class PaymentRecord:
    """One marketplace payout for one sales month."""

    payment_no: str
    marketplace: str
    sales_month: str
    payment_date: str
    method: str
    currency: str
    accrued: Decimal
    tax: Decimal
    net: Decimal
    fx_rate: Decimal | None
    payout_currency: str
    payout_amount: Decimal
    status: str
    lines: list[PaymentLine] = field(default_factory=list)


@dataclass
class ParsedPayments:
    payments: list[PaymentRecord]
    header_row: int
    sheet: str | None


def parse_payments(raw: bytes, *, sheet: str | None = None) -> ParsedPayments:
    """Parse a KDP payments download (XLSX or CSV).

    Raises:
        ReportFormatError: For an unknown header, a malformed cell or a
            broken invariant, naming the row.
    """
    try:
        grid, sheet_name = read_grid(raw, sheet)
    except TableError as exc:
        raise ReportFormatError(exc.problems) from exc
    rows = [[cell_text_safe(cell) for cell in row[: len(DE_HEADERS)]] for row in grid]
    header = _find_header(rows)
    payments, problems = _collect(rows, header)
    problems += [p for payment in payments for p in _invariants(payment)]
    if problems:
        raise ReportFormatError(problems)
    if not payments:
        raise ReportFormatError(["report has no payment rows"])
    return ParsedPayments(payments=payments, header_row=header + 1, sheet=sheet_name)


def cell_text_safe(cell: object) -> str:
    """Cell as text; NBSP becomes a space (``Kindle+\\u00a0Tantiemen``)."""
    try:
        return cell_text(cell, "cell").replace(" ", " ")
    except ValueError:
        return repr(cell)


def _find_header(rows: list[list[str]]) -> int:
    for index, row in enumerate(rows[:HEADER_SEARCH_ROWS]):
        if tuple(row[: len(DE_HEADERS)]) == DE_HEADERS:
            return index
    first = next((row for row in rows if any(row)), [])
    raise ReportFormatError(
        [
            "header does not match the KDP payments report: expected "
            f"{list(DE_HEADERS)}, found {first}"
        ]
    )


def _collect(rows: list[list[str]], header: int) -> tuple[list[PaymentRecord], list[str]]:
    payments: list[PaymentRecord] = []
    problems: list[str] = []
    for number, row in enumerate(rows[header + 1 :], start=header + 2):
        row = row + [""] * (len(DE_HEADERS) - len(row))
        if not any(row):
            continue
        try:
            if row[NUMBER]:
                payments.append(_payment(row))
            elif not payments:
                raise ValueError("detail row before any payment row")
            else:
                payments[-1].lines.append(_line(row))
        except ValueError as exc:
            problems.append(f"row {number}: {exc}")
    return payments, problems


def _amount(row: list[str], column: int) -> Decimal:
    return parse_decimal(row[column], field=DE_HEADERS[column])


def _required(row: list[str], column: int) -> str:
    if not row[column]:
        raise ValueError(f"{DE_HEADERS[column]}: required cell is empty")
    return row[column]


def _payment(row: list[str]) -> PaymentRecord:
    start = parse_month(_required(row, START), field=DE_HEADERS[START])
    end = parse_month(_required(row, END), field=DE_HEADERS[END])
    if start != end:
        raise ValueError(f"sales period spans {start} to {end}; expected one month")
    return PaymentRecord(
        payment_no=_required(row, NUMBER),
        marketplace=_required(row, MARKET),
        sales_month=start,
        payment_date=_required(row, DATE),
        method=row[METHOD],
        currency=_required(row, CURRENCY).upper(),
        accrued=_amount(row, ACCRUED),
        tax=_amount(row, TAX),
        net=_amount(row, NET),
        fx_rate=parse_decimal(row[RATE], field="Wechselkurs") if row[RATE] else None,
        payout_currency=_required(row, PAYOUT_CURRENCY).upper(),
        payout_amount=_amount(row, PAYOUT),
        status=row[STATUS],
    )


def _line(row: list[str]) -> PaymentLine:
    return PaymentLine(
        sales_month=parse_month(_required(row, DETAIL), field="Detail"),
        source=_required(row, SOURCE),
        currency=_required(row, CURRENCY).upper(),
        accrued=_amount(row, ACCRUED),
        tax=_amount(row, TAX),
        net=_amount(row, NET),
    )


def _invariants(payment: PaymentRecord) -> list[str]:
    """Every relation the real download satisfies, stated per payment."""
    label = f"payment {payment.payment_no}"
    problems = []
    if not payment.lines:
        return [f"{label}: no detail rows"]
    if abs(payment.accrued - payment.tax - payment.net) > CENT:
        problems.append(f"{label}: net is not accrued - tax")
    for name in ("accrued", "tax", "net"):
        total = sum((getattr(line, name) for line in payment.lines), Decimal("0"))
        if abs(total - getattr(payment, name)) > CENT:
            problems.append(f"{label}: detail rows do not sum to the payment's {name}")
    for line in payment.lines:
        if line.sales_month != payment.sales_month or line.currency != payment.currency:
            problems.append(
                f"{label}: detail {line.sales_month}/{line.currency} differs from "
                f"the payment's {payment.sales_month}/{payment.currency}"
            )
    problems += _payout_problems(payment, label)
    return problems


def _payout_problems(payment: PaymentRecord, label: str) -> list[str]:
    if payment.currency == payment.payout_currency:
        if payment.fx_rate is None and abs(payment.payout_amount - payment.net) <= CENT:
            return []
        return [f"{label}: same-currency payout should equal net without a rate"]
    if payment.fx_rate is None:
        return [
            f"{label}: {payment.currency} paid out in {payment.payout_currency} without a Wechselkurs"
        ]
    if abs(payment.net * payment.fx_rate - payment.payout_amount) > PAYOUT_TOLERANCE:
        return [f"{label}: payout is not net x rate"]
    return []
