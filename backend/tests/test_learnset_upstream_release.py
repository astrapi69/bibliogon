"""Tests for the nightly upstream-release watcher (#779).

The drift guard (#775) compares the vendored artifacts against the
PINNED engine version, so it only ever detects local tampering. This
watcher answers the other question - has upstream moved? - and is
advisory: a newer release opens an issue, it never fails the build.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO_ROOT / "scripts" / "check_learnset_upstream_release.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_learnset_upstream_release", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


watcher = _load_module()


class TestIsNewer:
    def test_patch_release_is_newer(self) -> None:
        assert watcher.is_newer("0.23.1", "0.23.0") is True

    def test_minor_release_is_newer(self) -> None:
        assert watcher.is_newer("0.24.0", "0.23.9") is True

    def test_major_release_is_newer(self) -> None:
        assert watcher.is_newer("1.0.0", "0.23.0") is True

    def test_same_version_is_not_newer(self) -> None:
        assert watcher.is_newer("0.23.0", "0.23.0") is False

    def test_older_version_is_not_newer(self) -> None:
        assert watcher.is_newer("0.22.9", "0.23.0") is False

    def test_prerelease_is_ignored(self) -> None:
        """A release candidate is not something to bump the pin to."""
        assert watcher.is_newer("0.24.0-rc.1", "0.23.0") is False

    def test_double_digit_segments_compare_numerically(self) -> None:
        """String comparison would put 0.9.0 above 0.10.0."""
        assert watcher.is_newer("0.10.0", "0.9.0") is True


class TestLatestPublishedVersion:
    def test_reads_the_version_from_npm_view(self) -> None:
        calls: list[list[str]] = []

        def runner(argv, **kwargs):
            calls.append(argv)
            return SimpleNamespace(returncode=0, stdout="0.24.0\n", stderr="")

        assert watcher.latest_published_version(runner=runner) == "0.24.0"
        assert calls == [["npm", "view", watcher.PACKAGE, "version"]]

    def test_npm_failure_raises(self) -> None:
        def runner(argv, **kwargs):
            return SimpleNamespace(returncode=1, stdout="", stderr="E404 not found")

        with pytest.raises(RuntimeError, match="E404"):
            watcher.latest_published_version(runner=runner)


class TestPinnedVersion:
    def test_reads_the_vendored_pin(self) -> None:
        """Same file the drift guard pins against - one source of truth."""
        assert watcher.pinned_version() == watcher.PIN_FILE.read_text(encoding="utf-8").strip()


class TestIssueFiling:
    """A newer release opens an issue rather than failing the build, and
    the same version must never file twice."""

    def test_title_names_the_version(self) -> None:
        assert "0.24.0" in watcher.issue_title("0.24.0")

    def test_newer_release_without_an_existing_issue_creates_one(self) -> None:
        commands = watcher.plan_issue(
            newer=True, latest="0.24.0", pinned="0.23.0", existing_issue=None
        )
        assert len(commands) == 1
        assert commands[0][:2] == ["issue", "create"]
        assert watcher.issue_title("0.24.0") in commands[0]

    def test_a_version_that_already_has_an_issue_files_nothing(self) -> None:
        commands = watcher.plan_issue(
            newer=True, latest="0.24.0", pinned="0.23.0", existing_issue=17
        )
        assert commands == []

    def test_an_up_to_date_pin_files_nothing(self) -> None:
        commands = watcher.plan_issue(
            newer=False, latest="0.23.0", pinned="0.23.0", existing_issue=None
        )
        assert commands == []

    def test_lookup_covers_closed_issues_so_a_declined_bump_stays_declined(self) -> None:
        seen: list[list[str]] = []

        def runner(argv, **kwargs):
            seen.append(argv)
            return SimpleNamespace(returncode=0, stdout="[]", stderr="")

        assert watcher.find_existing_issue("0.24.0", runner=runner) is None
        assert "--state" in seen[0]
        assert seen[0][seen[0].index("--state") + 1] == "all"

    def test_lookup_returns_the_matching_issue_number(self) -> None:
        def runner(argv, **kwargs):
            payload = f'[{{"number": 17, "title": "{watcher.issue_title("0.24.0")}"}}]'
            return SimpleNamespace(returncode=0, stdout=payload, stderr="")

        assert watcher.find_existing_issue("0.24.0", runner=runner) == 17

    def test_a_gh_failure_does_not_crash_the_watcher(self) -> None:
        def runner(argv, **kwargs):
            return SimpleNamespace(returncode=1, stdout="", stderr="rate limit")

        assert watcher.find_existing_issue("0.24.0", runner=runner) is None


class TestMain:
    def _runner(self, version: str):
        def runner(argv, **kwargs):
            return SimpleNamespace(returncode=0, stdout=f"{version}\n", stderr="")

        return runner

    def test_up_to_date_reports_and_exits_zero(self, capsys) -> None:
        pinned = watcher.pinned_version()
        exit_code = watcher.main([], runner=self._runner(pinned))
        assert exit_code == 0
        assert "up to date" in capsys.readouterr().out

    def test_newer_release_still_exits_zero(self, capsys) -> None:
        """Advisory by design: an upstream release must not redden CI."""
        exit_code = watcher.main([], runner=self._runner("99.0.0"))
        assert exit_code == 0
        out = capsys.readouterr().out
        assert "99.0.0" in out

    def test_writes_github_actions_outputs(self, tmp_path, monkeypatch) -> None:
        output_file = tmp_path / "gh-output"
        monkeypatch.setenv("GITHUB_OUTPUT", str(output_file))
        watcher.main([], runner=self._runner("99.0.0"))
        written = output_file.read_text(encoding="utf-8")
        assert "newer=true" in written
        assert "latest=99.0.0" in written
        assert f"pinned={watcher.pinned_version()}" in written

    def test_up_to_date_writes_newer_false(self, tmp_path, monkeypatch) -> None:
        output_file = tmp_path / "gh-output"
        monkeypatch.setenv("GITHUB_OUTPUT", str(output_file))
        watcher.main([], runner=self._runner(watcher.pinned_version()))
        assert "newer=false" in output_file.read_text(encoding="utf-8")

    def test_latest_can_be_injected_without_touching_npm(self, capsys) -> None:
        def explode(argv, **kwargs):  # pragma: no cover - must not run
            raise AssertionError("npm must not be called when --latest is given")

        assert watcher.main(["--latest", "0.23.0"], runner=explode) == 0
        assert "0.23.0" in capsys.readouterr().out
