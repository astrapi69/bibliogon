#!/usr/bin/env python3
"""Clone the dev database into an agent-local copy (#794).

An agent doing schema-touching work must never run against the live dev
instance. The failure is not the obvious one: while #782 was on a
feature branch, nobody ran alembic - the agent edited a model, uvicorn's
reloader picked it up, and the lifespan applied the branch migration to
the live database, leaving it at a revision that did not exist on
``develop``.

This tool makes the safe path one command away::

    make agent-db            # clone, print the env line
    make agent-db FORCE=1    # refresh an existing copy

``BIBLIOGON_DATA_DIR`` then points the backend at the copy - it
overrides both the database path and the upload directory.

The copy goes through SQLite's backup API rather than a file copy: the
live server holds the database open in WAL mode, and copying the main
file alone silently loses every committed-but-uncheckpointed row.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

#: Where the agent copy lives. Inside the repo so it is easy to find,
#: gitignored so a copy of the user's library can never become a commit.
DEFAULT_AGENT_DIRNAME = ".agent-data"

DB_FILENAME = "bibliogon.db"


class SnapshotError(Exception):
    """The snapshot cannot be taken safely."""


@dataclass
class SnapshotResult:
    source_db: Path
    target_db: Path
    rows_copied_from: str


def default_agent_dir() -> Path:
    """Repo-local directory holding the agent's own data dir."""
    return REPO_ROOT / DEFAULT_AGENT_DIRNAME


def live_data_dir() -> Path:
    """The data directory the backend would use right now.

    Resolved through ``app.paths`` so it honours ``BIBLIOGON_DATA_DIR``
    and the platformdirs default - including an XDG override, which is
    how a snap-confined editor ends up with its own library.
    """
    backend = REPO_ROOT / "backend"
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))
    from app.paths import get_data_dir

    return Path(get_data_dir())


def env_line(agent_dir: Path) -> str:
    """The shell line that points a command at the agent copy."""
    return f"BIBLIOGON_DATA_DIR={agent_dir}"


def _reject_unsafe_target(source_dir: Path, target_dir: Path) -> None:
    source_resolved = source_dir.resolve()
    target_resolved = target_dir.resolve() if target_dir.exists() else target_dir.absolute()
    if target_resolved == source_resolved or source_resolved in target_resolved.parents:
        raise SnapshotError(
            f"Refusing to write inside the live data directory ({source_resolved}). "
            "The point of this tool is to leave it untouched."
        )


def snapshot(source_dir: Path, target_dir: Path, *, force: bool = False) -> SnapshotResult:
    """Copy ``source_dir``'s database into ``target_dir``.

    Args:
        source_dir: The live data directory.
        target_dir: Where the agent copy should live.
        force: Replace an existing copy instead of refusing.

    Returns:
        A :class:`SnapshotResult` naming both paths.

    Raises:
        SnapshotError: The target is unsafe, the source has no database,
            or a copy exists and ``force`` was not given.
    """
    _reject_unsafe_target(source_dir, target_dir)

    source_db = source_dir / DB_FILENAME
    if not source_db.is_file():
        raise SnapshotError(f"Found no database at {source_db}.")

    target_db = target_dir / DB_FILENAME
    if target_db.exists() and not force:
        raise SnapshotError(
            f"{target_db} already exists. Re-run with --force to replace it."
        )

    target_dir.mkdir(parents=True, exist_ok=True)
    if target_db.exists():
        target_db.unlink()

    source = sqlite3.connect(f"file:{source_db}?mode=ro", uri=True)
    target = sqlite3.connect(target_db)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()

    return SnapshotResult(
        source_db=source_db, target_db=target_db, rows_copied_from=str(source_db)
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--target",
        type=Path,
        default=None,
        help=f"Agent data directory (default: {DEFAULT_AGENT_DIRNAME}/ in the repo)",
    )
    parser.add_argument("--force", action="store_true", help="Replace an existing copy")
    args = parser.parse_args(argv)

    target_dir = args.target or default_agent_dir()
    try:
        result = snapshot(live_data_dir(), target_dir, force=args.force)
    except SnapshotError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    print(f"copied {result.source_db}")
    print(f"     -> {result.target_db}")
    print()
    print("Point any agent-run command at the copy:")
    print(f"  {env_line(target_dir)} poetry run alembic upgrade head")
    print(f"  {env_line(target_dir)} poetry run python ../scripts/<script>.py")
    print()
    print("Never run a migration or a reloading server against the live")
    print("directory from a feature branch - see .claude/rules/dev-db-isolation.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
