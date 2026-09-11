"""Bulk-import manuscript-repo books against a running Bibliogon backend.

Stage 1 of the bulk book-import plan (#758): reads a YAML catalog of
write-book-template git repositories, asks the backend which of them
are already imported (POST /api/import/detect/git carries the
server-side duplicate check via BookImportSource), and imports only
the missing ones (POST /api/import/execute). Every repo is processed
in isolation: one failing clone never stops the rest.

Catalog format (see scripts/book-catalog.example.yaml)::

    books:
      - https://github.com/astrapi69/some-book
      - repo_url: https://github.com/astrapi69/other-book
        git_adoption: start_fresh   # optional, default adopt_with_remote
      - repo_url: https://github.com/astrapi69/translated-book
        branch: main-de             # optional, default: remote default branch

Usage::

    cd backend && poetry run python ../scripts/bulk_import_books.py \\
        --catalog ../book-catalog.yaml [--dry-run] \\
        [--base-url http://localhost:8000/api] [--timeout 600]

``--dry-run`` performs the detect (clone + duplicate check) per repo
and reports what WOULD be imported, but cancels every staging via
execute(duplicate_action=cancel) so nothing is created. That is the
"are all catalog books present?" check.

Exit code 0 when every repo is imported or already present; 1 when
any repo errored (missing repo, non-WBT layout, backend down).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import yaml

VALID_GIT_ADOPTIONS = ("start_fresh", "adopt_with_remote", "adopt_without_remote")
_BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")
DEFAULT_BASE_URL = "http://localhost:8000/api"
DEFAULT_TIMEOUT_SECONDS = 600.0

PostCallable = Callable[[str, dict], dict]


class CatalogError(Exception):
    """The catalog file is malformed (missing repo_url, duplicates, ...)."""


class TransportError(Exception):
    """An HTTP call to the backend failed.

    Attributes:
        status: HTTP status code, or 0 for connection-level failures.
        detail: Human-readable failure description.
    """

    def __init__(self, status: int, detail: str) -> None:
        self.status = status
        self.detail = detail
        super().__init__(f"HTTP {status}: {detail}")


@dataclass(frozen=True)
class CatalogEntry:
    """One repo (or one branch of a repo) the catalog wants present
    as a book. ``branch=None`` clones the remote's default branch;
    language-variant books living on branches like ``main-de`` set
    it explicitly (#760)."""

    repo_url: str
    git_adoption: str = "adopt_with_remote"
    branch: str | None = None


@dataclass
class RepoOutcome:
    """Per-repo processing outcome for the final report.

    ``status`` is one of ``imported`` / ``present`` / ``would_import``
    / ``error``.
    """

    repo_url: str
    status: str
    detail: str = ""
    book_id: str | None = None


def load_catalog(catalog_path: Path) -> list[CatalogEntry]:
    """Parse the YAML catalog into validated entries.

    Accepts plain-string entries (just the URL) and mapping entries
    (``repo_url`` + optional ``git_adoption`` + optional ``branch``).
    Identity is (repo_url, branch): the same URL may appear once per
    branch, which is how language-variant books share one repo.

    Raises:
        CatalogError: On a missing/empty ``books`` list, an entry
            without ``repo_url``, an unknown ``git_adoption`` value,
            an invalid branch ref, or a duplicate (URL, branch) pair.
    """
    parsed = yaml.safe_load(catalog_path.read_text(encoding="utf-8"))
    raw_books = (parsed or {}).get("books")
    if not raw_books:
        raise CatalogError(f"Catalog {catalog_path} has an empty or missing 'books' list.")

    entries: list[CatalogEntry] = []
    seen_sources: set[tuple[str, str | None]] = set()
    for position, raw_entry in enumerate(raw_books, start=1):
        entry = _parse_entry(raw_entry, position)
        source_key = (entry.repo_url, entry.branch)
        if source_key in seen_sources:
            raise CatalogError(
                f"Duplicate repo_url+branch in catalog: {entry.repo_url}"
                f" (branch {entry.branch or '<default>'})"
            )
        seen_sources.add(source_key)
        entries.append(entry)
    return entries


def _parse_entry(raw_entry: object, position: int) -> CatalogEntry:
    if isinstance(raw_entry, str):
        if not raw_entry.strip():
            raise CatalogError(f"Entry #{position}: blank repo_url.")
        return CatalogEntry(repo_url=raw_entry.strip())
    if isinstance(raw_entry, dict):
        repo_url = str(raw_entry.get("repo_url") or "").strip()
        if not repo_url:
            raise CatalogError(f"Entry #{position}: mapping entries need a 'repo_url' key.")
        git_adoption = raw_entry.get("git_adoption", "adopt_with_remote")
        if git_adoption not in VALID_GIT_ADOPTIONS:
            raise CatalogError(
                f"Entry #{position}: git_adoption {git_adoption!r} is not one of "
                f"{VALID_GIT_ADOPTIONS}."
            )
        branch = raw_entry.get("branch")
        if branch is not None:
            branch = str(branch).strip()
            if not _BRANCH_RE.match(branch):
                raise CatalogError(
                    f"Entry #{position}: branch {branch!r} is not a valid git ref "
                    "(must start with an alphanumeric character)."
                )
        return CatalogEntry(repo_url=repo_url, git_adoption=git_adoption, branch=branch)
    raise CatalogError(f"Entry #{position}: expected a URL string or a mapping, got {raw_entry!r}.")


def http_post(base_timeout: float) -> PostCallable:
    """Build the real urllib-based POST transport.

    Args:
        base_timeout: Per-request timeout in seconds (clones are slow).

    Returns:
        A callable raising :class:`TransportError` on any failure.
    """

    def post(endpoint: str, payload: dict) -> dict:
        if not endpoint.startswith(("http://", "https://")):
            raise TransportError(0, f"Only http(s) base URLs are supported, got: {endpoint}")
        request_body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            endpoint,
            data=request_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            response_ctx = urllib.request.urlopen(  # nosec B310 - scheme guarded above
                request, timeout=base_timeout
            )
            with response_ctx as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise TransportError(exc.code, _extract_detail(error_body)) from exc
        except urllib.error.URLError as exc:
            raise TransportError(0, f"Backend unreachable: {exc.reason}") from exc

    return post


def _extract_detail(error_body: str) -> str:
    try:
        parsed = json.loads(error_body)
    except json.JSONDecodeError:
        return error_body[:500]
    detail = parsed.get("detail", error_body[:500])
    return detail if isinstance(detail, str) else json.dumps(detail)[:500]


def process_entry(
    entry: CatalogEntry,
    base_url: str,
    dry_run: bool,
    post: PostCallable,
) -> RepoOutcome:
    """Detect one repo and import, skip, or cancel it.

    The detect call clones + duplicate-checks server-side. A found
    duplicate (and every dry-run detection) is cancelled so the
    staging directory is dropped; only a real run on a missing book
    executes with ``duplicate_action=create``.
    """
    detect_payload: dict = {"git_url": entry.repo_url}
    if entry.branch:
        detect_payload["branch"] = entry.branch
    try:
        detect_response = post(f"{base_url}/import/detect/git", detect_payload)
    except TransportError as exc:
        return RepoOutcome(repo_url=entry.repo_url, status="error", detail=exc.detail)

    temp_ref = detect_response["temp_ref"]
    duplicate = detect_response.get("duplicate", {})
    if duplicate.get("found") or dry_run:
        cancel_outcome = _cancel_staging(entry, base_url, temp_ref, duplicate, dry_run, post)
        if cancel_outcome is not None:
            return cancel_outcome

    execute_payload: dict = {"temp_ref": temp_ref, "duplicate_action": "create"}
    if _adoption_applicable(entry.git_adoption, detect_response):
        execute_payload["git_adoption"] = entry.git_adoption
    try:
        execute_response = post(f"{base_url}/import/execute", execute_payload)
    except TransportError as exc:
        return RepoOutcome(repo_url=entry.repo_url, status="error", detail=exc.detail)
    return RepoOutcome(
        repo_url=entry.repo_url,
        status="imported",
        book_id=execute_response.get("book_id"),
    )


def _adoption_applicable(git_adoption: str, detect_response: dict) -> bool:
    """Whether the execute call may carry the adoption choice.

    The backend rejects ``git_adoption=adopt_*`` with 400 when the
    detected source has no ``.git/`` directory; in that case the
    field is omitted, which the backend treats as ``start_fresh``.
    """
    if not git_adoption.startswith("adopt"):
        return bool(git_adoption)
    detected = detect_response.get("detected") or {}
    git_repo = detected.get("git_repo") or {}
    return bool(git_repo.get("present"))


def _cancel_staging(
    entry: CatalogEntry,
    base_url: str,
    temp_ref: str,
    duplicate: dict,
    dry_run: bool,
    post: PostCallable,
) -> RepoOutcome | None:
    try:
        post(
            f"{base_url}/import/execute",
            {"temp_ref": temp_ref, "duplicate_action": "cancel"},
        )
    except TransportError as exc:
        return RepoOutcome(repo_url=entry.repo_url, status="error", detail=exc.detail)
    if duplicate.get("found"):
        existing_title = duplicate.get("existing_book_title") or "?"
        existing_id = duplicate.get("existing_book_id")
        return RepoOutcome(
            repo_url=entry.repo_url,
            status="present",
            detail=f"already imported as {existing_title!r}",
            book_id=existing_id,
        )
    if dry_run:
        return RepoOutcome(repo_url=entry.repo_url, status="would_import")
    return None


def run_bulk_import(
    entries: list[CatalogEntry],
    base_url: str,
    dry_run: bool,
    post: PostCallable,
    log: Callable[[str], None] = lambda line: None,
) -> list[RepoOutcome]:
    """Process every catalog entry in order with per-repo isolation."""
    outcomes: list[RepoOutcome] = []
    for position, entry in enumerate(entries, start=1):
        log(f"[{position}/{len(entries)}] {entry.repo_url} ...")
        outcome = process_entry(entry, base_url=base_url, dry_run=dry_run, post=post)
        log(f"    -> {outcome.status}" + (f" ({outcome.detail})" if outcome.detail else ""))
        outcomes.append(outcome)
    return outcomes


def render_report(outcomes: list[RepoOutcome]) -> str:
    """Build the human-readable summary table + counts."""
    counts = {"imported": 0, "present": 0, "would_import": 0, "error": 0}
    lines = ["", "=== Bulk import report ==="]
    for outcome in outcomes:
        counts[outcome.status] = counts.get(outcome.status, 0) + 1
        suffix = f"  ({outcome.detail})" if outcome.detail else ""
        book_ref = f"  [{outcome.book_id}]" if outcome.book_id else ""
        lines.append(f"{outcome.status:>13}  {outcome.repo_url}{book_ref}{suffix}")
    lines.append(
        f"total: {len(outcomes)}  imported: {counts['imported']}  "
        f"present: {counts['present']}  would import: {counts['would_import']}  "
        f"errors: {counts['error']}"
    )
    return "\n".join(lines)


def exit_code(outcomes: list[RepoOutcome]) -> int:
    """Return 1 when any repo errored, else 0."""
    return 1 if any(outcome.status == "error" for outcome in outcomes) else 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--catalog", required=True, type=Path, help="Path to book-catalog.yaml")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Backend API base URL")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Detect + report only; cancel every staging, create nothing",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Per-request timeout in seconds (clones can be slow)",
    )
    return parser


@dataclass
class _CliIo:
    out: Callable[[str], None] = field(default=lambda line: print(line))


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    io = _CliIo()
    try:
        entries = load_catalog(args.catalog)
    except (CatalogError, OSError, yaml.YAMLError) as exc:
        io.out(f"Catalog error: {exc}")
        return 1
    io.out(f"Catalog: {len(entries)} repos, backend {args.base_url}, dry_run={args.dry_run}")
    outcomes = run_bulk_import(
        entries,
        base_url=args.base_url.rstrip("/"),
        dry_run=args.dry_run,
        post=http_post(args.timeout),
        log=io.out,
    )
    io.out(render_report(outcomes))
    return exit_code(outcomes)


if __name__ == "__main__":
    sys.exit(main())
