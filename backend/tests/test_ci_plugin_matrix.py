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

This test asserts the matrices are COMPLETE, not that they are
non-empty: adding a plugin directory without adding it to both matrices
fails here, at PR time, rather than silently never running.
"""

from __future__ import annotations

from pathlib import Path

import yaml

_REPO_ROOT = Path(__file__).resolve().parents[2]
_NIGHTLY = _REPO_ROOT / ".github" / "workflows" / "nightly.yml"
_PLUGINS_DIR = _REPO_ROOT / "plugins"


def _plugin_dirs_on_disk() -> set[str]:
    """Directory names like ``bibliogon-plugin-kdp``."""
    return {
        path.name
        for path in _PLUGINS_DIR.glob("bibliogon-plugin-*")
        if path.is_dir() and (path / "pyproject.toml").is_file()
    }


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


def test_every_plugin_on_disk_runs_in_the_plugin_tests_matrix() -> None:
    on_disk = _plugin_dirs_on_disk()
    in_matrix = _matrix_plugins("plugin-tests")
    missing = sorted(on_disk - in_matrix)
    assert not missing, (
        "These plugins exist under plugins/ but are not in nightly.yml's "
        "'plugin-tests' matrix, so their isolated-install path is never "
        "exercised:\n  " + "\n  ".join(missing)
    )


def test_every_plugin_on_disk_runs_in_the_plugin_coverage_matrix() -> None:
    on_disk = _plugin_dirs_on_disk()
    in_matrix = _matrix_plugins("plugin-coverage")
    missing = sorted(on_disk - in_matrix)
    assert not missing, (
        "These plugins exist under plugins/ but are not in nightly.yml's "
        "'plugin-coverage' matrix:\n  " + "\n  ".join(missing)
    )


def test_neither_matrix_lists_a_plugin_that_no_longer_exists() -> None:
    """The open-set half: a renamed or deleted plugin left in the matrix
    makes the nightly job fail on checkout instead of being caught here."""
    on_disk = _plugin_dirs_on_disk()
    for job_name in ("plugin-tests", "plugin-coverage"):
        stale = sorted(_matrix_plugins(job_name) - on_disk)
        assert not stale, (
            f"nightly.yml's '{job_name}' matrix lists plugins with no "
            "directory under plugins/:\n  " + "\n  ".join(stale)
        )


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
