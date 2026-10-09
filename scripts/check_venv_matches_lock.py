#!/usr/bin/env python3
"""Fail when the installed Python environment is not what the lockfile says.

``poetry install`` adds what is missing and removes nothing, and every Poetry
venv cache in this repository restores by key PREFIX - so a job whose exact
key misses still gets the newest venv built from an OLDER lock. The
environment a job works in is therefore "everything any previous run ever
installed", of which the lock describes a subset (#980).

The primary fix is ``poetry sync`` in place of ``poetry install``, which
prunes on restore. This guard covers what sync cannot: an ad-hoc install
later in the same job, and a developer's long-lived local venv, which is
where the drift actually bites - the container that found #952 still carried
``pypdf`` 6.18.1 with three advisories from a lock that stopped naming it
four months earlier.

The reading is Poetry's own: ``poetry sync --dry-run`` reports exactly the
operations needed to make the environment equal the lock. No operation means
no drift.

Usage::

    python scripts/check_venv_matches_lock.py --project backend
    python scripts/check_venv_matches_lock.py --project backend --allow pytest-testmon
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

#: Seeded by virtualenv itself, never by the lock. The weekly security scan
#: upgrades pip deliberately (#952), so counting it would make this guard
#: fight that fix.
VENV_SEEDS = frozenset({"pip", "setuptools", "wheel"})

#: ``- Installing foo (1.0): Skipped for the following reason: Already installed``
#: is Poetry reporting a satisfied dependency, not an operation.
_SKIPPED = re.compile(r":\s*Skipped for the following reason")

_OPERATION = re.compile(
    r"^\s*-\s+(?P<action>Installing|Updating|Downgrading|Removing)\s+"
    r"(?P<package>[A-Za-z0-9._-]+)\s+\((?P<version>[^)]*)\)"
)


@dataclass(frozen=True)
class Drift:
    """One operation Poetry would need to make the venv equal the lock."""

    action: str
    package: str
    version: str


def drift(output: str, allow: tuple[str, ...] = ()) -> list[Drift]:
    """Every operation in ``poetry sync --dry-run`` output that counts.

    Args:
        output: Raw stdout of ``poetry sync --dry-run``.
        allow: Package names that are installed on purpose outside the lock.

    Returns:
        The drifting operations, empty when the environment matches.
    """
    exempt = VENV_SEEDS | {name.lower() for name in allow}
    found: list[Drift] = []
    for line in output.splitlines():
        if _SKIPPED.search(line):
            continue
        match = _OPERATION.match(line)
        if not match:
            continue
        package = match["package"]
        if package.lower() in exempt:
            continue
        found.append(Drift(match["action"], package, match["version"]))
    return found


def format_report(found: list[Drift], *, project: str) -> str:
    """Human-readable failure text, or empty when there is nothing to say."""
    if not found:
        return ""
    lines = [
        f"The installed environment for {project}/ does not match its lockfile.",
        "",
        "Poetry would have to:",
    ]
    lines += [f"  - {d.action} {d.package} ({d.version})" for d in found]
    lines += [
        "",
        f"Run `cd {project} && poetry sync` to make them agree. If a package",
        "belongs here deliberately and must stay out of the lock, name it with",
        "--allow so the exception is written down rather than tolerated.",
        "See #980 for why install-without-sync lets this accumulate.",
    ]
    return "\n".join(lines)


def _poetry_dry_run(project: str) -> str:
    """Ask Poetry what it would change. Isolated so tests can replace it."""
    result = subprocess.run(
        ["poetry", "sync", "--dry-run", "--no-interaction", "--no-ansi"],
        cwd=REPO_ROOT / project,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(
            f"poetry sync --dry-run failed in {project}/ "
            f"(exit {result.returncode}):\n{result.stderr.strip()}"
        )
    return result.stdout


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project",
        default="backend",
        help="Directory holding the pyproject.toml / poetry.lock pair.",
    )
    parser.add_argument(
        "--allow",
        action="append",
        default=[],
        metavar="PACKAGE",
        help="Installed on purpose and kept out of the lock. Repeatable.",
    )
    args = parser.parse_args(argv)

    found = drift(_poetry_dry_run(args.project), allow=tuple(args.allow))
    if found:
        print(format_report(found, project=args.project), file=sys.stderr)
        return 1
    print(f"{args.project}/: installed environment matches the lockfile.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
