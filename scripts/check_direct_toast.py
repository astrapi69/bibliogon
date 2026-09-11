#!/usr/bin/env python3
"""check_direct_toast.py — flag failure-level react-toastify calls that
bypass the central ``notify`` wrapper.

Why this exists
---------------
``frontend/src/utils/platform/notify.ts`` is the single choke point for
user-facing failure toasts. It carries three behaviours that a raw
``toast.error`` call cannot:

- the backendless-offline downgrade (an ``/api`` call rejected by the
  offline guard is expected, not a fault, so it must not raise a red
  toast),
- the backend-unreachable suppression (#765) — during an outage the
  persistent banner is the ONE surface; per-call red toasts are noise,
- the "Issue melden" report button + the diagnostic event recorder.

A component calling ``toast.error`` directly opts out of all three. That
is the #769 bug class: four components still raised red toasts next to
the outage banner.

What it flags
-------------
``toast.error(...)`` and ``toast.warning(...)`` (also ``toast.warn``) in
``frontend/src`` ``.ts`` / ``.tsx`` files. Failure-level only:
``toast.info`` / ``toast.success`` / ``toast.dismiss`` are NOT linted,
because they carry no outage semantics and the undo-toast pattern in
``KeywordInput`` legitimately owns its own toast id.

Exempt:

- ``notify.ts`` itself — it IS the wrapper.
- Test files (``*.test.ts`` / ``*.test.tsx``), which mock the module.
- Comments (``//`` line comments and ``/* */`` blocks).

Usage::

    python3 scripts/check_direct_toast.py             # report, exit 0
    python3 scripts/check_direct_toast.py --enforce   # exit 1 on any finding

Stdlib-only (re + pathlib + argparse).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

# The wrapper itself is the one legitimate caller.
ALLOWLIST = {
    "utils/platform/notify.ts",
}

# toast.error / toast.warning / toast.warn. Whitespace-tolerant across the
# member access so a formatter-wrapped ``toast\n  .error(`` cannot slip
# through a line-oriented scan.
CALL_RE = re.compile(r"\btoast\s*\.\s*(error|warning|warn)\s*\(")

LINE_COMMENT_RE = re.compile(r"//.*$", re.MULTILINE)
BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)


def strip_comments(source: str) -> str:
    """Blank out comment regions, preserving line numbering.

    Newlines are kept so a finding's reported line number still matches
    the file on disk.
    """

    def blank(match: re.Match[str]) -> str:
        return re.sub(r"[^\n]", " ", match.group(0))

    without_blocks = BLOCK_COMMENT_RE.sub(blank, source)
    return LINE_COMMENT_RE.sub(blank, without_blocks)


def iter_source_files() -> list[Path]:
    files: list[Path] = []
    for pattern in ("*.ts", "*.tsx"):
        files.extend(FRONTEND_SRC.rglob(pattern))
    return sorted(f for f in files if ".test." not in f.name)


def find_violations() -> list[tuple[str, int, str]]:
    """Return ``(relative_path, line_number, line_text)`` per violation."""
    findings: list[tuple[str, int, str]] = []
    for path in iter_source_files():
        rel = path.relative_to(FRONTEND_SRC).as_posix()
        if rel in ALLOWLIST:
            continue
        source = path.read_text(encoding="utf-8")
        if "toast" not in source:
            continue
        stripped = strip_comments(source)
        lines = source.splitlines()
        for match in CALL_RE.finditer(stripped):
            number = stripped.count("\n", 0, match.start()) + 1
            text = lines[number - 1].strip() if number <= len(lines) else match.group(0)
            findings.append((rel, number, text))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="exit 1 when a direct failure-level toast call is found",
    )
    args = parser.parse_args()

    findings = find_violations()
    if not findings:
        print("No direct failure-level toast calls found. notify is the single choke point.")
        return 0

    print("Direct failure-level react-toastify calls bypass notify (#769):")
    for rel, number, line in findings:
        print(f"  frontend/src/{rel}:{number}: {line}")
    print()
    print(f"{len(findings)} violation(s).")
    print(
        "Use notify.error / notify.warning from utils/platform/notify instead — "
        "a raw toast.error skips the offline downgrade, the backend-unreachable "
        "suppression and the report button."
    )
    return 1 if args.enforce else 0


if __name__ == "__main__":
    sys.exit(main())
