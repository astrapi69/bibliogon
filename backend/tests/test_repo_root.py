"""The repo-root helper must survive mutmut's mutants/ layout (#722)."""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.repo_root import find_repo_root


def _make_tree(root: Path) -> None:
    (root / "backend" / "tests").mkdir(parents=True)
    (root / "backend" / "app").mkdir()
    (root / "frontend" / "src").mkdir(parents=True)
    (root / "scripts").mkdir()


def test_resolves_from_the_real_tests_directory(tmp_path: Path) -> None:
    _make_tree(tmp_path)
    test_file = tmp_path / "backend" / "tests" / "test_x.py"
    test_file.touch()
    assert find_repo_root(test_file) == tmp_path


def test_resolves_from_inside_the_mutants_tree(tmp_path: Path) -> None:
    # The case parents[2] gets wrong: backend/mutants/tests/x.py is two
    # levels below backend/, so parents[2] IS backend/ and every
    # repo-root-relative path lands one directory too deep.
    _make_tree(tmp_path)
    mutant_tests = tmp_path / "backend" / "mutants" / "tests"
    mutant_tests.mkdir(parents=True)
    test_file = mutant_tests / "test_x.py"
    test_file.touch()
    assert test_file.resolve().parents[2] == tmp_path / "backend"
    assert find_repo_root(test_file) == tmp_path


def test_accepts_a_directory_as_well_as_a_file(tmp_path: Path) -> None:
    _make_tree(tmp_path)
    assert find_repo_root(tmp_path / "backend" / "tests") == tmp_path


def test_stops_at_the_nearest_root_when_trees_nest(tmp_path: Path) -> None:
    # A checkout inside a checkout: the inner root is the right answer,
    # otherwise a fixture path would be read from the outer tree.
    _make_tree(tmp_path)
    inner = tmp_path / "backend" / "vendor" / "inner"
    _make_tree(inner)
    test_file = inner / "backend" / "tests" / "test_x.py"
    test_file.touch()
    assert find_repo_root(test_file) == inner


def test_raises_with_an_actionable_message_when_there_is_no_root(tmp_path: Path) -> None:
    # Silence here would be worse than the exception: a wrong root makes
    # every path-existence assertion fail for a reason that has nothing to
    # do with what the test is checking.
    orphan = tmp_path / "somewhere" / "test_x.py"
    orphan.parent.mkdir(parents=True)
    orphan.touch()
    with pytest.raises(RuntimeError, match="No repository root above"):
        find_repo_root(orphan)
