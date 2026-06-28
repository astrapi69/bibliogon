#!/usr/bin/env python3
"""Bump the version-header line in the gated documentation files.

The release workflow (.github/workflows/release.yml) runs this after the
canonical ``backend/pyproject.toml`` bump + ``make sync-versions`` so the
five doc files that carry a human-readable version header stay in lock-step
with the release.

The set of files and the regex that locates each header is owned by
``verify_docs_completeness.py`` (``VERSION_HEADER_PATTERNS``) -- the
release-time gate that FAILS if any of these headers drifts from the
canonical version. This script imports that same mapping so the writer and
the verifier can never disagree about which files/patterns are in scope.

Each pattern captures the version digits in group 1; this script rewrites
that captured substring to the new version, leaving the surrounding header
text untouched. The CLAUDE.md prose summary block is intentionally NOT
rewritten here -- only its ``**Version:** X.Y.Z`` number is bumped (which is
all the gate checks); the prose summary is the manual post-release step.

Usage:
    python3 scripts/update_version_headers.py 0.59.0

Exits:
    0 -- every gated file's header was found and now carries the new version
    1 -- a gated file is missing, or its header pattern did not match
         (a release must stop here rather than ship a drifted header)
    2 -- bad usage (missing/invalid version argument)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from verify_docs_completeness import VERSION_HEADER_PATTERNS  # noqa: E402

_VERSION_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")


def update_file(rel: str, pattern: str, version: str) -> bool:
    """Rewrite the captured version in ``rel``'s header to ``version``.

    Args:
        rel: Repo-relative path of the gated documentation file.
        pattern: Regex from VERSION_HEADER_PATTERNS; group 1 is the version.
        version: The new X.Y.Z version string.

    Returns:
        True when the header was found and the file now carries ``version``.
        False when the file is missing or the pattern did not match.
    """
    path = REPO / rel
    if not path.exists():
        print(f"  MISSING: {rel}")
        return False

    text = path.read_text("utf-8")

    def _replace(match: re.Match[str]) -> str:
        return match.group(0).replace(match.group(1), version, 1)

    new_text, count = re.subn(pattern, _replace, text, count=1)
    if count == 0:
        print(f"  NO MATCH: {rel} (pattern: {pattern})")
        return False

    if new_text != text:
        path.write_text(new_text, "utf-8")
        print(f"  updated: {rel} -> v{version}")
    else:
        print(f"  already at v{version}: {rel}")
    return True


def main(argv: list[str]) -> int:
    if len(argv) != 1 or not _VERSION_RE.match(argv[0]):
        print("usage: update_version_headers.py <X.Y.Z>", file=sys.stderr)
        return 2

    version = argv[0]
    print(f"Updating doc version headers to v{version}")
    ok = True
    for rel, pattern in VERSION_HEADER_PATTERNS.items():
        ok = update_file(rel, pattern, version) and ok

    if not ok:
        print("\nERROR: at least one gated header could not be updated.", file=sys.stderr)
        return 1
    print("All gated version headers updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
