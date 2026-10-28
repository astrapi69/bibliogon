"""Condensed rule files stay condensed and complete (#1143).

Everything in .claude/rules/ is loaded into every session. The six large
rule files keep their full text in docs/development/rules/<name>.md; the
rule file is a summary of the binding rules. It keeps every ``##``
heading of the full text, so a reference such as coding-standards.md
"Recurring-Component Unification Rule" still finds its section.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
RULES = REPO / ".claude" / "rules"
FULL = REPO / "docs" / "development" / "rules"
SUMMARIZED = (
    "coding-standards",
    "ai-workflow",
    "architecture",
    "release-workflow",
    "quality-checks",
    "code-hygiene",
)
BUDGET = 6_000


def _h2(text: str) -> list[str]:
    headings, fenced = [], False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            fenced = not fenced
        elif not fenced and line.startswith("## "):
            headings.append(line[3:].strip())
    return headings


@pytest.mark.parametrize("name", SUMMARIZED)
def test_the_summary_stays_within_its_budget(name: str) -> None:
    size = len((RULES / f"{name}.md").read_text(encoding="utf-8"))
    assert size <= BUDGET, f"{name}.md is {size} characters, budget {BUDGET}"


@pytest.mark.parametrize("name", SUMMARIZED)
def test_the_summary_points_at_its_full_text(name: str) -> None:
    text = (RULES / f"{name}.md").read_text(encoding="utf-8")
    assert f"docs/development/rules/{name}.md" in text
    assert (FULL / f"{name}.md").is_file()


@pytest.mark.parametrize("name", SUMMARIZED)
def test_the_summary_keeps_every_section_heading(name: str) -> None:
    full = set(_h2((FULL / f"{name}.md").read_text(encoding="utf-8")))
    summary = set(_h2((RULES / f"{name}.md").read_text(encoding="utf-8")))
    assert sorted(full - summary) == []


def test_every_rule_file_together_stays_lean() -> None:
    total = sum(len(p.read_text(encoding="utf-8")) for p in RULES.glob("*.md"))
    assert total <= 70_000, f".claude/rules/ holds {total} characters"


def test_no_relative_link_in_a_full_text_is_broken() -> None:
    broken = []
    for path in FULL.glob("*.md"):
        for target in re.findall(r"\]\((\.\.[^)#\s]*)", path.read_text(encoding="utf-8")):
            if not (path.parent / target).resolve().exists():
                broken.append((path.name, target))
    assert broken == []
