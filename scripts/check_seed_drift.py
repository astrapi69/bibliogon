#!/usr/bin/env python3
"""check_seed_drift.py — fail when a generated offline-seed file has drifted
from the backend sources it is generated from (#853).

Why this exists
---------------
The backendless GitHub-Pages PWA boots from committed JSON under
``frontend/src/storage/seed/``, generated from the backend's YAML by
``make generate-seed-data``. That regeneration is a MANUAL step, so a
source change whose author forgets to re-run it ships a stale mirror
**offline only** - online and desktop read the YAML directly and look
fine.

#699 closed that for the i18n catalogs with a key-by-key comparison.
Every other mirror stayed uncovered, and #816's Portfolio-Board help page
duly shipped missing from the offline help navigation. Rather than write
a bespoke comparison per source, this regenerates everything into a temp
directory and diffs: whatever the generator produces IS the expectation,
so a new mirror added later is covered the day it exists.

``seed-settings.json`` is not generated (see the generator's docstring)
and is therefore neither diffed nor expected to disappear. Keeping its key
set aligned with the backend's settings surface is tracked separately.

Usage::

    python3 scripts/check_seed_drift.py             # report, exit 0
    python3 scripts/check_seed_drift.py --enforce   # exit 1 on drift

Run it from the backend venv (the generator imports ``app.*``), or via
``make verify-seed-drift``.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
GENERATOR = REPO_ROOT / "scripts" / "generate-seed-data.py"
SEED_DIR = REPO_ROOT / "frontend" / "src" / "storage" / "seed"
# Hand-maintained, not generated (#853), so it is exempt from the
# "committed but no longer generated" check below.
UNGENERATED = frozenset({"seed-settings.json"})

# How many example entries to print per finding before truncating.
SAMPLE = 8


def _sample(items: list[str]) -> str:
    shown = ", ".join(items[:SAMPLE])
    if len(items) > SAMPLE:
        shown += f", … (+{len(items) - SAMPLE} more)"
    return shown


def regenerate(out_dir: Path) -> None:
    """Run the generator into ``out_dir``. Raises on a non-zero exit."""
    subprocess.run(
        [sys.executable, str(GENERATOR), "--out-dir", str(out_dir)],
        cwd=BACKEND_DIR,
        check=True,
        capture_output=True,
        text=True,
    )


def diff_generated(fresh_dir: Path) -> list[str]:
    """Compare every freshly generated file against its committed copy."""
    problems: list[str] = []
    fresh_files = sorted(p.name for p in fresh_dir.glob("*.json"))
    if not fresh_files:
        return ["the generator produced no files at all"]

    for name in fresh_files:
        committed = SEED_DIR / name
        if not committed.exists():
            problems.append(f"{name}: generated but not committed")
            continue
        fresh_text = (fresh_dir / name).read_text(encoding="utf-8")
        if committed.read_text(encoding="utf-8") != fresh_text:
            problems.append(f"{name}: committed copy differs from a fresh generation")

    uncommitted = set(fresh_files)
    for committed in sorted(SEED_DIR.glob("*.json")):
        if committed.name in uncommitted or committed.name in UNGENERATED:
            continue
        problems.append(
            f"{committed.name}: committed but no longer generated - delete it, "
            "or restore the generator function that produced it"
        )
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="exit 1 when a seed file has drifted",
    )
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        fresh = Path(tmp) / "seed"
        try:
            regenerate(fresh)
        except subprocess.CalledProcessError as exc:
            print("The seed generator failed, so drift cannot be checked:")
            print(exc.stderr or exc.stdout)
            return 1
        problems = diff_generated(fresh)

    if not problems:
        print("Offline seed files are in sync with their backend sources.")
        return 0

    print("Offline seed data has drifted (#853):")
    for problem in problems:
        print(f"  - {problem}")
    print()
    print(
        "Fix: run `make generate-seed-data` and commit the changed files "
        "under frontend/src/storage/seed/. Without it the backendless PWA "
        "ships the stale mirror, offline only."
    )
    return 1 if args.enforce else 0


if __name__ == "__main__":
    sys.exit(main())
