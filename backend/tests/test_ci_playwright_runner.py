"""Guard: a job that installs Playwright runs on a pinned Ubuntu image (#1166).

``ubuntu-latest`` moved to the 26.04 image on 2026-10-10. The pinned
Playwright could not install its browser there, and every browser suite
(E2E smoke, manual-testplan automation, visual regression) failed in the
install step for five weeks without running a single test. A floating
runner label lets the next image move do the same; a pinned one turns
the move into a deliberate change together with a Playwright bump and,
for the pixel gate, new baselines.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

_WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"
_PINNED_UBUNTU = re.compile(r"^ubuntu-\d{2}\.\d{2}$")


def _playwright_jobs() -> list[tuple[str, str, object]]:
    jobs = []
    for path in sorted(_WORKFLOWS.glob("*.yml")):
        workflow = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for name, job in (workflow.get("jobs") or {}).items():
            steps = job.get("steps") or []
            if any("playwright install" in str(step.get("run", "")) for step in steps):
                jobs.append((path.name, name, job.get("runs-on")))
    return jobs


def test_the_scan_finds_the_browser_suites() -> None:
    files = {workflow for workflow, _, _ in _playwright_jobs()}
    assert {"e2e-smoke.yml", "visual-regression.yml", "manual-automation.yml"} <= files


@pytest.mark.parametrize("workflow,job,runner", _playwright_jobs())
def test_a_playwright_job_runs_on_a_pinned_ubuntu(workflow: str, job: str, runner: object) -> None:
    assert isinstance(runner, str) and _PINNED_UBUNTU.match(runner), (
        f"{workflow}:{job} installs Playwright on {runner!r}; pin an image such as "
        "ubuntu-24.04 - a floating label broke every browser suite once (#1166)"
    )
