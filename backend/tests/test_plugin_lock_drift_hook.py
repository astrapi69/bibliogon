"""Self-check tests for the plugin-lock-paired pre-commit hook.

Sub-task 3 of PLUGIN-LOCKFILE-DRIFT-01. Tests the script directly
(option 3a in the pre-inspection): cheap, no Poetry invocation, runs
in milliseconds. The expensive-but-thorough drift detection — running
`poetry install --dry-run` per plugin — stays as the existing CI gate
(`.github/workflows/ci.yml` plugin matrix) and the optional manual
`make verify-plugin-locks` target.

The shape under test:

- ``scripts/check_plugin_lock_paired.py`` is invoked by pre-commit
  with each staged ``plugins/bibliogon-plugin-<name>/pyproject.toml``
  path as a positional argument.
- The script consults ``git diff --cached --name-only`` to enumerate
  the staged set and asserts each hook-supplied pyproject path's
  sibling ``poetry.lock`` is also in that set.

These tests stage real plugin files in a controlled way using
``git update-index`` against a tmp work-tree clone, run the hook,
and assert exit code + key strings in stderr. The tests do NOT
mutate the actual repo's git index; they operate inside an
isolated git worktree per test (see the ``isolated_git`` fixture).
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

# Walk up to the first ancestor that contains ``scripts/``. The
# usual ``parent.parent.parent`` shortcut resolves to ``backend/``
# instead of the repo root when mutmut copies the suite into
# ``mutants/tests/``.
REPO_ROOT = next(
    p for p in Path(__file__).resolve().parents if (p / "scripts").is_dir()
)
SCRIPT_PATH = REPO_ROOT / "scripts" / "check_plugin_lock_paired.py"


@pytest.fixture
def isolated_git(tmp_path: Path) -> Path:
    """Build a minimal isolated git repo mirroring the plugin layout.

    The hook only reads `git diff --cached --name-only` from the cwd,
    so a fresh git init with the plugin files committed and then
    selectively staged is enough to exercise the contract — without
    touching the actual repo's index.
    """
    work = tmp_path / "work"
    work.mkdir()
    # Mirror the relevant subset of the repo: one plugin's pyproject +
    # poetry.lock. The script's path normalization expects paths
    # rooted at "plugins/bibliogon-plugin-<name>/" so the fixture
    # creates that exact structure.
    plugin_dir = work / "plugins" / "bibliogon-plugin-export"
    plugin_dir.mkdir(parents=True)
    pyproject = plugin_dir / "pyproject.toml"
    lock = plugin_dir / "poetry.lock"
    pyproject.write_text("[tool.poetry]\nname = \"x\"\n", encoding="utf-8")
    lock.write_text("# lockfile placeholder\n", encoding="utf-8")
    # Initialize git, do an initial commit so subsequent edits show as
    # modifications rather than new files.
    subprocess.run(["git", "init", "-q"], check=True, cwd=work)
    subprocess.run(
        ["git", "config", "user.email", "test@bibliogon.local"],
        check=True,
        cwd=work,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        check=True,
        cwd=work,
    )
    subprocess.run(["git", "add", "."], check=True, cwd=work)
    subprocess.run(
        ["git", "commit", "-q", "-m", "init"],
        check=True,
        cwd=work,
    )
    # Copy the script so the relative paths in the hook resolve from the
    # work-tree root. The hook resolves REPO_ROOT from the script's own
    # __file__, so we put the script at the same offset.
    scripts_dir = work / "scripts"
    scripts_dir.mkdir()
    shutil.copy(SCRIPT_PATH, scripts_dir / "check_plugin_lock_paired.py")
    return work


def _run_hook(work: Path, args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["python3", "scripts/check_plugin_lock_paired.py", *args],
        capture_output=True,
        text=True,
        cwd=work,
    )


def _stage(work: Path, *paths: str) -> None:
    subprocess.run(
        ["git", "add", *paths],
        check=True,
        cwd=work,
    )


def _modify(work: Path, path: str, suffix: str = "\n# touched\n") -> None:
    full = work / path
    full.write_text(full.read_text(encoding="utf-8") + suffix, encoding="utf-8")


# --- behavioral contract -------------------------------------------


def test_empty_argv_passes(isolated_git: Path) -> None:
    """No staged plugin pyproject in argv → hook exits 0."""
    result = _run_hook(isolated_git, [])
    assert result.returncode == 0, result.stderr


def test_non_plugin_path_passes(isolated_git: Path) -> None:
    """Defensive: a non-plugin path (e.g. docs/) passed as arg
    must not trigger the hook (the `files:` regex should already
    exclude these, but the script must be defensive)."""
    result = _run_hook(isolated_git, ["docs/CHANGELOG.md"])
    assert result.returncode == 0, result.stderr


def test_pyproject_with_paired_lock_passes(isolated_git: Path) -> None:
    """Both pyproject + lock staged → exit 0."""
    _modify(isolated_git, "plugins/bibliogon-plugin-export/pyproject.toml")
    _modify(isolated_git, "plugins/bibliogon-plugin-export/poetry.lock")
    _stage(
        isolated_git,
        "plugins/bibliogon-plugin-export/pyproject.toml",
        "plugins/bibliogon-plugin-export/poetry.lock",
    )
    result = _run_hook(
        isolated_git,
        ["plugins/bibliogon-plugin-export/pyproject.toml"],
    )
    assert result.returncode == 0, result.stderr


def test_pyproject_without_paired_lock_fails(
    isolated_git: Path,
) -> None:
    """pyproject staged, lock NOT staged → exit 1 with remediation hint."""
    _modify(isolated_git, "plugins/bibliogon-plugin-export/pyproject.toml")
    _stage(isolated_git, "plugins/bibliogon-plugin-export/pyproject.toml")
    # NOTE: lock NOT staged on purpose
    result = _run_hook(
        isolated_git,
        ["plugins/bibliogon-plugin-export/pyproject.toml"],
    )
    assert result.returncode == 1, (
        f"expected exit 1 (drift detected), got {result.returncode}.\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )
    # Failure message contract: must name the offending pyproject and
    # the expected lock path. Both are load-bearing for the hint
    # to be actionable.
    assert "plugins/bibliogon-plugin-export/pyproject.toml" in result.stderr
    assert "plugins/bibliogon-plugin-export/poetry.lock" in result.stderr
    # Remediation hint contract: must point at the make target and
    # cite the v0.30.0 incident for context (so a contributor reading
    # the error knows what shape of bug it catches).
    assert "make lock-all-plugins" in result.stderr
    assert "v0.30.0" in result.stderr


def test_lockfile_only_change_does_not_trigger(
    isolated_git: Path,
) -> None:
    """Per pre-inspection Q2, the hook only triggers on
    pyproject-staging direction. A lockfile-only change (no pyproject
    in argv) is valid and must not fail.

    This test exercises the case where pre-commit's `files:` regex
    DID NOT match anything (so argv is empty) — which is what would
    happen for a lockfile-only commit. The hook must exit 0.
    """
    _modify(isolated_git, "plugins/bibliogon-plugin-export/poetry.lock")
    _stage(isolated_git, "plugins/bibliogon-plugin-export/poetry.lock")
    # No pyproject path in argv (the regex did not match):
    result = _run_hook(isolated_git, [])
    assert result.returncode == 0, result.stderr


def test_empty_staged_set_with_pyproject_in_argv_passes(
    isolated_git: Path,
) -> None:
    """`pre-commit run --all-files` (and CI's "Run hooks on all
    files" step) passes every matching file as argv but does NOT
    stage anything. The hook's contract is staging-relative —
    "a staged pyproject must be paired with its staged lock" —
    so an empty staged set means the contract is vacuous and the
    hook must exit 0.

    This test pins the regression: without this skip, CI's
    `pre-commit run --all-files` step would falsely fail on every
    matching plugin pyproject because none of their lockfiles are
    "staged" (nothing is). That regression hit on commit
    `8f6fcea` and was fixed in the follow-up commit that adds
    this test.
    """
    # NOTE: nothing staged on purpose. The hook is invoked with
    # the plugin pyproject path as if pre-commit's --all-files
    # mode supplied it, but the staged set is empty.
    result = _run_hook(
        isolated_git,
        ["plugins/bibliogon-plugin-export/pyproject.toml"],
    )
    assert result.returncode == 0, (
        f"expected exit 0 (vacuous contract — no commit happening), "
        f"got {result.returncode}.\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )


def test_multiple_pyprojects_partial_pairing_fails(
    isolated_git: Path,
) -> None:
    """If the hook receives multiple pyproject paths and ANY of
    them lacks a paired lock, the hook fails and names every
    unpaired path."""
    # Add a second plugin to the fixture
    plugin2 = isolated_git / "plugins" / "bibliogon-plugin-export-2"
    plugin2.mkdir()
    (plugin2 / "pyproject.toml").write_text(
        "[tool.poetry]\nname = \"x2\"\n", encoding="utf-8"
    )
    (plugin2 / "poetry.lock").write_text(
        "# lock 2\n", encoding="utf-8"
    )
    _stage(
        isolated_git,
        "plugins/bibliogon-plugin-export-2/pyproject.toml",
        "plugins/bibliogon-plugin-export-2/poetry.lock",
    )
    subprocess.run(
        ["git", "commit", "-q", "-m", "add second plugin"],
        check=True,
        cwd=isolated_git,
    )
    # Now stage: plugin-1 pyproject + plugin-1 lock (paired);
    # plugin-2 pyproject WITHOUT plugin-2 lock (unpaired).
    _modify(isolated_git, "plugins/bibliogon-plugin-export/pyproject.toml")
    _modify(isolated_git, "plugins/bibliogon-plugin-export/poetry.lock")
    _modify(
        isolated_git,
        "plugins/bibliogon-plugin-export-2/pyproject.toml",
    )
    _stage(
        isolated_git,
        "plugins/bibliogon-plugin-export/pyproject.toml",
        "plugins/bibliogon-plugin-export/poetry.lock",
        "plugins/bibliogon-plugin-export-2/pyproject.toml",
    )
    result = _run_hook(
        isolated_git,
        [
            "plugins/bibliogon-plugin-export/pyproject.toml",
            "plugins/bibliogon-plugin-export-2/pyproject.toml",
        ],
    )
    assert result.returncode == 1, result.stderr
    # Must name the unpaired plugin specifically:
    assert "plugins/bibliogon-plugin-export-2/pyproject.toml" in result.stderr
    assert "plugins/bibliogon-plugin-export-2/poetry.lock" in result.stderr
