#!/usr/bin/env python3
"""Regenerate the directory-size baseline (#466 god-folder ratchet).

Scans the source trees and records, per directory, the number of source
files directly inside it (non-recursive). Directories with more than
``MIN_TRACKED`` files are written to ``.dirsize-baseline.json`` (repo root).

The baseline is the ratchet floor: a directory may shrink (cleanup) but
must never grow past its recorded value (enforced by
``check_directory_size.py``). Run this after a cleanup PR to ratchet the
floor down, then commit the updated baseline.
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
BASELINE_PATH = Path(".dirsize-baseline.json")


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
    BASELINE_PATH.write_text(json.dumps(counts, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(counts)} directories to {BASELINE_PATH}")


if __name__ == "__main__":
    main()
