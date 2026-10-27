"""CLAUDE.md stays within its own budget (#1139).

The file is loaded into every prompt. ``ai-workflow.md`` sets the
target at under 8000 characters; by v0.60.0 it had grown to about
60,000, almost all of it release summaries that already live in
docs/CHANGELOG.md. A release adds no summary here any more.
"""

from __future__ import annotations

from pathlib import Path

CLAUDE_MD = Path(__file__).resolve().parents[2] / "CLAUDE.md"
BUDGET = 8000


def test_claude_md_stays_within_its_budget() -> None:
    size = len(CLAUDE_MD.read_text(encoding="utf-8"))
    assert size <= BUDGET, (
        f"CLAUDE.md is {size} characters, budget {BUDGET}. Move detail into "
        ".claude/rules/ or docs/ and point at it; release notes belong in "
        "docs/CHANGELOG.md."
    )


def test_claude_md_carries_no_release_history() -> None:
    text = CLAUDE_MD.read_text(encoding="utf-8")
    assert "Previous release" not in text
