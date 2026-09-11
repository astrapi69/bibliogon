#!/usr/bin/env python3
"""Keep one tracking issue per workflow while a nightly run is red (#779).

A red nightly blocks no pull request, which is exactly why it can rot:
the web-speech spec was red for 14 consecutive nights before anyone
looked (#711). This script closes that gap without producing an issue
per night:

- first failure: open ONE issue, titled after the workflow
- further failures: comment on that issue instead of opening another
- next green run: comment and close it
- green with no open issue: do nothing

It fails open. A broken alarm (no permission, rate limit, gh missing)
must never be the reason a workflow reports red, so every gh error is
reported and swallowed, and the exit code is always 0.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections.abc import Callable
from typing import Protocol

LABEL = "nightly-red"

#: Only these results say something about the code under test. A
#: cancelled or skipped run must neither open nor close an alarm.
FAILURE_RESULTS = frozenset({"failure", "timed_out"})
SUCCESS_RESULTS = frozenset({"success"})


class CompletedLike(Protocol):
    returncode: int
    stdout: str
    stderr: str


Runner = Callable[..., CompletedLike]


def _default_runner(argv: list[str], **kwargs) -> CompletedLike:
    return subprocess.run(argv, capture_output=True, text=True, check=False, **kwargs)


def issue_title(workflow: str) -> str:
    """Stable per-workflow title - the dedup key for the tracking issue."""
    return f"ci({workflow}): nightly run is red"


def _failure_body(workflow: str, run_url: str) -> str:
    return (
        f"The nightly `{workflow}` workflow failed.\n\n"
        f"Run: {run_url}\n\n"
        "This issue is opened by the nightly alarm and closes itself on the "
        "next green run. Further failures are added as comments rather than "
        "as new issues."
    )


def _recovery_body(workflow: str, run_url: str) -> str:
    return f"`{workflow}` is green again.\n\nRun: {run_url}\n\nClosing automatically."


def plan(
    *, result: str, existing_issue: int | None, workflow: str, run_url: str
) -> list[list[str]]:
    """Decide which gh commands the current run needs.

    Args:
        result: The aggregated workflow result (``success``, ``failure``, ...).
        existing_issue: Number of the open tracking issue, if any.
        workflow: Human-readable workflow name, used in the issue title.
        run_url: Link to the run that triggered this alarm.

    Returns:
        gh argument vectors, in the order they must be executed.
    """
    if result in FAILURE_RESULTS:
        body = _failure_body(workflow, run_url)
        if existing_issue is None:
            return [
                [
                    "issue",
                    "create",
                    "--title",
                    issue_title(workflow),
                    "--label",
                    LABEL,
                    "--body",
                    body,
                ]
            ]
        return [["issue", "comment", str(existing_issue), "--body", body]]

    if result in SUCCESS_RESULTS and existing_issue is not None:
        body = _recovery_body(workflow, run_url)
        return [
            ["issue", "comment", str(existing_issue), "--body", body],
            ["issue", "close", str(existing_issue), "--comment", body],
        ]

    return []


def find_open_issue(workflow: str, runner: Runner = _default_runner) -> int | None:
    """Number of the open tracking issue for ``workflow``, if one exists.

    A gh failure is reported and treated as "no issue" - see the
    fail-open note in the module docstring.
    """
    result = runner(
        [
            "gh",
            "issue",
            "list",
            "--state",
            "open",
            "--search",
            f'"{issue_title(workflow)}" in:title',
            "--json",
            "number,title",
            "--limit",
            "50",
        ]
    )
    if result.returncode != 0:
        print(f"WARNING: could not list issues: {result.stderr.strip()}", file=sys.stderr)
        return None
    try:
        issues = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as error:
        print(f"WARNING: unreadable gh output: {error}", file=sys.stderr)
        return None
    wanted = issue_title(workflow)
    for issue in issues:
        if issue.get("title") == wanted:
            return int(issue["number"])
    return int(issues[0]["number"]) if issues else None


def _ensure_label(runner: Runner) -> None:
    """Create the alarm label once; an existing label is not an error."""
    runner(
        [
            "gh",
            "label",
            "create",
            LABEL,
            "--description",
            "A nightly workflow is currently failing",
            "--color",
            "B60205",
        ]
    )


def main(argv: list[str] | None = None, runner: Runner = _default_runner) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--workflow", required=True, help="Workflow name for the issue title")
    parser.add_argument("--result", required=True, help="Aggregated result of the run")
    parser.add_argument("--run-url", required=True, help="Link to the run")
    parser.add_argument(
        "--dry-run", action="store_true", help="Print the gh commands instead of running them"
    )
    args = parser.parse_args(argv)

    existing = None if args.dry_run else find_open_issue(args.workflow, runner=runner)
    commands = plan(
        result=args.result,
        existing_issue=existing,
        workflow=args.workflow,
        run_url=args.run_url,
    )

    if not commands:
        print(f"Nothing to do (result={args.result}, open issue={existing}).")
        return 0

    for command in commands:
        if args.dry_run:
            print("gh " + " ".join(command))
            continue
        if command[:2] == ["issue", "create"]:
            _ensure_label(runner)
        result = runner(["gh", *command])
        if result.returncode != 0:
            print(
                f"WARNING: gh {command[0]} {command[1]} failed: {result.stderr.strip()}",
                file=sys.stderr,
            )
        else:
            print(result.stdout.strip())

    return 0


if __name__ == "__main__":
    sys.exit(main())
