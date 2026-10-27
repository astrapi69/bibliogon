"""Cell parsing and month conventions for the finance import (#1129).

Every parser here either returns an exact value or raises ``ValueError``
naming the column. A cell that cannot be read with certainty is an
error, never a zero: a parser that guesses produces wrong figures for
years without anyone noticing.
"""

from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

#: A month counts as ``provisional`` until this many days after its last
#: day. Refunds reach KDP late and can still change a month's figures.
PROVISIONAL_DAYS = 90

_DECIMAL_RE = re.compile(r"^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$")
_MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")
_DATE_FORMATS = ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%b %d, %Y", "%B %d, %Y")


def parse_decimal(text: str, *, field: str) -> Decimal:
    """Read a plain decimal such as ``33.00``, ``-2.10`` or ``1,234.56``.

    A comma is accepted only as a thousands separator in groups of
    three, so a localised ``12,5`` fails instead of becoming 125.

    Raises:
        ValueError: For anything else, naming ``field``.
    """
    candidate = (text or "").strip()
    if not _DECIMAL_RE.match(candidate):
        raise ValueError(f"{field}: {text!r} is not a plain decimal number")
    try:
        return Decimal(candidate.replace(",", ""))
    except InvalidOperation as exc:
        raise ValueError(f"{field}: {text!r} is not a plain decimal number") from exc


def parse_int(text: str, *, field: str) -> int:
    """Read a whole number; ``12.0`` is accepted, ``1.5`` is not.

    Raises:
        ValueError: For a fraction or a non-number, naming ``field``.
    """
    value = parse_decimal(text, field=field)
    if value != value.to_integral_value():
        raise ValueError(f"{field}: {text!r} is not a whole number")
    return int(value)


def parse_month(text: str, *, field: str) -> str:
    """Return ``YYYY-MM`` for an ISO month, ISO date or ``Jan 05, 2026``.

    Day-first and slash dates are rejected: ``01/02/2026`` is January
    or February depending on the locale, and guessing moves money
    between months.

    Raises:
        ValueError: For any other shape, naming ``field``.
    """
    candidate = (text or "").strip()
    match = _MONTH_RE.match(candidate)
    if match and 1 <= int(match.group(2)) <= 12:
        return candidate
    for date_format in _DATE_FORMATS:
        try:
            return datetime.strptime(candidate, date_format).strftime("%Y-%m")
        except ValueError:
            continue
    raise ValueError(f"{field}: {text!r} is not an unambiguous date or month")


def last_day_of(month: str) -> date:
    """The last calendar day of a ``YYYY-MM`` month."""
    year, month_number = (int(part) for part in month.split("-"))
    return date(year, month_number, calendar.monthrange(year, month_number)[1])


def month_status(month: str, today: date) -> str:
    """``closed`` once more than :data:`PROVISIONAL_DAYS` have passed."""
    cutoff = last_day_of(month) + timedelta(days=PROVISIONAL_DAYS)
    return "closed" if today > cutoff else "provisional"
