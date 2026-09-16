"""Guard: every plugin on disk is in every hand-maintained Makefile aggregate (#863).

``make test`` runs ``test-plugins``, which lists one ``test-plugin-<name>``
target per plugin by hand. When plugin-aplus was added its target was never
written, and ``make test`` kept reporting green: the backend-side tests for the
same feature ran and passed, so a local run that never touched the plugin's
own 107 tests looked exactly like one that had. story-bible had been skipped
the same way. Nightly CI covered both (#838), so the local check and the
nightly check were testing different things - and nothing showed the
difference.

Adding the missing lines fixes today's list, not the cause: a list maintained
by hand drifts. This test is the cause's answer. It fails when a plugin exists
on disk but is absent from an aggregate, and it also checks that each target
really runs THAT plugin's suite - a copy-pasted recipe still pointing at a
neighbour would otherwise make the aggregate look complete while testing the
wrong thing.

Every other multi-plugin operation in the Makefile (install, lock-all,
verify-plugin-locks, sync-versions) iterates ``plugins/bibliogon-plugin-*`` and
cannot drift, so only these aggregates need a guard. The CI side of the same
invariant is ``test_ci_plugin_matrix.py``.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_MAKEFILE = _REPO_ROOT / "Makefile"

#: ``(aggregate target, per-plugin target prefix)``.
_AGGREGATES = (
    ("test-plugins", "test-plugin-"),
    ("test-coverage-plugins", "test-coverage-plugin-"),
)


def _plugins_on_disk() -> list[str]:
    return sorted(
        path.name.removeprefix("bibliogon-plugin-")
        for path in (_REPO_ROOT / "plugins").glob("bibliogon-plugin-*")
        if path.is_dir() and (path / "pyproject.toml").is_file()
    )


def _makefile() -> str:
    return _MAKEFILE.read_text(encoding="utf-8")


def _prerequisites(target: str) -> list[str]:
    """Prerequisites of ``target``, with backslash line continuations joined."""
    joined = _makefile().replace("\\\n", " ")
    match = re.search(rf"^{re.escape(target)}:([^#\n]*)", joined, re.MULTILINE)
    assert match, f"Makefile has no '{target}' target (was it renamed?)"
    return match.group(1).split()


def _recipe(target: str) -> str | None:
    """The recipe lines of ``target``, or None when the target is undefined."""
    match = re.search(
        rf"^{re.escape(target)}:[^\n]*\n((?:\t[^\n]*\n?)*)", _makefile(), re.MULTILINE
    )
    return match.group(1) if match else None


def _package(plugin: str) -> str:
    return "bibliogon_" + plugin.replace("-", "_")


@pytest.mark.parametrize(("aggregate", "prefix"), _AGGREGATES)
def test_every_plugin_on_disk_is_in_the_aggregate(aggregate: str, prefix: str) -> None:
    listed = {name.removeprefix(prefix) for name in _prerequisites(aggregate)}
    missing = [plugin for plugin in _plugins_on_disk() if plugin not in listed]
    assert not missing, (
        f"These plugins exist under plugins/ but are not prerequisites of "
        f"'{aggregate}', so running it never executes their tests - while "
        "still reporting success:\n  " + "\n  ".join(f"{prefix}{name}" for name in missing)
    )


@pytest.mark.parametrize(("aggregate", "prefix"), _AGGREGATES)
def test_every_per_plugin_target_runs_its_own_plugin(aggregate: str, prefix: str) -> None:
    """A listed target must exist AND ``cd`` into its own plugin. A recipe
    copied from a neighbour would otherwise run the neighbour's suite under
    the right name."""
    problems: list[str] = []
    for plugin in _plugins_on_disk():
        target = f"{prefix}{plugin}"
        recipe = _recipe(target)
        if recipe is None:
            problems.append(f"{target}: not defined")
            continue
        if f"cd plugins/bibliogon-plugin-{plugin} " not in recipe:
            problems.append(f"{target}: recipe does not cd into plugins/bibliogon-plugin-{plugin}")
    assert not problems, f"'{aggregate}' targets:\n  " + "\n  ".join(problems)


def test_every_coverage_target_measures_its_own_package() -> None:
    """``--cov=`` names the package to measure. A typo there does not fail
    the run - it measures nothing and reports it."""
    problems: list[str] = []
    for plugin in _plugins_on_disk():
        recipe = _recipe(f"test-coverage-plugin-{plugin}") or ""
        if f"--cov={_package(plugin)} " not in recipe:
            problems.append(f"test-coverage-plugin-{plugin}: expected --cov={_package(plugin)}")
    assert not problems, "\n  ".join(problems)


@pytest.mark.parametrize(("aggregate", "prefix"), _AGGREGATES)
def test_no_aggregate_lists_a_plugin_that_no_longer_exists(aggregate: str, prefix: str) -> None:
    on_disk = set(_plugins_on_disk())
    stale = [
        name
        for name in _prerequisites(aggregate)
        if name.startswith(prefix) and name.removeprefix(prefix) not in on_disk
    ]
    assert not stale, f"'{aggregate}' lists plugins with no directory:\n  " + "\n  ".join(stale)


def test_every_per_plugin_target_is_phony() -> None:
    """These targets never produce a file of their name. Without .PHONY, a
    stray file called e.g. ``test-plugin-kdp`` would make ``make`` consider
    the target up to date and skip the tests silently."""
    phony = set(_prerequisites(".PHONY"))
    missing = [
        f"{prefix}{plugin}"
        for _, prefix in _AGGREGATES
        for plugin in _plugins_on_disk()
        if f"{prefix}{plugin}" not in phony
    ]
    assert not missing, "Missing from .PHONY:\n  " + "\n  ".join(missing)
