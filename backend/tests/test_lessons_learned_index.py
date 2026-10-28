"""The lessons-learned index stays an index (#1141).

Everything in .claude/rules/ is loaded into every session. The entries
themselves live in docs/development/lessons-learned/<topic>.md; the rule
file carries one line per entry, so the rules stay in context without
the 300,000-character bodies.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
INDEX = REPO / ".claude" / "rules" / "lessons-learned.md"
TOPICS = REPO / "docs" / "development" / "lessons-learned"
BUDGET = 16_000
TOPIC_HEADING = re.compile(r"^## .+ - \[[\w-]+\.md\]\(\.\./\.\./docs/development/lessons-learned/([\w-]+\.md)\)$")


def _index_lines() -> list[str]:
    lines = INDEX.read_text(encoding="utf-8").splitlines()
    first_topic = next(i for i, line in enumerate(lines) if line.startswith("## "))
    return [line for line in lines[first_topic:] if line.strip()]


def _entry_titles() -> list[str]:
    titles = []
    for topic in sorted(TOPICS.glob("*.md")):
        titles += [l[3:].strip() for l in topic.read_text(encoding="utf-8").splitlines() if l.startswith("## ")]
    return titles


def test_the_index_stays_within_its_budget() -> None:
    size = len(INDEX.read_text(encoding="utf-8"))
    assert size <= BUDGET, f"lessons-learned index is {size} characters, budget {BUDGET}"


def test_the_index_holds_topic_headings_and_titles_only() -> None:
    stray = [l for l in _index_lines() if not (TOPIC_HEADING.match(l) or l.startswith("- "))]
    assert stray == [], f"the index carries more than titles: {stray[:3]}"


def test_every_topic_heading_points_at_an_existing_file() -> None:
    files = [TOPIC_HEADING.match(l).group(1) for l in _index_lines() if TOPIC_HEADING.match(l)]
    assert files
    assert [f for f in files if not (TOPICS / f).is_file()] == []


def test_index_and_entries_list_the_same_titles() -> None:
    indexed = [l[2:].strip() for l in _index_lines() if l.startswith("- ")]
    entries = _entry_titles()
    assert len(indexed) == len(set(indexed)), "a title is listed twice"
    assert sorted(set(entries) - set(indexed)) == [], "entries missing from the index"
    assert sorted(set(indexed) - set(entries)) == [], "index lines without an entry"
