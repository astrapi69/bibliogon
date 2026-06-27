#!/usr/bin/env python3
"""Regenerate the directory-size baseline (#466 god-folder ratchet).

Scans the source trees and records, per directory, the number of source
files directly inside it (non-recursive). Directories with more than
``MIN_TRACKED`` files are written to ``.dirsize-baseline`` (repo root).

The baseline is the ratchet floor: a directory may shrink (cleanup) but
must never grow past its recorded value (enforced by
``check_directory_size.py``). Run this after a cleanup PR to ratchet the
floor down, then commit the updated baseline.

The baseline + its companion ``.dirsize-allowlist`` are JSON bodies that
carry a leading ``#`` comment header (parity with ``.filesize-baseline``);
``load_commented_json`` strips those header lines before parsing, and
``write_baseline`` re-prepends the header on every rewrite.
"""

from __future__ import annotations

import json
from pathlib import Path

# Source roots to scan.
ROOTS = ["frontend/src", "backend/app"]
# Count files with these suffixes (direct children only).
SUFFIXES = {".ts", ".tsx", ".py"}
# Only track directories above this many files.
MIN_TRACKED = 10
BASELINE_PATH = Path(".dirsize-baseline")

# Header re-prepended on every baseline rewrite. Mirrors the in-file
# documentation style of ``.filesize-baseline`` so the God-Folder + God-File
# ratchets read identically.
BASELINE_HEADER = (
    "# .dirsize-baseline\n"
    "# God-Folder Ratchet Baseline\n"
    "# Max erlaubte Dateien pro Verzeichnis (flach, nicht rekursiv).\n"
    "# Geprueft von: scripts/check_directory_size.py (make check-dir-size)\n"
    "# CI-Job: Directory size ratchet (.github/workflows/ci.yml)\n"
    "# Begleitdatei: .dirsize-allowlist (aktive God-Folder mit Burndown-Ziel)\n"
    "# Werte nur nach Splits SENKEN, nie erhoehen (make update-dir-baseline).\n"
    "#\n"
)


def load_commented_json(path: Path) -> dict:
    """Parse a JSON body that may carry leading ``#`` comment lines.

    Lines whose first non-whitespace character is ``#`` are dropped before
    parsing, so the baseline/allowlist can carry a documentation header the
    same way ``.filesize-baseline`` does.
    """
    kept = [
        line
        for line in path.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("#")
    ]
    text = "\n".join(kept).strip()
    return json.loads(text) if text else {}


def write_baseline(counts: dict[str, int]) -> None:
    """Write ``counts`` to the baseline, prepending the documentation header."""
    BASELINE_PATH.write_text(
        BASELINE_HEADER + json.dumps(counts, indent=2) + "\n", encoding="utf-8"
    )


def count_files(directory: Path) -> int:
    """Number of source files directly inside ``directory`` (non-recursive)."""
    return sum(
        1
        for entry in directory.iterdir()
        if entry.is_file() and entry.suffix in SUFFIXES
    )


def scan() -> dict[str, int]:
    """Map every tracked directory (>MIN_TRACKED files) to its file count."""
    counts: dict[str, int] = {}
    for root in ROOTS:
        root_path = Path(root)
        if not root_path.is_dir():
            continue
        for directory in [root_path, *sorted(p for p in root_path.rglob("*") if p.is_dir())]:
            count = count_files(directory)
            if count > MIN_TRACKED:
                counts[directory.as_posix()] = count
    return dict(sorted(counts.items()))


def main() -> None:
    counts = scan()
    write_baseline(counts)
    print(f"Wrote {len(counts)} directories to {BASELINE_PATH}")


if __name__ == "__main__":
    main()
