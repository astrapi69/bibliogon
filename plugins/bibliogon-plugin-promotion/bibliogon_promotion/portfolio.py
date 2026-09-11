"""Portfolio-board logic: per-format retail presence (#782).

The author's portfolio truth used to live in a hand-maintained CSV -
one row per book, one Amazon link per format - plus a Markdown list of
gaps ("hardcover fehlt"). Both drifted. This module holds the pure part
of replacing them: link parsing, normalisation, gap detection and CSV
row shaping. Everything here is database-free and unit-tested; the
DB-backed apply step lives in :mod:`bibliogon_promotion.service`.

Deliberately NOT stored per format: the ASIN. ``Book.asin_ebook`` and
its siblings already exist and the KDP plugin reads them, so a second
copy would need syncing. The board composes both sides instead.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

#: Canonical format order. Every list the board returns uses it, so the
#: UI never has to sort and a gap list reads the same way twice.
FORMATS: tuple[str, ...] = ("ebook", "paperback", "hardcover")

#: "live" is on sale, "draft" is uploaded but not published, "missing"
#: means the format does not exist yet. Validated here rather than by a
#: DB constraint, matching ``Chapter.chapter_type``.
STATUSES: tuple[str, ...] = ("live", "draft", "missing")

#: Formats that are not on sale. Both belong on the same worklist.
GAP_STATUSES: frozenset[str] = frozenset({"draft", "missing"})

ASIN_FIELD_BY_FORMAT: dict[str, str] = {
    "ebook": "asin_ebook",
    "paperback": "asin_paperback",
    "hardcover": "asin_hardcover",
}

#: Column header in ``books-list.csv`` per canonical format.
CSV_LINK_COLUMN_BY_FORMAT: dict[str, str] = {
    "ebook": "eBook",
    "paperback": "Paperback",
    "hardcover": "Hardcover",
}

_ASIN_RE = re.compile(r"/(?:dp|gp/product)/([A-Z0-9]{10})(?:[/?]|$)", re.IGNORECASE)


@dataclass
class FormatEntry:
    """One format of one book, as the board presents it."""

    book_format: str
    status: str
    store_url: str | None
    asin: str | None


@dataclass
class PortfolioCsvRow:
    """One normalised row of the author's portfolio CSV."""

    title: str
    author: str | None = None
    language: str | None = None
    status: str | None = None
    github_url: str | None = None
    github_branch: str | None = None
    universal_link: str | None = None
    links: dict[str, str | None] = field(default_factory=dict)


def asin_from_url(url: str | None) -> str | None:
    """Extract the ASIN from an Amazon product URL.

    Handles both ``/dp/<asin>`` and ``/gp/product/<asin>``, with or
    without a trailing path or query.

    Args:
        url: Product URL, possibly empty or None.

    Returns:
        The 10-character ASIN, or None when the URL carries none.
    """
    if not url:
        return None
    match = _ASIN_RE.search(url.strip())
    return match.group(1).upper() if match else None


def status_for_link(url: str | None) -> str:
    """Infer a format's status from the presence of a store link.

    The CSV records only links, so it can distinguish on-sale from
    absent but says nothing about drafts. Inventing a draft state from
    no evidence would be worse than leaving it to the user.
    """
    return "live" if url and url.strip() else "missing"


def normalize_format(value: str) -> str:
    """Canonical lowercase format name.

    Raises:
        ValueError: For anything outside :data:`FORMATS`.
    """
    candidate = (value or "").strip().lower()
    if candidate not in FORMATS:
        raise ValueError(f"unknown format: {value!r} (expected one of {', '.join(FORMATS)})")
    return candidate


def normalize_status(value: str) -> str:
    """Canonical lowercase status name.

    Raises:
        ValueError: For anything outside :data:`STATUSES`.
    """
    candidate = (value or "").strip().lower()
    if candidate not in STATUSES:
        raise ValueError(f"unknown status: {value!r} (expected one of {', '.join(STATUSES)})")
    return candidate


def gaps_of(entries: list[FormatEntry]) -> list[str]:
    """Formats that are not on sale, in canonical order."""
    by_format = {entry.book_format: entry for entry in entries}
    return [
        book_format
        for book_format in FORMATS
        if book_format in by_format and by_format[book_format].status in GAP_STATUSES
    ]


def _clean(value: object) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def row_from_csv_mapping(mapping: dict[str, object]) -> PortfolioCsvRow:
    """Normalise one ``csv.DictReader`` mapping into a portfolio row.

    Empty cells become None rather than empty strings, so "no branch
    recorded" and "branch recorded as nothing" stop being different.
    """
    return PortfolioCsvRow(
        title=(_clean(mapping.get("Title")) or ""),
        author=_clean(mapping.get("Author")),
        language=_clean(mapping.get("Language")),
        status=_clean(mapping.get("Status")),
        github_url=_clean(mapping.get("GitHub_URL")),
        github_branch=_clean(mapping.get("GitHub_Branch")),
        universal_link=_clean(mapping.get("Universal_Link")),
        links={
            book_format: _clean(mapping.get(column))
            for book_format, column in CSV_LINK_COLUMN_BY_FORMAT.items()
        },
    )
