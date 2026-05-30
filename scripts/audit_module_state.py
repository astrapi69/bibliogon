#!/usr/bin/env python3
"""audit_module_state.py — inventory ``@lru_cache`` /
``@functools.lru_cache`` / ``@cache`` / ``@cached_property``
decorators in ``backend/app/`` and flag any not in the audited
allowlist.

Why this exists
---------------
The 2026-05-14 ``platform_schema`` regression broke 5
``test_publications.py`` tests via cross-file LRU cache poisoning:
the fake-schema result from the last test in
``test_platform_schema.py`` stayed in
``load_platform_schemas``'s LRU cache; the publications endpoint
served the stale fake dict to the next test file. Lessons-learned
"Module-level caches survive test boundaries" captures the
pattern.

The fix at the time was a bidirectional ``yield``-based
``cache_clear()`` fixture in ``test_platform_schema.py``. This
script is the drift-prevention follow-up: every cache decorator
added to ``backend/app/`` after this date MUST either:

1. Be added to the ``ALLOWLIST`` below with a brief audit note,
   AND have a paired bidirectional ``cache_clear()`` fixture in
   whichever test file monkeypatches its data source, OR
2. Be documented as "intentionally process-lifetime" with a
   reasoning comment AND verified that no test exercises a fake
   input through it.

Without this gate, a contributor who adds ``@lru_cache`` to a new
service function won't realise the cache survives test boundaries
until 5 unrelated tests fail in CI on the next push to main.
Filed by TEST-ISOLATION-MODULE-STATE-01 (2026-05-15).

Usage
-----
::

    python3 scripts/audit_module_state.py
        # lists every decorator + verdict; exit 0 if clean

    python3 scripts/audit_module_state.py --enforce
        # exits 1 on any decorator not in ALLOWLIST. Suitable for
        # pre-commit / CI.

Allowlist policy
----------------
Each allowlisted entry MUST include:

- the relative path + the function/property name (matched by
  regex against the decorator-line position),
- a brief audit note describing the cache's lifetime + the test
  fixture (if any) that handles the bidirectional clear.

Add to the allowlist when you ship a new cache AND have already
verified the test-isolation safety. Don't add a row pre-emptively
hoping the audit is correct — the whole point is that the script
forces the human verification step.

Stdlib-only (re + pathlib + argparse).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_APP = REPO_ROOT / "backend" / "app"

# Decorator detection. Catches the bare and dotted forms:
#   @lru_cache
#   @lru_cache(maxsize=N)
#   @functools.lru_cache
#   @cache
#   @functools.cache
#   @cached_property
DECORATOR_RE = re.compile(
    r"^\s*@(?:functools\.)?(lru_cache|cache|cached_property)\b",
    re.MULTILINE,
)

# Each allowlist entry: (relpath_pattern, function_name, audit_note).
# Use exact filename match; function name matches the next def/property
# after the decorator. The audit note is shown in --verbose output.
ALLOWLIST: list[tuple[str, str, str]] = [
    (
        "backend/app/services/platform_schema.py",
        "load_platform_schemas",
        "Cache lifetime: process. Tests in "
        "test_platform_schema.py monkeypatch _SCHEMA_PATH; the "
        "test file has an autouse yield-based fixture that calls "
        "cache_clear() before AND after each test, preventing "
        "cross-file cache poisoning. Verified 2026-05-15.",
    ),
    (
        "backend/app/services/book_type_registry.py",
        "load_book_types",
        "Cache lifetime: process. Tests in "
        "test_book_type_registry.py and test_book_types_endpoint.py "
        "monkeypatch _REGISTRY_PATH; both test files have an autouse "
        "yield-based fixture that calls cache_clear() before AND after "
        "each test, preventing cross-file cache poisoning. Verified "
        "2026-05-22 (BOOK-TYPES-SSOT-YAML-01).",
    ),
    (
        "backend/app/services/content_type_registry.py",
        "load_content_types",
        "Cache lifetime: process. Tests in "
        "test_content_type_registry.py and "
        "test_content_types_endpoint.py monkeypatch _REGISTRY_PATH; "
        "both test files have an autouse yield-based fixture that "
        "calls cache_clear() before AND after each test, preventing "
        "cross-file cache poisoning. Verified 2026-05-29 "
        "(ARTICLE-TYPES-SSOT-01, renamed to ContentType in same "
        "session for clarity per user direction — the column name "
        "``Article.content_type`` was already correct).",
    ),
    (
        "backend/app/services/story_entity_registry.py",
        "load_story_entity_types",
        "Cache lifetime: process. Tests in "
        "test_story_entity_registry.py read the real committed SSoT "
        "(no monkeypatched path) and have an autouse yield-based "
        "fixture that calls cache_clear() before AND after each test, "
        "preventing cross-file cache poisoning. Verified 2026-05-30 "
        "(STORY-BIBLE-PLUGIN-01).",
    ),
]


def find_function_name_after(text: str, decorator_end: int) -> str | None:
    """Return the name of the next ``def`` (or property assignment)
    following the decorator at byte offset ``decorator_end``. None if
    no def follows within 5 non-empty lines (defensive — a chained
    decorator stack is allowed)."""
    lines_after = text[decorator_end:].splitlines()
    non_empty_seen = 0
    for line in lines_after:
        stripped = line.strip()
        if not stripped:
            continue
        non_empty_seen += 1
        # Allow another @decorator on top
        if stripped.startswith("@"):
            continue
        m = re.match(r"(?:async\s+)?def\s+(\w+)", stripped)
        if m:
            return m.group(1)
        # ``cached_property`` decorates a property-shaped def too;
        # nothing else expected after a single decorator.
        if non_empty_seen >= 5:
            break
    return None


def scan_file(path: Path) -> list[tuple[int, str, str]]:
    """Return list of (line_no, decorator_name, function_name)."""
    text = path.read_text(encoding="utf-8")
    results: list[tuple[int, str, str]] = []
    for m in DECORATOR_RE.finditer(text):
        line_no = text[: m.start()].count("\n") + 1
        decorator = m.group(1)
        # End of the decorator's full line (including optional `(args)`).
        line_end = text.find("\n", m.end())
        if line_end < 0:
            line_end = len(text)
        fn = find_function_name_after(text, line_end + 1) or "<unknown>"
        results.append((line_no, decorator, fn))
    return results


def is_allowlisted(relpath: str, fn: str) -> str | None:
    """Return the audit note if (relpath, fn) is allowlisted; else None."""
    for allowed_path, allowed_fn, note in ALLOWLIST:
        if relpath == allowed_path and fn == allowed_fn:
            return note
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="exit 1 if any decorator is found outside the allowlist",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="print the audit note for each allowlisted entry too",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress the totals summary; only emit on unallowlisted",
    )
    args = parser.parse_args()

    if not BACKEND_APP.exists():
        print(f"error: {BACKEND_APP} not found", file=sys.stderr)
        return 2

    files = sorted(BACKEND_APP.glob("**/*.py"))
    total = 0
    not_allowlisted: list[tuple[str, int, str, str]] = []
    allowlisted: list[tuple[str, int, str, str, str]] = []
    for path in files:
        try:
            r = scan_file(path)
        except Exception as e:
            print(f"!! {path}: {e}", file=sys.stderr)
            continue
        for line_no, decorator, fn in r:
            total += 1
            relpath = str(path.relative_to(REPO_ROOT))
            note = is_allowlisted(relpath, fn)
            if note is None:
                not_allowlisted.append((relpath, line_no, decorator, fn))
            else:
                allowlisted.append((relpath, line_no, decorator, fn, note))

    if not args.quiet:
        print(f"Module-level cache decorators in backend/app/: {total}")
        print(f"  Allowlisted (audited): {len(allowlisted)}")
        print(f"  NOT allowlisted: {len(not_allowlisted)}")
        print()

    if args.verbose and allowlisted:
        print("Allowlisted entries:")
        for relpath, line_no, decorator, fn, note in allowlisted:
            print(f"  {relpath}:{line_no} @{decorator} {fn}")
            print(f"    {note}")
        print()

    if not_allowlisted:
        print("New / un-audited cache decorators:")
        for relpath, line_no, decorator, fn in not_allowlisted:
            print(f"  {relpath}:{line_no} @{decorator} {fn}")
        print()
        print(
            "Each unallowlisted entry needs an audit decision:\n"
            "  (a) test-exercised + needs bidirectional cache_clear() in\n"
            "      its test fixture, then add to ALLOWLIST.\n"
            "  (b) intentionally process-lifetime + no test monkeypatches\n"
            "      the input -> add to ALLOWLIST with a 'process-lifetime,\n"
            "      no test path' note.\n"
            "Background: .claude/rules/lessons-learned.md\n"
            "'Module-level caches survive test boundaries'.\n"
        )
        if args.enforce:
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
