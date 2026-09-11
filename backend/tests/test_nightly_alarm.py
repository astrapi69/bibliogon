"""Tests for the red-nightly alarm (#779).

A red nightly used to sit unnoticed - the web-speech spec was red for
14 consecutive nights before anyone looked (#711). The alarm keeps ONE
tracking issue per workflow: opened on the first failure, commented on
subsequent failures, closed on the next green run.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO_ROOT / "scripts" / "nightly_alarm.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("nightly_alarm", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


alarm = _load_module()

RUN_URL = "https://github.com/astrapi69/bibliogon/actions/runs/1"


def _commands(result: str, existing: int | None):
    return alarm.plan(
        result=result,
        existing_issue=existing,
        workflow="Nightly",
        run_url=RUN_URL,
    )


class TestPlan:
    def test_first_failure_opens_one_issue(self) -> None:
        commands = _commands("failure", None)
        assert len(commands) == 1
        assert commands[0][:2] == ["issue", "create"]
        assert alarm.issue_title("Nightly") in commands[0]
        assert alarm.LABEL in commands[0]

    def test_repeated_failure_comments_instead_of_opening_a_second_issue(self) -> None:
        commands = _commands("failure", 42)
        assert len(commands) == 1
        assert commands[0][:3] == ["issue", "comment", "42"]

    def test_green_run_closes_the_open_issue(self) -> None:
        commands = _commands("success", 42)
        assert [c[:2] for c in commands] == [["issue", "comment"], ["issue", "close"]]
        assert commands[1][2] == "42"

    def test_green_run_without_an_open_issue_does_nothing(self) -> None:
        assert _commands("success", None) == []

    def test_the_run_url_reaches_every_command_body(self) -> None:
        for result, existing in (("failure", None), ("failure", 7), ("success", 7)):
            for command in _commands(result, existing):
                if "--body" in command:
                    assert RUN_URL in command[command.index("--body") + 1]

    def test_title_is_stable_per_workflow_so_dedup_works(self) -> None:
        assert alarm.issue_title("Nightly") != alarm.issue_title("E2E Smoke Tests")
        assert alarm.issue_title("Nightly") == alarm.issue_title("Nightly")

    def test_cancelled_and_skipped_are_not_treated_as_failures(self) -> None:
        """A cancelled run says nothing about the code under test."""
        assert _commands("cancelled", None) == []
        assert _commands("skipped", None) == []


class TestFindOpenIssue:
    def test_returns_the_number_of_a_matching_open_issue(self) -> None:
        def runner(argv, **kwargs):
            return SimpleNamespace(returncode=0, stdout='[{"number": 99}]', stderr="")

        assert alarm.find_open_issue("Nightly", runner=runner) == 99

    def test_returns_none_when_nothing_matches(self) -> None:
        def runner(argv, **kwargs):
            return SimpleNamespace(returncode=0, stdout="[]", stderr="")

        assert alarm.find_open_issue("Nightly", runner=runner) is None

    def test_a_gh_failure_is_treated_as_no_issue_rather_than_crashing(self) -> None:
        """The alarm must never be the reason a workflow reports red."""

        def runner(argv, **kwargs):
            return SimpleNamespace(returncode=1, stdout="", stderr="gh: API rate limit")

        assert alarm.find_open_issue("Nightly", runner=runner) is None


class TestMain:
    def test_dry_run_executes_nothing(self, capsys) -> None:
        def explode(argv, **kwargs):  # pragma: no cover - must not run
            raise AssertionError("gh must not be called in dry-run mode")

        exit_code = alarm.main(
            ["--workflow", "Nightly", "--result", "failure", "--run-url", RUN_URL, "--dry-run"],
            runner=explode,
        )
        assert exit_code == 0
        assert "issue" in capsys.readouterr().out

    def test_main_exits_zero_even_when_gh_fails(self) -> None:
        """Fail open: a broken alarm must not mask the real result."""

        def runner(argv, **kwargs):
            return SimpleNamespace(returncode=1, stdout="", stderr="boom")

        exit_code = alarm.main(
            ["--workflow", "Nightly", "--result", "failure", "--run-url", RUN_URL],
            runner=runner,
        )
        assert exit_code == 0
