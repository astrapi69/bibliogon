"""Database side of the KDP payments report (#1147).

Two jobs: store payments idempotently (a newer download of the same
payment number wins, the same content twice writes nothing), and turn
Amazon's applied exchange rates into monthly rates - without ever
overwriting a rate that is already stored with a different value.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict

from sqlalchemy.orm import Session

from app.exceptions import ValidationError
from app.models import FinanceFxRate, FinanceImport, FinancePayment, FinancePaymentLine
from bibliogon_kdp.finance.parsing import ReportFormatError
from bibliogon_kdp.finance.payments import PaymentRecord, parse_payments
from bibliogon_kdp.finance.service import canonical_value, set_fx_rate

KIND = "kdp_payments"
_PAYMENT_FIELDS = (
    "payment_no",
    "marketplace",
    "sales_month",
    "payment_date",
    "method",
    "currency",
    "accrued",
    "tax",
    "net",
    "fx_rate",
    "payout_currency",
    "payout_amount",
    "status",
)
_LINE_FIELDS = ("sales_month", "source", "currency", "accrued", "tax", "net")


def _signature(payment: object, lines: list) -> tuple:
    head = tuple(canonical_value(getattr(payment, name)) for name in _PAYMENT_FIELDS)
    body = sorted(tuple(canonical_value(getattr(line, name)) for name in _LINE_FIELDS) for line in lines)
    return head, tuple(body)


def _stored(db: Session, numbers: list[str]) -> dict[str, tuple[FinancePayment, list]]:
    payments = db.query(FinancePayment).filter(FinancePayment.payment_no.in_(numbers)).all()
    lines = defaultdict(list)
    for line in db.query(FinancePaymentLine).filter(
        FinancePaymentLine.payment_id.in_([p.id for p in payments])
    ):
        lines[line.payment_id].append(line)
    return {p.payment_no: (p, lines[p.id]) for p in payments}


def import_payments(
    db: Session, *, raw: bytes, filename: str | None, sheet: str | None, dry_run: bool
) -> dict:
    """Parse a payments download and replace the stored payments it covers.

    Raises:
        ValidationError: When the download breaks its contract or invariants.
    """
    try:
        parsed = parse_payments(raw, sheet=sheet)
    except ReportFormatError as exc:
        raise ValidationError(f"Report does not match the {KIND} contract: {exc}") from exc
    numbers = [p.payment_no for p in parsed.payments]
    stored = _stored(db, numbers)
    outcome = {
        "kind": KIND,
        "months": sorted({p.sales_month for p in parsed.payments}),
        "rows": len(parsed.payments),
        "replaced": len(stored),
        "unmatched": [],
        "sheet": parsed.sheet,
        "header_row": parsed.header_row,
    }
    new = {p.payment_no: _signature(p, p.lines) for p in parsed.payments}
    old = {no: _signature(p, lines) for no, (p, lines) in stored.items()}
    if new == old:
        return {**outcome, "status": "unchanged", "replaced": 0}
    if dry_run:
        return {**outcome, "status": "dry_run"}
    _replace(db, raw, filename, parsed.payments, stored, outcome["months"])
    return {**outcome, "status": "imported"}


def _replace(
    db: Session,
    raw: bytes,
    filename: str | None,
    payments: list[PaymentRecord],
    stored: dict[str, tuple[FinancePayment, list]],
    months: list[str],
) -> None:
    log = FinanceImport(
        kind=KIND,
        sales_channel="kdp",
        filename=filename,
        file_sha256=hashlib.sha256(raw).hexdigest(),
        months=json.dumps(months),
        row_count=len(payments),
    )
    db.add(log)
    db.flush()
    for payment, lines in stored.values():
        for line in lines:
            db.delete(line)
        db.delete(payment)
    db.flush()
    for record in payments:
        row = FinancePayment(import_id=log.id, **{n: getattr(record, n) for n in _PAYMENT_FIELDS})
        db.add(row)
        db.flush()
        db.add_all(
            FinancePaymentLine(payment_id=row.id, **{n: getattr(line, n) for n in _LINE_FIELDS})
            for line in record.lines
        )
    db.commit()


def _rates_by_key(db: Session, base: str) -> dict[tuple[str, str], list[FinancePayment]]:
    keyed = defaultdict(list)
    query = db.query(FinancePayment).filter(
        FinancePayment.payout_currency == base, FinancePayment.fx_rate.isnot(None)
    )
    for payment in query.order_by(FinancePayment.payment_no):
        keyed[(payment.sales_month, payment.currency)].append(payment)
    return keyed


def apply_payment_fx_rates(db: Session, base_currency: str) -> dict:
    """Store Amazon's applied rate as the monthly rate per (month, currency).

    A stored equal rate counts as unchanged. A stored different rate, or
    two payments disagreeing about one month, is reported as a conflict
    and left alone - rates are write-once (#1129).
    """
    base = base_currency.upper()
    written, unchanged, conflicts = 0, 0, []
    for (month, currency), payments in sorted(_rates_by_key(db, base).items()):
        rates = {canonical_value(p.fx_rate) for p in payments}
        numbers = ", ".join(p.payment_no for p in payments)
        if len(rates) > 1:
            conflicts.append(_conflict(month, currency, None, ", ".join(sorted(rates)), numbers))
            continue
        rate = payments[0].fx_rate
        stored = (
            db.query(FinanceFxRate)
            .filter_by(month=month, currency=currency, base_currency=base)
            .first()
        )
        if stored is not None and canonical_value(stored.rate) == canonical_value(rate):
            unchanged += 1
        elif stored is not None:
            conflicts.append(_conflict(month, currency, str(stored.rate), str(rate), numbers))
        else:
            set_fx_rate(db, month, currency, base, rate, source=f"KDP payment {numbers}")
            written += 1
    return {"written": written, "unchanged": unchanged, "conflicts": conflicts}


def _conflict(month: str, currency: str, stored: str | None, payment: str, numbers: str) -> dict:
    return {
        "month": month,
        "currency": currency,
        "stored": stored,
        "payment": payment,
        "payment_no": numbers,
    }
