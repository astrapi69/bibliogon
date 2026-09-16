"""Architecture guard: every plugin on disk runs in CI's plugin matrices.

Bibliogon installs plugins two different ways, and only one of them is
exercised by the backend suite:

- the BACKEND's combined ``poetry.lock`` resolves every plugin as a
  path-dependency into one venv (what ``make test`` uses), and
- each plugin's OWN ``poetry.lock`` installs it standalone (what the
  nightly per-plugin matrix uses, and what a ZIP-distributed plugin
  would face).

A plugin absent from the matrix only ever gets the first path. Its own
lock is then never resolved from scratch and its package never imported
without every other plugin present - so an undeclared dependency, a
stale lock, or an import that only works because a sibling plugin
happens to be installed stays invisible. That is the "Two installation
paths diverge" failure in lessons-learned.

Five plugins (aplus, git-sync, medium-import, promotion, story-bible)
were missing when this guard was written, hiding 267 passing tests that
nightly had never run.

Membership of both matrices (every plugin on disk listed, no stale entry)
is asserted in ``test_plugin_handlists.py`` together with every other
hand-maintained plugin list (#867). This module keeps the matrix-specific
check: the ``package:`` names feed ``--cov`` and must match the real
packages.
"""

from __future__ import annotations

from pathlib import Path

import yaml

_REPO_ROOT = Path(__file__).resolve().parents[2]
_NIGHTLY = _REPO_ROOT / ".github" / "workflows" / "nightly.yml"
_PLUGINS_DIR = _REPO_ROOT / "plugins"


def _workflow() -> dict:
    # GitHub's `on:` key parses as the YAML boolean True; harmless here
    # since only the jobs section is read.
    return yaml.safe_load(_NIGHTLY.read_text(encoding="utf-8"))


def _matrix_plugins(job_name: str) -> set[str]:
    jobs = _workflow()["jobs"]
    assert job_name in jobs, f"nightly.yml has no '{job_name}' job (was it renamed?)"
    matrix = jobs[job_name]["strategy"]["matrix"]
    if "include" in matrix:
        return {entry["plugin"] for entry in matrix["include"]}
    return set(matrix["plugin"])


def test_the_coverage_matrix_package_names_match_the_real_packages() -> None:
    """``package:`` feeds ``--cov=<package>``; a typo there silently
    measures nothing rather than failing."""
    jobs = _workflow()["jobs"]
    mismatched: list[str] = []
    for entry in jobs["plugin-coverage"]["strategy"]["matrix"]["include"]:
        plugin_dir = _PLUGINS_DIR / entry["plugin"]
        expected = "bibliogon_" + entry["plugin"].removeprefix("bibliogon-plugin-").replace(
            "-", "_"
        )
        if entry["package"] != expected:
            mismatched.append(f"{entry['plugin']}: {entry['package']} != {expected}")
        elif not (plugin_dir / entry["package"]).is_dir():
            mismatched.append(f"{entry['plugin']}: package dir {entry['package']} not found")
    assert not mismatched, "plugin-coverage matrix package mismatches:\n  " + "\n  ".join(
        mismatched
    )
