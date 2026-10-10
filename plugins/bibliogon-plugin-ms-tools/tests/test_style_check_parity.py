"""#733: the recorded check_style output the browser port is checked against.

The editor's inline style check calls ``POST /api/ms-tools/check``, which
has no browser path, so in Dexie mode the toolbar button renders disabled
and inert. Making it work offline means a TypeScript ``checkStyle`` - and
a port written next to the original agrees with what its author believed
the original does, not with what it does.

So this records what ``check_style`` ACTUALLY returns for a set of texts
chosen to reach every finding type in every language it has tables for,
and ``frontend/src/lib/utils/msTools/styleFindings.parity.test.ts``
asserts the port reproduces it. Each half pins its own end:

- this file recomputes the output and fails when it differs from the
  record, so a rule change - or an edit to one of the
  ``content/fillers/*.yaml`` word lists - cannot pass silently,
- the Vitest fails when the port stops reproducing the record.

That covers the drift the duplicated word lists would otherwise invite:
``lib/utils/chapterMetrics.ts`` already carries its own copy of the
filler lists, and nothing until now compared them with the YAML.

Regenerate with ``MS_TOOLS_PARITY_WRITE=1 poetry run pytest
tests/test_style_check_parity.py`` after a deliberate rule change, and
read the diff before committing it: every line of it is a behaviour
change the port has to follow.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest
from bibliogon_ms_tools.style_checker import (
    DEFAULT_MAX_SENTENCE_LENGTH,
    DEFAULT_REPETITION_WINDOW,
    _load_allowlist,
    check_style,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_PATH = (
    REPO_ROOT
    / "frontend"
    / "src"
    / "lib"
    / "utils"
    / "msTools"
    / "styleFindings.parity.json"
)

#: Every finding type the checker can produce. A type no case reaches is
#: a rule the record does not cover, so the port could drop it unnoticed.
FINDING_TYPES = (
    "filler_word",
    "passive_voice",
    "long_sentence",
    "word_repetition",
    "adverb",
    "adjective",
    "redundant_phrase",
)

LONG_DE = (
    "Der Mann ging durch die Stadt und sah die Haeuser und die Menschen "
    "und die Autos und die Baeume und den Himmel und die Wolken und das "
    "Licht und den Schatten und er dachte an seine Kindheit und an das "
    "Meer und an den Sommer."
)

#: One case per finding type, plus the shapes where the two runtimes
#: could plausibly disagree: Unicode word boundaries, a word whose
#: lowercase form is longer than the original, and an astral character
#: ahead of a finding (see the offset note in the port).
CASES: list[dict[str, Any]] = [
    {"name": "empty", "language": "de", "text": ""},
    {"name": "whitespace-only", "language": "de", "text": "   \n  "},
    {
        "name": "clean-de",
        "language": "de",
        "text": "Der Hund lag im Hof. Die Katze sass auf dem Dach.",
    },
    {
        "name": "filler-de",
        "language": "de",
        "text": "Das ist eigentlich ganz einfach und wirklich nicht schwer.",
    },
    {
        "name": "filler-en",
        "language": "en",
        "text": "This is actually quite simple and really not very hard.",
    },
    {
        "name": "passive-de",
        "language": "de",
        "text": "Das Haus wird gebaut. Der Brief wurde geschrieben.",
    },
    {
        "name": "passive-en",
        "language": "en",
        "text": "The house was built. The letter has been written by her.",
    },
    {"name": "long-sentence-de", "language": "de", "text": LONG_DE},
    {
        "name": "repetition-de",
        "language": "de",
        "text": "Der Garten war gross. Im Garten stand ein Baum.",
    },
    {
        "name": "adverb-de",
        "language": "de",
        "text": "Er sprach freundlich und handelte moeglicherweise voreilig.",
    },
    {
        "name": "adverb-en",
        "language": "en",
        "text": "She quickly walked and quietly closed the door.",
    },
    {
        "name": "adverb-es",
        "language": "es",
        "text": "Habla claramente y camina lentamente por la calle.",
    },
    {
        "name": "adverb-fr",
        "language": "fr",
        "text": "Il parle doucement et marche rapidement vers la porte.",
    },
    {
        "name": "adjective-de",
        "language": "de",
        "text": "Ein sonniger Tag, ein maechtiger Baum, eine wunderbare Reise.",
    },
    {
        "name": "adjective-de-false-positive",
        "language": "de",
        "text": "Die Landschaft und die Gesellschaft und die Wissenschaft.",
    },
    {
        "name": "adjective-en-false-positive",
        "language": "en",
        "text": "The table is stable and we have trouble with the cable.",
    },
    {
        "name": "redundant-de",
        "language": "de",
        "text": "Meine persoenliche Meinung ist bereits schon bekannt.",
    },
    {
        # The German redundant-phrase list is spelled with ASCII
        # transliterations ("persoenliche", "zukuenftige"), so real
        # German prose does not match it. Recorded so the port
        # reproduces the list as it is, and so the day the list is
        # corrected this case changes and says so (#1040).
        "name": "redundant-de-real-umlauts",
        "language": "de",
        "text": "Meine pers\u00f6nliche Meinung zu den zuk\u00fcnftigen Pl\u00e4nen.",
    },
    {
        "name": "redundant-en",
        "language": "en",
        "text": "In my personal opinion the end result was a free gift.",
    },
    {
        # Every filler here carries an umlaut or an eszett, so a port
        # using JavaScript's ASCII \b or \w stops matching them.
        "name": "umlaut-fillers-de",
        "language": "de",
        "text": (
            "Nat\u00fcrlich war es gewisserma\u00dfen "
            "grunds\u00e4tzlich \u00fcbrigens selbstverst\u00e4ndlich."
        ),
    },
    {
        # A word the ASCII class splits in two ("nat" + "rlich"), which
        # changes the word count, the adverb's text and its offset.
        "name": "umlaut-word-splitting-de",
        "language": "de",
        "text": "Der K\u00e4fer lief m\u00fchsam \u00fcber die Stra\u00dfe.",
    },
    {
        "name": "accents-fr",
        "language": "fr",
        "text": "Il parle tr\u00e8s doucement et r\u00e9p\u00e8te r\u00e9guli\u00e8rement.",
    },
    {
        "name": "accents-es",
        "language": "es",
        "text": "Habla r\u00e1pidamente y act\u00faa espont\u00e1neamente.",
    },
    {
        "name": "lowercase-changes-length",
        "language": "tr",
        "text": "İstanbul ist actually nicht very weit.",
    },
    {
        "name": "astral-before-finding",
        "language": "de",
        "text": "\U0001f3e0 Das ist eigentlich einfach.",
    },
    {
        "name": "unknown-language-falls-back",
        "language": "zz",
        "text": "This is actually really very simple.",
    },
]


def _record_case(case: dict[str, Any]) -> dict[str, Any]:
    result = check_style(case["text"], case["language"])
    return {
        "name": case["name"],
        "language": case["language"],
        "text": case["text"],
        "expected": result,
    }


def _compute_record() -> dict[str, Any]:
    return {
        "_comment": (
            "Generated by plugins/bibliogon-plugin-ms-tools/tests/"
            "test_style_check_parity.py. Do not hand-edit: regenerate with "
            "MS_TOOLS_PARITY_WRITE=1 and read the diff."
        ),
        "defaults": {
            "max_sentence_length": DEFAULT_MAX_SENTENCE_LENGTH,
            "repetition_window": DEFAULT_REPETITION_WINDOW,
        },
        "cases": [_record_case(case) for case in CASES],
    }


def test_the_shipped_allowlists_are_empty() -> None:
    """The port has no allowlist, so the record must not assume one.

    ``content/allowlist/*.yaml`` ship as empty lists - a fresh install -
    and ``_filter_allowlist`` is a no-op for them. If a default ever
    carries terms, the record would bake in filtering the browser cannot
    reproduce, and this fails before that can happen silently.
    """
    for language in ("de", "en"):
        assert _load_allowlist(language) == set(), (
            f"the shipped {language} allowlist is no longer empty, so "
            f"check_style filters findings the browser port does not"
        )


def test_recorded_output_matches_the_live_checker() -> None:
    record = _compute_record()

    if os.environ.get("MS_TOOLS_PARITY_WRITE"):
        FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE_PATH.write_text(
            json.dumps(record, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        pytest.skip("record rewritten; re-run without MS_TOOLS_PARITY_WRITE")

    assert FIXTURE_PATH.exists(), (
        f"{FIXTURE_PATH} is missing. Generate it with "
        f"MS_TOOLS_PARITY_WRITE=1 poetry run pytest "
        f"tests/test_style_check_parity.py"
    )
    committed = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert committed == record, (
        "check_style no longer produces the recorded output. If the change "
        "is intended, regenerate the record and carry the same change into "
        "frontend/src/lib/utils/msTools/styleFindings.ts."
    )


def test_every_finding_type_is_exercised() -> None:
    """A type no case reaches is a rule the record does not cover."""
    record = _compute_record()
    seen = {
        finding["type"]
        for case in record["cases"]
        for finding in case["expected"]["findings"]
    }
    missing = set(FINDING_TYPES) - seen
    assert not missing, (
        f"no case in CASES produces {sorted(missing)}, so the port could "
        f"drop those rules without the parity test noticing"
    )


def test_a_clean_case_reports_nothing() -> None:
    """The happy path has to be reachable, or every case is a failure case."""
    record = _compute_record()
    clean = [c for c in record["cases"] if not c["expected"]["findings"]]
    assert clean, "no case is finding-free"
