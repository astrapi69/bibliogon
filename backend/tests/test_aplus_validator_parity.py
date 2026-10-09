"""#890: the recorded Python findings the TypeScript port is checked against.

A port whose tests are written by hand next to the original agrees with
what its author believed the original does. This file records what the
original ACTUALLY does, for a set of inputs chosen to reach every finding
code in all four languages, and
``frontend/src/lib/aplus/validation.parity.test.ts`` asserts the
TypeScript validator reproduces it exactly - same codes, same fields,
same order, same params.

The fixture is committed rather than generated at test time because the
two sides run in different languages and different CI jobs; neither can
call the other. Each half pins its own end of it:

- this file recomputes the Python findings and fails when they differ
  from the record, so a rule change in ``bibliogon_aplus`` cannot pass
  silently,
- the Vitest fails when the port stops reproducing the record.

Regenerate with ``APLUS_PARITY_WRITE=1 poetry run pytest
tests/test_aplus_validator_parity.py`` after a deliberate rule change,
and read the diff before committing it: every line of it is a behaviour
change the port has to follow.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest
from bibliogon_aplus.rules import get_ruleset
from bibliogon_aplus.schema import (
    AplusImage,
    AplusMeta,
    AplusPackage,
    Bullet,
    ModuleHeader,
    ThreeImageEntry,
)
from bibliogon_aplus.validation import validate_package

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "frontend" / "src" / "lib" / "aplus" / "validation.parity.json"

RULES = get_ruleset()

CLEAN_BULLETS = [
    {"heading": "Clear structure", "body": "Chapters build on each other."},
    {"heading": "Real examples", "body": "Every idea comes with a concrete case."},
    {"heading": "Practical takeaways", "body": "Readers leave with something usable."},
]

CLEAN_IMAGES = [
    {"text": "A supporting idea from the book.", "alt_text": "Icon representing concept one"},
    {"text": "Another supporting idea.", "alt_text": "Icon representing concept two"},
    {"text": "A final supporting idea.", "alt_text": "Icon representing concept three"},
]

#: One case per rule, plus one per language, plus the shapes where the
#: two runtimes could plausibly disagree (astral characters, a lone
#: surrogate, a word with a diacritic adjacent to a listed word).
CASES: list[dict[str, Any]] = [
    {"name": "clean-en", "language": "en", "genre_key": None, "package": {}},
    {
        "name": "imperative-de",
        "language": "de",
        "genre_key": None,
        "package": {"short_description": "Entdecken Sie das Buch."},
    },
    {
        "name": "imperative-en",
        "language": "en",
        "genre_key": None,
        "package": {"short_description": "Learn how to make better decisions every single day."},
    },
    {
        "name": "imperative-fr",
        "language": "fr",
        "genre_key": None,
        "package": {"short_description": "Apprenez a prendre de meilleures decisions."},
    },
    {
        "name": "imperative-es",
        "language": "es",
        "genre_key": None,
        "package": {"short_description": "Aprenda a tomar mejores decisiones cada dia."},
    },
    {
        "name": "leading-imperative-de-unlisted",
        "language": "de",
        "genre_key": None,
        "package": {"short_description": "Erobern Sie neue Wissensgebiete."},
    },
    {
        "name": "leading-imperative-fr-unlisted",
        "language": "fr",
        "genre_key": None,
        "package": {"short_description": "Gagnez en clarte des le premier chapitre."},
    },
    {
        "name": "leading-only-en-opening",
        "language": "en",
        "genre_key": None,
        "package": {"short_description": "Build a new habit, one chapter at a time."},
    },
    {
        "name": "leading-only-en-mid-sentence",
        "language": "en",
        "genre_key": None,
        "package": {"short_description": "Every chapter helps readers build confidence."},
    },
    {
        "name": "fr-non-verb-ez",
        "language": "fr",
        "genre_key": None,
        "package": {"short_description": "Assez de theorie, place a la pratique."},
    },
    {
        "name": "price-claim-de",
        "language": "de",
        "genre_key": None,
        "package": {"short_description": "Jetzt kostenlos lesen und sparen."},
    },
    {
        "name": "soft-word-warning",
        "language": "en",
        "genre_key": "scifi",
        "package": {"short_description": "A gripping tale of theft and betrayal."},
    },
    {
        "name": "soft-word-escalated",
        "language": "en",
        "genre_key": "kinderbuch",
        "package": {"short_description": "A gripping tale of theft and betrayal."},
    },
    {
        "name": "unknown-genre-key",
        "language": "en",
        "genre_key": "totally-unknown",
        "package": {"short_description": "A gripping tale of theft in the colonies."},
    },
    {
        "name": "dash-and-emoji-and-imperative",
        "language": "de",
        "genre_key": None,
        "package": {
            "short_description": "Entdecken Sie \U0001f600 — jetzt nur 9,99 EUR bei Kindle."
        },
    },
    {
        "name": "zero-width-space",
        "language": "en",
        "genre_key": None,
        "package": {"short_description": "A book​about habits."},
    },
    {
        "name": "control-character",
        "language": "en",
        "genre_key": None,
        "package": {"short_description": "A book\u0007about habits."},
    },
    {
        "name": "over-max-length",
        "language": "en",
        "genre_key": None,
        "package": {"short_description": "x" * 5000},
    },
    {
        "name": "astral-at-the-limit",
        "language": "en",
        "genre_key": None,
        "package": {
            # 300 code points of an astral character: at the limit for
            # Python's len(), double it for JavaScript's .length.
            "short_description": "\U0001f600" * RULES.schema_limits["short_description"]
        },
    },
    {
        "name": "soft-word-before-a-diacritic",
        "language": "de",
        "genre_key": None,
        # "Mord" followed by "u" with an umlaut. Python's word boundary
        # treats the umlaut as a word character, so this compound is not
        # the listed word and produces nothing. JavaScript's word boundary
        # is ASCII-only and WOULD see a boundary there, so this case is
        # what fails when the port uses it.
        "package": {"short_description": "Ein Mordüberfall im Hafen."},
    },
    {
        "name": "brand-reference",
        "language": "en",
        "genre_key": None,
        "package": {"short_description": "Also available on Audible this autumn."},
    },
    {
        "name": "lone-surrogate",
        "language": "en",
        "genre_key": None,
        # A lone surrogate is the only thing a Python str can hold that
        # fails to encode as UTF-8, and it is category Cs, so it trips
        # the hidden-character rule too. Both findings, both runtimes.
        #
        # It is spelled as code units because it cannot survive the
        # fixture as a string: ``\ud800`` is a legal JSON escape, but
        # Vite's JSON loader rejects an unpaired one, so the case would
        # take the whole Vitest file down with a parse error rather than
        # reaching the validator. See ``_spec_for_record``.
        "package": {
            "short_description_code_units": [
                65,
                32,
                98,
                111,
                111,
                107,
                32,
                0xD800,
                32,
                97,
                98,
                111,
                117,
                116,
                32,
                104,
                97,
                98,
                105,
                116,
                115,
                46,
            ]
        },
    },
    {
        "name": "missing-alt-text",
        "language": "en",
        "genre_key": None,
        "package": {"header_alt": "   "},
    },
    {
        "name": "alt-text-one-over",
        "language": "en",
        "genre_key": None,
        "package": {"header_alt": "a" * (RULES.schema_limits["alt_text"] + 1)},
    },
    {
        "name": "structural-counts",
        "language": "en",
        "genre_key": None,
        "package": {"bullets": CLEAN_BULLETS[:1], "three_images": CLEAN_IMAGES[:1]},
    },
    {
        "name": "empty-package",
        "language": "en",
        "genre_key": None,
        "package": {
            "short_description": "",
            "bullets": [],
            "header_text": "",
            "header_alt": "",
            "three_images": [],
        },
    },
]


def _short_description(spec: dict[str, Any]) -> str:
    """The case's text, rebuilt from code units when it needs them.

    A lone surrogate has no valid UTF-8 encoding and no JSON escape the
    frontend's loader accepts, so such a case records its code units and
    both sides rebuild the same string from them.
    """
    units = spec.get("short_description_code_units")
    if units is not None:
        return "".join(chr(unit) for unit in units)
    return spec.get("short_description", "A clear, engaging description of the book's premise.")


def _build_package(spec: dict[str, Any], language: str) -> AplusPackage:
    bullets = spec.get("bullets", CLEAN_BULLETS)
    images = spec.get("three_images", CLEAN_IMAGES)
    return AplusPackage(
        short_description=_short_description(spec),
        bullets=[Bullet(**bullet) for bullet in bullets],
        module_header=ModuleHeader(
            title="Overview",
            text=spec.get(
                "header_text", "An inviting overview of what the reader will find inside."
            ),
            image=AplusImage(prompt="minimalist, flat colors"),
            alt_text=spec.get("header_alt", "Illustration of the book's theme"),
        ),
        module_three_images=[
            ThreeImageEntry(
                title=f"Concept {index + 1}",
                text=entry["text"],
                image=AplusImage(prompt="minimalist, flat colors"),
                alt_text=entry["alt_text"],
            )
            for index, entry in enumerate(images)
        ],
        meta=AplusMeta(
            book_id="b1",
            language=language,
            ruleset_version=RULES.version,
            generated_at="2026-09-15T00:00:00Z",
        ),
    )


def _findings_for(case: dict[str, Any]) -> list[dict[str, Any]]:
    package = _build_package(case["package"], case["language"])
    findings = validate_package(
        package,
        language=case["language"],
        genre_key=case["genre_key"],
        rules=RULES,
    )
    return [
        {
            "field": f.field,
            "severity": f.severity,
            "code": f.code,
            "params": dict(f.params),
        }
        for f in findings
    ]


def _compute_record() -> dict[str, Any]:
    return {
        "ruleset_version": RULES.version,
        "cases": [
            {
                "name": case["name"],
                "language": case["language"],
                "genre_key": case["genre_key"],
                "package": case["package"],
                "findings": _findings_for(case),
            }
            for case in CASES
        ],
    }


@pytest.fixture(scope="module")
def record() -> dict[str, Any]:
    computed = _compute_record()
    if os.environ.get("APLUS_PARITY_WRITE"):
        FIXTURE_PATH.write_text(
            json.dumps(computed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    assert FIXTURE_PATH.is_file(), (
        f"{FIXTURE_PATH} is missing - regenerate with "
        "APLUS_PARITY_WRITE=1 poetry run pytest tests/test_aplus_validator_parity.py"
    )
    return computed


@pytest.fixture(scope="module")
def committed() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_the_record_matches_the_current_validator(
    record: dict[str, Any], committed: dict[str, Any]
) -> None:
    """A rule change in ``bibliogon_aplus`` must not pass silently.

    When this fails, the validator changed. Regenerate the fixture, read
    the diff, and carry the same change into
    ``frontend/src/lib/aplus/validation.ts`` - the Vitest beside it is
    what fails until you do.
    """
    assert committed["ruleset_version"] == record["ruleset_version"]
    by_name = {case["name"]: case for case in committed["cases"]}
    for case in record["cases"]:
        assert case["name"] in by_name, f"{case['name']} is missing from the fixture"
        assert by_name[case["name"]]["findings"] == case["findings"], case["name"]
    assert set(by_name) == {case["name"] for case in record["cases"]}


def test_every_finding_code_appears_in_the_record(record: dict[str, Any]) -> None:
    """The cases are only parity evidence if they reach every rule."""
    from bibliogon_aplus.validation import FINDING_CODES

    seen = {finding["code"] for case in record["cases"] for finding in case["findings"]}
    assert seen == FINDING_CODES, FINDING_CODES - seen
