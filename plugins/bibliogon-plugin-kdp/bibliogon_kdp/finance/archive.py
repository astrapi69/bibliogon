"""Explicit export and restore of all finance data (#1129).

Finance data is deliberately NOT part of the ``.bgb`` backup (decision
pending with the author, proposal: explicit export only - the same
reasoning that took the AI keys out of every backup, #985). This module
is that explicit path. A restore replaces all finance tables in one
transaction and preserves row ids, so export -> restore -> export is
byte-identical.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, DateTime
from sqlalchemy.orm import Session

from app.exceptions import ValidationError
from app.models import (
    Book,
    DecimalText,
    FinanceAdLine,
    FinanceFxRate,
    FinanceImport,
    FinanceKenpRate,
    FinanceRevenueLine,
    FinanceTitleCost,
)

FORMAT_NAME = "bibliogon-finance"
FORMAT_VERSION = 1

#: Parents first; restore inserts in this order and deletes in reverse.
TABLES: tuple[tuple[str, type], ...] = (
    ("imports", FinanceImport),
    ("revenue_lines", FinanceRevenueLine),
    ("ad_lines", FinanceAdLine),
    ("kenp_rates", FinanceKenpRate),
    ("fx_rates", FinanceFxRate),
    ("title_costs", FinanceTitleCost),
)


def _dump_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _load_value(column: Any, value: Any) -> Any:
    if value is None:
        return None
    if isinstance(column.type, DecimalText):
        return Decimal(value)
    if isinstance(column.type, DateTime):
        return datetime.fromisoformat(value)
    if isinstance(column.type, Date):
        return date.fromisoformat(value)
    return value


def export_bundle(db: Session) -> dict:
    """Every finance row, ordered by id so two exports compare equal."""
    bundle: dict[str, Any] = {"format": FORMAT_NAME, "version": FORMAT_VERSION}
    for name, model in TABLES:
        columns = list(model.__table__.columns)
        rows = db.query(model).order_by(model.id).all()
        bundle[name] = [{c.key: _dump_value(getattr(row, c.key)) for c in columns} for row in rows]
    return bundle


def _check_bundle(db: Session, bundle: dict) -> None:
    if bundle.get("format") != FORMAT_NAME or bundle.get("version") != FORMAT_VERSION:
        raise ValidationError(
            f"not a {FORMAT_NAME} v{FORMAT_VERSION} export "
            f"(format={bundle.get('format')!r}, version={bundle.get('version')!r})"
        )
    for name, model in TABLES:
        columns = {c.key for c in model.__table__.columns}
        for row in bundle.get(name, []):
            unknown = sorted(set(row) - columns)
            if unknown:
                raise ValidationError(f"{name}: unknown field(s) {', '.join(unknown)}")
    book_ids = {row["book_id"] for row in bundle.get("title_costs", [])}
    known = {book_id for (book_id,) in db.query(Book.id).filter(Book.id.in_(book_ids))}
    if book_ids - known:
        raise ValidationError(
            "costs reference books that do not exist here: "
            f"{', '.join(sorted(book_ids - known))} - restore the books first"
        )


def restore_bundle(db: Session, bundle: dict) -> dict[str, int]:
    """Replace all finance tables with the bundle's rows.

    Raises:
        ValidationError: For a foreign format or costs of unknown books.
    """
    _check_bundle(db, bundle)
    for _, model in reversed(TABLES):
        db.query(model).delete()
    counts = {}
    for name, model in TABLES:
        columns = {c.key: c for c in model.__table__.columns}
        rows = bundle.get(name, [])
        for row in rows:
            db.add(model(**{key: _load_value(columns[key], value) for key, value in row.items()}))
        db.flush()
        counts[name] = len(rows)
    db.commit()
    return counts
