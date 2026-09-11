#!/usr/bin/env python3
"""Seed the portfolio board from the author's books-list CSV (#782).

The portfolio truth used to live in a hand-maintained CSV beside the
manuscripts. This script is the one-way door into Bibliogon: it parses
that file and hands the rows to
``POST /api/promotion/portfolio/import``, which matches each row to a
book and applies it idempotently. After the seed run Bibliogon is the
source of truth; the CSV becomes an export format.

The script is transport only - matching, idempotency and the report
shape live in the plugin service where a database is available.

    make import-portfolio-check CSV=/path/to/books-list.csv   # dry run
    make import-portfolio CSV=/path/to/books-list.csv         # apply

A dry run writes nothing. Rows the backend could not match to a book
make the run exit non-zero: an unmatched row means the CSV and the
library have drifted, which is exactly what this check is for.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
IMPORT_PATH = "/api/promotion/portfolio/import"
REQUIRED_COLUMNS = (
    "Title",
    "Author",
    "Language",
    "Status",
    "GitHub_URL",
    "GitHub_Branch",
    "eBook",
    "Paperback",
    "Hardcover",
    "Universal_Link",
)

PostCallable = Callable[[str, dict], dict]


class CatalogError(Exception):
    """The CSV cannot be read or is missing required columns."""


class TransportError(Exception):
    """The backend could not be reached or refused the request."""

    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail
        super().__init__(f"HTTP {status}: {detail}")


def load_rows(csv_path: Path) -> list[dict]:
    """Parse the CSV into API payload rows.

    Args:
        csv_path: Path to a ``books-list.csv``-shaped file.

    Returns:
        One dict per row, in the shape the import endpoint expects.

    Raises:
        CatalogError: Empty file, or a missing required column.
    """
    from bibliogon_promotion.portfolio import row_from_csv_mapping

    try:
        text = csv_path.read_text(encoding="utf-8")
    except OSError as error:
        raise CatalogError(f"Cannot read {csv_path}: {error}") from error

    reader = csv.DictReader(text.splitlines())
    if not reader.fieldnames:
        raise CatalogError(f"{csv_path} is empty - no header row.")
    missing = [column for column in REQUIRED_COLUMNS if column not in reader.fieldnames]
    if missing:
        raise CatalogError(f"{csv_path} is missing required column(s): {', '.join(missing)}")

    rows = []
    for mapping in reader:
        parsed = row_from_csv_mapping(mapping)
        if not parsed.title:
            continue
        rows.append(
            {
                "title": parsed.title,
                "author": parsed.author,
                "language": parsed.language,
                "status": parsed.status,
                "github_url": parsed.github_url,
                "github_branch": parsed.github_branch,
                "universal_link": parsed.universal_link,
                "links": parsed.links,
            }
        )
    if not rows:
        raise CatalogError(f"{csv_path} contains no usable rows.")
    return rows


def http_post(timeout: float) -> PostCallable:
    """Build the urllib-based POST transport."""

    def post(endpoint: str, payload: dict) -> dict:
        if not endpoint.startswith(("http://", "https://")):
            raise TransportError(0, f"Only http(s) base URLs are supported, got: {endpoint}")
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(  # nosec B310 - scheme guarded above
                request, timeout=timeout
            ) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            raise TransportError(error.code, _extract_detail(body)) from error
        except urllib.error.URLError as error:
            raise TransportError(0, f"Backend unreachable: {error.reason}") from error

    return post


def _extract_detail(body: str) -> str:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return body[:500]
    detail = parsed.get("detail", body[:500])
    return detail if isinstance(detail, str) else json.dumps(detail)[:500]


def render_report(report: dict) -> str:
    """Human-readable summary of one import run."""
    mode = "dry run - nothing written" if report.get("dry_run") else "applied"
    lines = [
        f"portfolio import ({mode})",
        f"  rows:      {report.get('total_rows', 0)}",
        f"  matched:   {report.get('matched', 0)} "
        f"(repo {report.get('matched_by_repo', 0)}, title {report.get('matched_by_title', 0)})",
        f"  changed:   {report.get('changed', 0)}",
        f"  unchanged: {report.get('unchanged', 0)}",
    ]
    unmatched = report.get("unmatched") or []
    lines.append(f"  unmatched: {len(unmatched)}")
    for title in unmatched:
        lines.append(f"    - {title}")
    return "\n".join(lines)


def exit_code(report: dict) -> int:
    """Non-zero when a row could not be matched - that is CSV drift."""
    return 1 if report.get("unmatched") else 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--csv", required=True, help="Path to books-list.csv")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Bibliogon backend base URL")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would change without writing anything",
    )
    parser.add_argument("--timeout", type=float, default=60.0, help="Per-request timeout")
    return parser


def main(argv: list[str] | None = None, poster: PostCallable | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    post = poster or http_post(args.timeout)

    try:
        rows = load_rows(Path(args.csv))
    except CatalogError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    endpoint = urllib.parse.urljoin(args.base_url.rstrip("/") + "/", IMPORT_PATH.lstrip("/"))
    try:
        report = post(endpoint, {"rows": rows, "dry_run": args.dry_run})
    except TransportError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    print(render_report(report))
    return exit_code(report)


if __name__ == "__main__":
    sys.exit(main())
