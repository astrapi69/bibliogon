#!/usr/bin/env python3
"""Report whether learn-content-engine has published a newer release (#779).

The drift guard (``check_learnset_schema_drift.py``, #775) compares the
vendored artifacts against the version they were taken from, so it only
detects local tampering. It stays green forever while the pin quietly
goes stale. This watcher answers the complementary question - has
upstream moved? - and is deliberately advisory: it always exits 0 and
lets the caller open an issue, because a release published by someone
else is not a reason to redden a build.

Run nightly:

    python3 scripts/check_learnset_upstream_release.py

Under GitHub Actions it also writes ``newer``, ``latest`` and ``pinned``
to ``$GITHUB_OUTPUT`` so a following step can file the issue.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

PACKAGE = "learn-content-engine"

REPO_ROOT = Path(__file__).resolve().parent.parent
PIN_FILE = (
    REPO_ROOT
    / "plugins"
    / "bibliogon-plugin-learnset"
    / "bibliogon_learnset"
    / "vendor"
    / "engine-version.txt"
)

_RELEASE_RE = re.compile(r"^(\d+)(?:\.(\d+))?(?:\.(\d+))?$")


class CompletedLike(Protocol):
    returncode: int
    stdout: str
    stderr: str


Runner = Callable[..., CompletedLike]


def _default_runner(argv: list[str], **kwargs) -> CompletedLike:
    return subprocess.run(argv, capture_output=True, text=True, check=False, **kwargs)


def parse_version(version: str) -> tuple[int, ...] | None:
    """Parse a plain release version into comparable integer segments.

    Args:
        version: Version string, e.g. ``"0.23.1"``.

    Returns:
        The numeric segments, or None for anything that is not a plain
        release (a prerelease such as ``0.24.0-rc.1``, or a build tag).
    """
    match = _RELEASE_RE.match(version.strip())
    if not match:
        return None
    return tuple(int(segment) for segment in match.groups() if segment is not None)


def is_newer(latest: str, pinned: str) -> bool:
    """Whether ``latest`` is a plain release above ``pinned``.

    Prereleases never count: bumping the pin to a release candidate is
    not something the nightly should suggest.
    """
    latest_parts = parse_version(latest)
    pinned_parts = parse_version(pinned)
    if latest_parts is None or pinned_parts is None:
        return False
    width = max(len(latest_parts), len(pinned_parts))
    padded_latest = latest_parts + (0,) * (width - len(latest_parts))
    padded_pinned = pinned_parts + (0,) * (width - len(pinned_parts))
    return padded_latest > padded_pinned


def pinned_version() -> str:
    """The engine version the vendored artifacts were taken from."""
    return PIN_FILE.read_text(encoding="utf-8").strip()


def latest_published_version(runner: Runner = _default_runner) -> str:
    """Ask the npm registry for the package's current version.

    Raises:
        RuntimeError: When ``npm view`` fails, with its stderr attached.
    """
    result = runner(["npm", "view", PACKAGE, "version"])
    if result.returncode != 0:
        raise RuntimeError(f"npm view {PACKAGE} failed: {result.stderr.strip()}")
    return result.stdout.strip()


ISSUE_LABEL = "dependencies"


def issue_title(latest: str) -> str:
    """Stable per-version title - the dedup key for the bump issue."""
    return f"chore(learnset): {PACKAGE} {latest} available, check schema bump"


def _issue_body(latest: str, pinned: str) -> str:
    return (
        f"The nightly watcher found a newer `{PACKAGE}` release.\n\n"
        f"- pinned: `{pinned}`\n"
        f"- latest: `{latest}`\n\n"
        "The vendored schemas and validator under "
        "`plugins/bibliogon-plugin-learnset/bibliogon_learnset/vendor/` still "
        f"match `{pinned}` (the drift guard is green), so nothing is broken. "
        "Check the upstream changelog for schema changes, then either bump "
        "the pin plus the vendored files, or close this issue to decline the "
        "bump - a declined version is never filed again."
    )


def find_existing_issue(latest: str, runner: Runner = _default_runner) -> int | None:
    """Number of an existing issue for this version, open OR closed.

    Closed counts: a closed issue means the bump was considered and
    declined, and re-filing it every night would be exactly the spam
    this watcher is supposed to avoid.
    """
    wanted = issue_title(latest)
    result = runner(
        [
            "gh",
            "issue",
            "list",
            "--state",
            "all",
            "--search",
            f'"{wanted}" in:title',
            "--json",
            "number,title",
            "--limit",
            "50",
        ]
    )
    if result.returncode != 0:
        print(f"WARNING: could not list issues: {result.stderr.strip()}", file=sys.stderr)
        return None
    try:
        issues = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as error:
        print(f"WARNING: unreadable gh output: {error}", file=sys.stderr)
        return None
    for issue in issues:
        if issue.get("title") == wanted:
            return int(issue["number"])
    return None


def plan_issue(
    *, newer: bool, latest: str, pinned: str, existing_issue: int | None
) -> list[list[str]]:
    """gh commands needed for the current pin-vs-registry state."""
    if not newer or existing_issue is not None:
        return []
    return [
        [
            "issue",
            "create",
            "--title",
            issue_title(latest),
            "--label",
            ISSUE_LABEL,
            "--body",
            _issue_body(latest, pinned),
        ]
    ]


def _write_github_output(latest: str, pinned: str, newer: bool) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as handle:
        handle.write(f"newer={'true' if newer else 'false'}\n")
        handle.write(f"latest={latest}\n")
        handle.write(f"pinned={pinned}\n")


def main(argv: list[str] | None = None, runner: Runner = _default_runner) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--latest",
        help="Skip the registry lookup and compare against this version (tests, dry runs)",
    )
    parser.add_argument(
        "--open-issue",
        action="store_true",
        help="File a deduplicated issue when a newer release is available",
    )
    args = parser.parse_args(argv)

    pinned = pinned_version()
    latest = args.latest if args.latest else latest_published_version(runner=runner)
    newer = is_newer(latest, pinned)

    print(f"{PACKAGE} pinned: {pinned}")
    print(f"{PACKAGE} latest: {latest}")
    if newer:
        print(f"A newer release is available: {pinned} -> {latest}")
        print("Check whether the vendored schemas need a bump.")
    else:
        print("Pin is up to date.")

    _write_github_output(latest, pinned, newer)

    if args.open_issue:
        existing = find_existing_issue(latest, runner=runner) if newer else None
        for command in plan_issue(
            newer=newer, latest=latest, pinned=pinned, existing_issue=existing
        ):
            result = runner(["gh", *command])
            if result.returncode != 0:
                print(f"WARNING: gh issue create failed: {result.stderr.strip()}", file=sys.stderr)
            else:
                print(result.stdout.strip())

    return 0


if __name__ == "__main__":
    sys.exit(main())
