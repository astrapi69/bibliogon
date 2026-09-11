"""Tests for the upstream-release watcher (#779 part 1).

The schema-drift guard (#775) only compares the vendored artifacts against
the PINNED engine version, so a new upstream release leaves the pin stale
in silence. This watcher reports that gap. A newer release must never be a
failure - an upstream publish cannot be allowed to redden an unrelated
nightly - so the exit code stays 0 and the signal is carried in the
reported output instead.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
WATCHER = REPO_ROOT / "scripts" / "check_upstream_release.py"


def load_watcher():
    spec = importlib.util.spec_from_file_location("check_upstream_release", WATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestVersionComparison:
    @pytest.mark.parametrize(
        "pinned,latest,expected",
        [
            ("0.23.0", "0.23.0", False),
            ("0.23.0", "0.24.0", True),
            ("0.24.0", "0.23.0", False),
            ("1.9.0", "1.10.0", True),  # numeric, not lexicographic
            ("1.10.0", "1.9.0", False),
            ("0.23.0", "1.0.0", True),
            ("0.23.0", "0.23.1", True),
            ("v0.23.0", "0.24.0", True),  # a leading v must not break it
            ("0.23.0", "0.23.0-rc.1", False),  # pre-release of the same core
        ],
    )
    def test_is_behind(self, pinned: str, latest: str, expected: bool) -> None:
        assert load_watcher().is_behind(pinned, latest) is expected

    def test_unparseable_version_raises(self) -> None:
        with pytest.raises(ValueError):
            load_watcher().is_behind("0.23.0", "not-a-version")


class TestIssueTitle:
    def test_title_is_stable_per_version(self) -> None:
        """The workflow dedupes on the title, so the same release must
        always produce the same string."""
        watcher = load_watcher()
        assert watcher.issue_title("0.24.0") == watcher.issue_title("0.24.0")
        assert "0.24.0" in watcher.issue_title("0.24.0")

    def test_different_versions_get_different_titles(self) -> None:
        watcher = load_watcher()
        assert watcher.issue_title("0.24.0") != watcher.issue_title("0.25.0")


class TestGithubOutput:
    def test_writes_the_documented_keys(self, tmp_path, monkeypatch, capsys) -> None:
        watcher = load_watcher()
        output = tmp_path / "gh-output"
        monkeypatch.setenv("GITHUB_OUTPUT", str(output))
        monkeypatch.setattr(watcher, "pinned_version", lambda: "0.23.0")
        monkeypatch.setattr(watcher, "latest_version", lambda: "0.24.0")
        monkeypatch.setattr(sys, "argv", ["check_upstream_release.py", "--github-output"])

        assert watcher.main() == 0  # a newer release is NOT a failure
        written = dict(line.split("=", 1) for line in output.read_text().strip().splitlines())
        assert written["pinned"] == "0.23.0"
        assert written["latest"] == "0.24.0"
        assert written["behind"] == "true"
        assert "0.24.0" in written["title"]
        assert "BEHIND" in capsys.readouterr().out

    def test_reports_not_behind_when_current(self, tmp_path, monkeypatch) -> None:
        watcher = load_watcher()
        output = tmp_path / "gh-output"
        monkeypatch.setenv("GITHUB_OUTPUT", str(output))
        monkeypatch.setattr(watcher, "pinned_version", lambda: "0.23.0")
        monkeypatch.setattr(watcher, "latest_version", lambda: "0.23.0")
        monkeypatch.setattr(sys, "argv", ["check_upstream_release.py", "--github-output"])

        assert watcher.main() == 0
        assert "behind=false" in output.read_text()

    def test_missing_github_output_is_tolerated(self, monkeypatch, capsys) -> None:
        watcher = load_watcher()
        monkeypatch.delenv("GITHUB_OUTPUT", raising=False)
        monkeypatch.setattr(watcher, "pinned_version", lambda: "0.23.0")
        monkeypatch.setattr(watcher, "latest_version", lambda: "0.24.0")
        monkeypatch.setattr(sys, "argv", ["check_upstream_release.py", "--github-output"])

        assert watcher.main() == 0
        assert "GITHUB_OUTPUT is not set" in capsys.readouterr().out


class TestFailureModes:
    def test_unreachable_registry_is_a_real_failure(self, monkeypatch) -> None:
        """A comparison that could not be made must be visible, unlike a
        merely-stale pin."""
        watcher = load_watcher()

        def boom() -> str:
            raise OSError("npm unreachable")

        monkeypatch.setattr(watcher, "pinned_version", lambda: "0.23.0")
        monkeypatch.setattr(watcher, "latest_version", boom)
        monkeypatch.setattr(sys, "argv", ["check_upstream_release.py"])
        assert watcher.main() == 1


class TestAgainstTheRealPin:
    def test_pinned_version_file_is_readable(self) -> None:
        watcher = load_watcher()
        pinned = watcher.pinned_version()
        assert pinned
        watcher.parse(pinned)  # must be comparable

    def test_script_is_executable(self) -> None:
        assert WATCHER.stat().st_mode & 0o111, f"{WATCHER} is not executable"

    def test_runs_against_the_registry(self) -> None:
        """End-to-end against real npm. Tolerates a sandbox with no network
        by accepting the documented failure exit."""
        result = subprocess.run(
            [sys.executable, str(WATCHER)],
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
        )
        if result.returncode == 1:
            assert "could not read the latest" in result.stdout
            return
        assert result.returncode == 0
        assert "learn-content-engine pin:" in result.stdout
