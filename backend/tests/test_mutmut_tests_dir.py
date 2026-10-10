"""The mutmut allowlist must cover the scope mutmut mutates (#722).

``[tool.mutmut] tests_dir`` in ``pyproject.toml`` decides which tests
mutmut collects. A mutant whose only covering test is absent from that
list scores ``no_tests`` - counted as debt, never executed, and
indistinguishable in the report from code nothing tests at all.

The list has drifted twice because it is maintained by hand while
``paths_to_mutate`` grows: the ``no_tests`` pool went from 206
(2026-05-14) to 2781 of 12928 (2026-08-16), and by the time #722 was
filed 27 test files exercised the scope without being listed. This test
is the closed-set enforcement that keeps it from happening a third time.

It is deliberately ONE-DIRECTIONAL. Every test file that imports the
mutated scope must be listed; a listed file that imports nothing from it
is fine and stays. Five such files are listed today
(``test_backup_compare``, ``test_backup_history``, ``test_covers``,
``test_credential_store``, ``test_import_backup_parity``) because they
reach services through ``TestClient(app)`` over HTTP instead of
importing them - so an import grep is a LOWER bound on which tests
exercise the scope, and demanding equality would delete real coverage.
"""

import re
import tomllib
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TESTS_DIR.parent
PYPROJECT = BACKEND_DIR / "pyproject.toml"


def _mutmut_config() -> dict:
    return tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))["tool"]["mutmut"]


def _module_prefixes(paths_to_mutate: list[str]) -> list[str]:
    """``app/services/`` -> ``app.services``, ``app/x/y.py`` -> ``app.x.y``.

    Derived from ``paths_to_mutate`` rather than hardcoded so a future
    scope expansion widens this guard automatically. That is the actual
    root cause of the drift: the scope grew, the allowlist did not, and
    nothing connected the two.
    """
    prefixes = []
    for raw in paths_to_mutate:
        cleaned = raw.strip().strip("/")
        if cleaned.endswith(".py"):
            cleaned = cleaned[: -len(".py")]
        if cleaned:
            prefixes.append(cleaned.replace("/", "."))
    return prefixes


def _files_referencing(prefixes: list[str]) -> set[str]:
    """Test files importing any mutated module, as ``tests/x.py`` paths.

    Matches both import forms - ``from app.services.foo import`` and
    ``from app.services import foo`` - by allowing a dot or whitespace
    after the prefix. Matching only ``app.services.`` misses the second
    form, which is how four of the listed files look.
    """
    pattern = re.compile(r"\b(?:" + "|".join(re.escape(p) for p in prefixes) + r")[.\s]")
    return {
        f"tests/{path.name}"
        for path in sorted(TESTS_DIR.glob("test_*.py"))
        # This module names the prefixes in its own prose and assertions,
        # which is not coverage of them. Every other file is matched
        # anywhere in its text, not just on import lines: a reference
        # through ``monkeypatch.setattr("app.services.x.y", ...)`` is real
        # coverage, and over-listing a file that only mentions a module in
        # a docstring costs one extra file in the stats pass, while
        # under-listing one brings the no_tests drift back.
        if path != Path(__file__).resolve() and pattern.search(path.read_text(encoding="utf-8"))
    }


def test_every_test_touching_the_mutated_scope_is_on_the_allowlist() -> None:
    config = _mutmut_config()
    prefixes = _module_prefixes(config["paths_to_mutate"])
    assert prefixes, "paths_to_mutate is empty - mutmut would mutate nothing"

    listed = set(config["tests_dir"])
    missing = sorted(_files_referencing(prefixes) - listed)

    assert not missing, (
        f"{len(missing)} test file(s) import the mutated scope "
        f"({', '.join(prefixes)}) but are absent from [tool.mutmut] "
        "tests_dir, so every mutant they would kill scores no_tests "
        "instead:\n  " + "\n  ".join(missing)
    )


#: ``Path(__file__)`` combined with two or more upward steps. One step
#: lands on ``tests/`` and two on ``backend/`` (or on ``mutants/``, which
#: is what mutmut wants), so only three-plus reaches above the backend and
#: breaks inside the mutants tree.
_FILE_RELATIVE_ROOT = re.compile(r"__file__.*?(?:parents\[(?:[2-9]|\d\d)\]|(?:\.parent){3,})")


def test_no_listed_test_walks_up_to_the_repo_root_from_its_own_path() -> None:
    """``parents[2]`` is ``backend/`` inside ``mutants/``, not the root.

    mutmut copies the suite to ``backend/mutants/tests/``, one level
    deeper relative to the backend than the real tree, so a test building
    a repo-root-relative path from ``__file__`` reads it out of
    ``backend/`` instead. Nothing fails loudly: a fixture path simply
    does not exist, the assertion fires for the wrong reason, and because
    stats collection runs pytest under ``-x`` and mutmut exits 1 on the
    first failure, ONE such file aborts the whole run before a single
    mutant is checked. That is what the 39 -> 86 expansion hit:
    ``checked=0 of 13421``.

    ``tests/repo_root.find_repo_root`` resolves correctly from either
    tree, so the fix is to call it rather than to keep adding symlinks
    next to ``mutants/`` for whichever directory a new test happens to
    need.
    """
    offenders = []
    for entry in _mutmut_config()["tests_dir"]:
        path = BACKEND_DIR / entry
        if not path.exists():
            continue  # reported by the case below
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith("#"):
                continue
            if _FILE_RELATIVE_ROOT.search(line):
                offenders.append(f"{entry}:{number}: {line.strip()}")

    assert not offenders, (
        "These listed tests build a repo-root path from __file__, which "
        "resolves one directory too deep inside mutmut's mutants/ tree and "
        "aborts stats collection for every mutant. Use "
        "tests.repo_root.find_repo_root(Path(__file__)) instead:\n  " + "\n  ".join(offenders)
    )


def test_the_allowlist_names_files_that_exist() -> None:
    # A renamed or deleted test silently stops contributing: mutmut passes
    # the path to pytest, which ignores a missing arg under -q, so the
    # coverage it used to provide becomes no_tests with no error anywhere.
    listed = _mutmut_config()["tests_dir"]
    gone = sorted(entry for entry in listed if not (BACKEND_DIR / entry).exists())
    assert not gone, "tests_dir names files that no longer exist:\n  " + "\n  ".join(gone)
