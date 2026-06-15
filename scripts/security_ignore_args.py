#!/usr/bin/env python3
"""Emit pip-audit ``--ignore-vuln`` arguments from ``.security-ignore.yml``.

The repository keeps the list of accepted / deferred security advisories in
``.security-ignore.yml`` at the repo root (the single source of truth). The
weekly security watcher (``.github/workflows/security-scan.yml``) and the
``make check-security`` target both call this script so the ignore list never
drifts between them.

The script prints a single line of shell-ready arguments, e.g.::

    --ignore-vuln CVE-2025-68616

so a caller can splice it into a pip-audit invocation::

    poetry run pip-audit --skip-editable $(python scripts/security_ignore_args.py)

A missing ``.security-ignore.yml`` is treated as "ignore nothing" (empty
output, exit 0). A malformed file fails loud (message on stderr, exit 1) so a
broken ignore list is visible rather than silently widening or narrowing the
accepted set.
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

IGNORE_FILE = Path(__file__).resolve().parent.parent / ".security-ignore.yml"


def build_ignore_args(ignore_file: Path) -> list[str]:
    """Build the ``--ignore-vuln`` argument list from the ignore file.

    Args:
        ignore_file: Path to the ``.security-ignore.yml`` document.

    Returns:
        A flat list alternating ``--ignore-vuln`` and the advisory id for
        every entry under the top-level ``ignored`` key. Empty when the file
        does not exist.

    Raises:
        ValueError: If the file exists but is not a mapping with an
            ``ignored`` list of entries that each carry an ``id``.
    """
    if not ignore_file.exists():
        return []

    document = yaml.safe_load(ignore_file.read_text(encoding="utf-8")) or {}
    if not isinstance(document, dict):
        raise ValueError(f"{ignore_file.name}: top level must be a mapping")

    entries = document.get("ignored", [])
    if not isinstance(entries, list):
        raise ValueError(f"{ignore_file.name}: 'ignored' must be a list")

    args: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict) or "id" not in entry:
            raise ValueError(f"{ignore_file.name}: every entry needs an 'id' field")
        args.extend(["--ignore-vuln", str(entry["id"])])
    return args


def main() -> int:
    """Print the ignore arguments, or fail loud on a malformed file."""
    try:
        args = build_ignore_args(IGNORE_FILE)
    except (ValueError, yaml.YAMLError) as exc:
        print(f"security_ignore_args: {exc}", file=sys.stderr)
        return 1
    print(" ".join(args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
