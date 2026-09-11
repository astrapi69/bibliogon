"""Tests for the red-nightly alarm (#779 part 2).

A red nightly went unnoticed for 14 consecutive nights once (#711/#712), so
both nightly workflows now hold ONE tracking issue each: opened or commented
on failure, closed on the next green run.

The alarm is a shell step inside the workflow, which would otherwise be
"wired infrastructure that never ran" until its first firing - the exact
failure mode .claude/rules/lessons-learned.md warns about. These tests
extract that step straight out of the YAML and execute it against a stubbed
``gh`` on PATH, so the open / comment / close branching is exercised here
rather than discovered in production.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
WORKFLOWS = {
    "nightly": REPO_ROOT / ".github" / "workflows" / "nightly.yml",
    "e2e-smoke": REPO_ROOT / ".github" / "workflows" / "e2e-smoke.yml",
}

GH_STUB = """#!/usr/bin/env bash
# Stub gh: records the invocation and replays a canned issue-list result.
echo "$@" >> "$GH_CALLS"
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '%s' "$GH_LIST_RESULT"
fi
exit 0
"""


def alarm_script(workflow: str) -> str:
    document = yaml.safe_load(WORKFLOWS[workflow].read_text(encoding="utf-8"))
    job = document["jobs"]["nightly-alarm"]
    (step,) = [s for s in job["steps"] if "gh issue" in s.get("run", "")]
    return step["run"]


def strip_expressions(script: str) -> str:
    """Workflow expressions are substituted by Actions, not by bash."""
    return re.sub(r"\$\{\{.*?\}\}", "", script)


def run_alarm(
    tmp_path: Path, workflow: str, *, failed: bool, open_number: str | None
) -> tuple[subprocess.CompletedProcess, list[str]]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    stub = bin_dir / "gh"
    stub.write_text(GH_STUB, encoding="utf-8")
    stub.chmod(0o755)
    calls = tmp_path / "calls.txt"
    calls.write_text("", encoding="utf-8")

    script = tmp_path / "alarm.sh"
    script.write_text(strip_expressions(alarm_script(workflow)), encoding="utf-8")

    env = dict(os.environ)
    env.update(
        {
            "PATH": f"{bin_dir}:{env['PATH']}",
            "GH_CALLS": str(calls),
            # `gh issue list --jq` returns the resolved number, or nothing.
            "GH_LIST_RESULT": open_number or "",
            "TITLE": "Nightly workflow is red",
            "RUN_URL": "https://example.test/run/1",
            "FAILED": "true" if failed else "false",
        }
    )
    result = subprocess.run(
        ["bash", str(script)], capture_output=True, text=True, env=env, cwd=tmp_path
    )
    return result, [line for line in calls.read_text().splitlines() if line]


@pytest.mark.parametrize("workflow", sorted(WORKFLOWS))
class TestAlarmBranching:
    def test_red_with_nothing_open_creates_one_issue(self, tmp_path, workflow):
        result, calls = run_alarm(tmp_path, workflow, failed=True, open_number=None)
        assert result.returncode == 0, result.stderr
        created = [c for c in calls if c.startswith("issue create")]
        assert len(created) == 1
        assert not [c for c in calls if c.startswith("issue comment")]
        assert not [c for c in calls if c.startswith("issue close")]

    def test_red_with_an_open_issue_comments_instead_of_filing_again(self, tmp_path, workflow):
        """No spam: a run that is still red must not open a second issue."""
        result, calls = run_alarm(tmp_path, workflow, failed=True, open_number="123")
        assert result.returncode == 0, result.stderr
        commented = [c for c in calls if c.startswith("issue comment")]
        assert len(commented) == 1
        assert "123" in commented[0]
        assert not [c for c in calls if c.startswith("issue create")]

    def test_green_with_an_open_issue_closes_it(self, tmp_path, workflow):
        result, calls = run_alarm(tmp_path, workflow, failed=False, open_number="123")
        assert result.returncode == 0, result.stderr
        closed = [c for c in calls if c.startswith("issue close")]
        assert len(closed) == 1
        assert "123" in closed[0]
        assert not [c for c in calls if c.startswith("issue create")]

    def test_green_with_nothing_open_does_nothing(self, tmp_path, workflow):
        result, calls = run_alarm(tmp_path, workflow, failed=False, open_number=None)
        assert result.returncode == 0, result.stderr
        assert not [
            c for c in calls if c.startswith(("issue create", "issue comment", "issue close"))
        ]
        assert "nothing was open" in result.stdout


@pytest.mark.parametrize("workflow", sorted(WORKFLOWS))
class TestAlarmWiring:
    def test_runs_even_when_an_upstream_job_failed(self, workflow):
        """Without `if: always()` the alarm would be skipped by the very
        failure it exists to report."""
        document = yaml.safe_load(WORKFLOWS[workflow].read_text(encoding="utf-8"))
        assert document["jobs"]["nightly-alarm"]["if"] == "always()"

    def test_has_issue_write_permission(self, workflow):
        document = yaml.safe_load(WORKFLOWS[workflow].read_text(encoding="utf-8"))
        job = document["jobs"]["nightly-alarm"]
        assert job["permissions"]["issues"] == "write"

    def test_waits_for_every_other_job(self, workflow):
        document = yaml.safe_load(WORKFLOWS[workflow].read_text(encoding="utf-8"))
        jobs = document["jobs"]
        needs = jobs["nightly-alarm"]["needs"]
        needs = [needs] if isinstance(needs, str) else needs
        others = {name for name in jobs if name != "nightly-alarm"}
        assert set(needs) == others, (
            "a job missing from `needs` can fail without the alarm noticing"
        )

    def test_counts_cancelled_as_red(self, workflow):
        document = yaml.safe_load(WORKFLOWS[workflow].read_text(encoding="utf-8"))
        failed_expression = document["jobs"]["nightly-alarm"]["env"]["FAILED"]
        assert "failure" in failed_expression
        assert "cancelled" in failed_expression
