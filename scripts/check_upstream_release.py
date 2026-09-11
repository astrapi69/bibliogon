#!/usr/bin/env python3
"""check_upstream_release.py — report when the pinned learn-content-engine
release is behind the latest published one.

Why this exists
---------------
``check_learnset_schema_drift.py`` (#775) compares the vendored artifacts
against the **pinned** engine version. That catches a hand-edited schema,
but it says nothing when upstream publishes a NEW release: the pin simply
goes stale in silence, and plugin-learnset keeps validating against an
old contract.

A newer upstream release is NOT a failure - the pin is deliberate, and an
upstream publish must never redden an unrelated nightly. This reports the
gap so the nightly workflow can open a single deduplicated tracking issue
(#779).

Output contract
---------------
Prints a human-readable summary. With ``--github-output`` it also appends
machine-readable keys to the file named by ``$GITHUB_OUTPUT``:

- ``pinned``    the version the vendored copies came from
- ``latest``    the newest version published on npm
- ``behind``    ``true`` when latest > pinned, else ``false``
- ``title``     the issue title to open when behind (stable per version,
                so the workflow can dedupe on it)

Exit code is 0 unless the comparison itself could not be made (npm
unreachable, malformed version), which is a real failure worth seeing.

Usage::

    python3 scripts/check_upstream_release.py
    python3 scripts/check_upstream_release.py --github-output
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PACKAGE_NAME = "learn-content-engine"
VENDOR_DIR = REPO_ROOT / "plugins" / "bibliogon-plugin-learnset" / "bibliogon_learnset" / "vendor"
VERSION_FILE = VENDOR_DIR / "engine-version.txt"


def pinned_version() -> str:
    """Engine version the vendored copies were taken from."""
    return VERSION_FILE.read_text(encoding="utf-8").strip()


def latest_version() -> str:
    """Newest version published on npm."""
    result = subprocess.run(
        ["npm", "view", PACKAGE_NAME, "version", "--json"],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout).strip()


def parse(version: str) -> tuple[int, ...]:
    """Numeric release tuple, pre-release suffixes dropped.

    ``1.10.0`` must sort ABOVE ``1.9.0``, so a string compare will not do.
    """
    core = version.strip().lstrip("v").split("+")[0].split("-")[0]
    parts = []
    for chunk in core.split("."):
        if not chunk.isdigit():
            raise ValueError(f"unparseable version component in {version!r}")
        parts.append(int(chunk))
    if not parts:
        raise ValueError(f"unparseable version {version!r}")
    return tuple(parts)


def is_behind(pinned: str, latest: str) -> bool:
    return parse(latest) > parse(pinned)


def issue_title(latest: str) -> str:
    """Stable per-version title so the same release never files twice."""
    return f"{PACKAGE_NAME} {latest} available, check schema bump"


def emit_github_output(pairs: dict[str, str]) -> None:
    target = os.environ.get("GITHUB_OUTPUT")
    if not target:
        print("GITHUB_OUTPUT is not set; skipping machine-readable output")
        return
    with open(target, "a", encoding="utf-8") as handle:
        for key, value in pairs.items():
            handle.write(f"{key}={value}\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--github-output",
        action="store_true",
        help="append pinned/latest/behind/title to $GITHUB_OUTPUT",
    )
    args = parser.parse_args(argv)

    pinned = pinned_version()
    try:
        latest = latest_version()
    except (subprocess.CalledProcessError, json.JSONDecodeError, OSError) as exc:
        print(f"ERROR: could not read the latest {PACKAGE_NAME} version: {exc}")
        return 1

    try:
        behind = is_behind(pinned, latest)
    except ValueError as exc:
        print(f"ERROR: {exc}")
        return 1

    print(f"{PACKAGE_NAME} pin: {pinned}")
    print(f"{PACKAGE_NAME} latest published: {latest}")
    if behind:
        print(f"BEHIND: {issue_title(latest)}")
        print(
            "Not a failure. Re-vendor from the new tag and bump "
            "vendor/engine-version.txt when the schemas actually changed."
        )
    else:
        print("Pin is current.")

    if args.github_output:
        emit_github_output(
            {
                "pinned": pinned,
                "latest": latest,
                "behind": "true" if behind else "false",
                "title": issue_title(latest),
            }
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
