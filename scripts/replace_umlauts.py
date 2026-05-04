#!/usr/bin/env python3
"""Replace ASCII transliterations with proper umlauts based on the
candidates report from ``find_umlaut_candidates.py``.

Reads candidates from ``/tmp/umlaut-candidates.json`` (or path
passed via ``--report``). For each file, replaces only the words
in the report. Runs interactive per-file confirmation by default;
``--dry-run`` shows diffs without writing; ``--yes-to-all`` skips
the prompt (use only after a full review).

Reuses ``KNOWN_WORDS``, ``WORD_PATTERNS`` and ``mask_code_regions``
from the finder so the replacement logic stays consistent with
the candidate-detection logic.
"""

from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path

# Re-import from the finder to keep the word list and code-mask
# logic in one place.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from find_umlaut_candidates import (  # noqa: E402
    KNOWN_WORDS,
    WORD_PATTERNS,
    mask_code_regions,
)


def replace_in_text(text: str, *, indented_code: bool = True) -> str:
    """Apply the KNOWN_WORDS replacements outside code regions."""
    masked, placeholders = mask_code_regions(text, indented_code=indented_code)
    for ascii_word, replacement in KNOWN_WORDS.items():
        if ascii_word == replacement:
            continue
        masked = WORD_PATTERNS[ascii_word].sub(replacement, masked)
    # Restore code regions.
    for i, (_s, _e, content) in enumerate(placeholders):
        masked = masked.replace(f"\x00CODE{i}\x00", content, 1)
    return masked


def show_diff(path: Path, before: str, after: str) -> None:
    diff = difflib.unified_diff(
        before.splitlines(keepends=True),
        after.splitlines(keepends=True),
        fromfile=f"a/{path}",
        tofile=f"b/{path}",
    )
    sys.stdout.writelines(diff)
    sys.stdout.flush()


def prompt(path: Path, clean_streak: int, total: int, idx: int) -> str:
    """Return one of: y, n, q, a (yes-to-all from here)."""
    suffix = ""
    if clean_streak >= 5:
        suffix = " / [a]ll-remaining"
    while True:
        msg = (
            f"\nApply to {path}?  ({idx}/{total}) "
            f"[y]es / [N]o / [q]uit{suffix}: "
        )
        ans = input(msg).strip().lower()
        if ans in {"y", "n", "q", ""}:
            return ans or "n"
        if ans == "a" and clean_streak >= 5:
            return "a"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--report", default="/tmp/umlaut-candidates.json")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Show diffs, write nothing.",
    )
    ap.add_argument(
        "--yes-to-all",
        action="store_true",
        help="Apply every diff without prompting (use only after full review).",
    )
    ap.add_argument(
        "--only",
        metavar="PATH",
        action="append",
        help="Limit to one or more files (repeatable). Useful for "
        "the mixed-encoding-first run.",
    )
    args = ap.parse_args()

    report_path = Path(args.report)
    if not report_path.is_file():
        print(f"error: report not found: {report_path}", file=sys.stderr)
        return 2
    report = json.loads(report_path.read_text(encoding="utf-8"))

    targets = list(report.keys())
    if args.only:
        wanted = {str(Path(p)) for p in args.only}
        targets = [t for t in targets if t in wanted]

    changed = 0
    skipped = 0
    yes_all = args.yes_to_all
    clean_streak = 0
    total = len(targets)

    for idx, file_str in enumerate(targets, start=1):
        path = Path(file_str)
        if not path.is_file():
            print(f"skip (missing): {path}", file=sys.stderr)
            continue
        before = path.read_text(encoding="utf-8")
        indented = path.suffix not in {".yaml", ".yml"}
        after = replace_in_text(before, indented_code=indented)
        if before == after:
            continue

        show_diff(path, before, after)

        if args.dry_run:
            continue

        if yes_all:
            decision = "y"
        else:
            decision = prompt(path, clean_streak, total, idx)

        if decision == "q":
            print("Stopped. Remaining files left in place.")
            break
        if decision == "a":
            yes_all = True
            decision = "y"
        if decision == "n":
            skipped += 1
            clean_streak = 0
            continue

        path.write_text(after, encoding="utf-8")
        changed += 1
        clean_streak += 1

    print()
    print(f"Changed: {changed}")
    print(f"Skipped: {skipped}")
    if args.dry_run:
        print("Mode:    DRY RUN (no files written)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
