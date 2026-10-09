"""Tests for the venv-vs-lock drift guard (#980).

``poetry install`` never removes a package that has left the lock, and every
venv cache in this repo restores by key PREFIX, so a job can work in an
environment that is a superset of what the lockfile declares. The guard reads
``poetry sync --dry-run`` and fails when the two disagree.

The parser is the part under test; the subprocess call is a thin shell around
it, so the fixtures here are real Poetry output rather than invented shapes.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_venv_matches_lock.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_venv_matches_lock", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


guard = _load_module()


CLEAN = """Installing dependencies from lock file

Package operations: 0 installs, 0 updates, 0 removals, 174 skipped

  - Installing anyio (4.15.1): Skipped for the following reason: Already installed
  - Installing weasyprint (70.0): Skipped for the following reason: Already installed
"""

DRIFTED = """Installing dependencies from lock file

Package operations: 0 installs, 2 updates, 1 removal, 172 skipped

  - Downgrading pip (26.2.1 -> 26.1.2)
  - Removing pypdf (6.18.1)
  - Updating tinycss2 (1.4.0 -> 1.5.1)
  - Installing anyio (4.15.1): Skipped for the following reason: Already installed
"""

MISSING = """Installing dependencies from lock file

Package operations: 1 install, 0 updates, 0 removals, 173 skipped

  - Installing soupsieve (2.10)
"""


class TestParse:
    def test_a_synced_environment_reports_no_drift(self) -> None:
        assert guard.drift(CLEAN) == []

    def test_a_package_outside_the_lock_is_drift(self) -> None:
        """The #952 shape: pypdf left the lock, the venv kept it."""
        found = guard.drift(DRIFTED)
        assert ("Removing", "pypdf") in [(d.action, d.package) for d in found]

    def test_a_wrong_version_is_drift(self) -> None:
        assert ("Updating", "tinycss2") in [(d.action, d.package) for d in guard.drift(DRIFTED)]

    def test_a_missing_package_is_drift(self) -> None:
        """Not only extras: an install the lock wants and the venv lacks
        means the environment is not the lock either."""
        assert ("Installing", "soupsieve") in [(d.action, d.package) for d in guard.drift(MISSING)]

    def test_an_already_installed_line_is_never_drift(self) -> None:
        """Poetry prints every satisfied dependency as a skipped install.
        Counting those would make every environment look broken."""
        assert guard.drift(CLEAN) == []
        assert all(d.package != "anyio" for d in guard.drift(DRIFTED))

    def test_the_venv_seeds_are_exempt(self) -> None:
        """pip, setuptools and wheel are seeded by virtualenv, not by the
        lock. The security gate upgrades pip on purpose (#952), so counting
        it as drift would make the guard fight the fix."""
        assert all(d.package != "pip" for d in guard.drift(DRIFTED))

    def test_an_explicit_allowance_is_exempt(self) -> None:
        """``pytest-testmon`` is installed ad-hoc into the cached CI venv and
        kept out of the lock on purpose, so it has to be named rather than
        silently tolerated."""
        text = DRIFTED.replace("pypdf", "pytest-testmon")
        assert guard.drift(text, allow=("pytest-testmon",)) == [
            d for d in guard.drift(text) if d.package != "pytest-testmon"
        ]
        assert all(
            d.package != "pytest-testmon" for d in guard.drift(text, allow=("pytest-testmon",))
        )


class TestReport:
    def test_the_message_names_every_package_and_what_to_do(self) -> None:
        message = guard.format_report(guard.drift(DRIFTED), project="backend")
        assert "pypdf" in message
        assert "tinycss2" in message
        assert "poetry sync" in message
        assert "backend" in message

    def test_a_clean_environment_has_nothing_to_report(self) -> None:
        assert guard.format_report([], project="backend") == ""


class TestExitCode:
    def test_clean_output_exits_zero(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(guard, "_poetry_dry_run", lambda project: CLEAN)
        assert guard.main(["--project", "backend"]) == 0

    def test_drift_exits_one(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(guard, "_poetry_dry_run", lambda project: DRIFTED)
        assert guard.main(["--project", "backend"]) == 1

    def test_an_allowed_package_alone_exits_zero(self, monkeypatch: pytest.MonkeyPatch) -> None:
        only_allowed = CLEAN + "  - Removing pytest-testmon (2.1.3)\n"
        monkeypatch.setattr(guard, "_poetry_dry_run", lambda project: only_allowed)
        assert guard.main(["--project", "backend", "--allow", "pytest-testmon"]) == 0
