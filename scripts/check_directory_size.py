#!/usr/bin/env python3
"""God-folder ratchet guard (#466 Phase 5).

Same philosophy as the complexity ratchet and the file-size gate:
grandfather the current state, forbid regression.

- Every directory recorded in ``.dirsize-baseline`` must not
  grow past its baseline file count (shrinking is fine -> ratchet down via
  ``--update`` or ``generate_directory_baseline.py``).
- A NEW directory (not in the baseline) with more than ``NEW_GODFOLDER_LIMIT``
  files is rejected outright.
- Directories on the allowlist that are still above their ``target`` print a
  non-blocking WARNING so reviewers see the outstanding debt + deadline.

Exit code 1 on any ERROR (blocks the PR); 0 otherwise.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from generate_directory_baseline import (
    BASELINE_PATH,
    load_commented_json,
    scan,
    write_baseline,
)

NEW_GODFOLDER_LIMIT = 15
ALLOWLIST_PATH = Path(".dirsize-allowlist")


def evaluate(
    baseline: dict[str, int],
    allowlist: dict[str, dict],
    current: dict[str, int],
    new_limit: int = NEW_GODFOLDER_LIMIT,
) -> tuple[list[str], list[str], dict[str, int]]:
    """Pure ratchet evaluation.

    Returns ``(errors, warnings, ratcheted_baseline)``. ``ratcheted_baseline``
    is the baseline lowered to the current count wherever a directory shrank
    (the floor only ever moves down).
    """
    errors: list[str] = []
    warnings: list[str] = []
    ratcheted = dict(baseline)

    for dir_path, max_count in baseline.items():
        now = current.get(dir_path, 0)
        if now > max_count:
            errors.append(f"ERROR: {dir_path} grew {max_count} -> {now} (over baseline)")
        elif now < max_count:
            ratcheted[dir_path] = now

    for dir_path, now in current.items():
        if dir_path not in baseline and now > new_limit:
            errors.append(
                f"ERROR: new god-folder {dir_path} ({now} files, limit {new_limit})"
            )

    for dir_path, info in allowlist.items():
        now = current.get(dir_path, 0)
        target = info.get("target", new_limit)
        if now > target:
            warnings.append(
                f"WARNING: {dir_path} ({now} files, target {target}, "
                f"deadline {info.get('deadline', '?')})"
            )

    return errors, warnings, ratcheted


def _load(path: Path) -> dict:
    if not path.exists():
        return {}
    return load_commented_json(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update",
        action="store_true",
        help="Ratchet the baseline DOWN to the current state and write it back.",
    )
    args = parser.parse_args()

    baseline = _load(BASELINE_PATH)
    allowlist = _load(ALLOWLIST_PATH)
    current = scan()

    if not baseline:
        print(f"No baseline at {BASELINE_PATH}; run generate_directory_baseline.py first.")
        return 1

    errors, warnings, ratcheted = evaluate(baseline, allowlist, current)

    for warning in warnings:
        print(warning)

    if args.update:
        write_baseline(current)
        print(f"Baseline ratcheted down + rewritten ({len(current)} directories).")
        return 0

    if ratcheted != baseline:
        shrunk = [d for d in baseline if ratcheted[d] < baseline[d]]
        print(
            f"NOTE: {len(shrunk)} director{'y' if len(shrunk) == 1 else 'ies'} shrank; "
            "run `make update-dir-baseline` to ratchet the baseline down."
        )

    for error in errors:
        print(error)

    if errors:
        print(f"\n{len(errors)} god-folder error(s). See docs/audits/god-folder-audit.")
        return 1
    print("Directory-size ratchet: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
