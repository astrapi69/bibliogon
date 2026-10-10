"""#751: the recorded TipTap extract/rebuild the browser port is checked against.

Whole-article and whole-book translation run through the backend
translation plugin, so in Dexie mode the panel renders disabled. Making it
work offline means a TypeScript port of the two functions that turn a
chapter into translatable prose and back - and a port written next to the
original agrees with what its author believed the original does, not with
what it does.

So this records what ``extract_plain_text_from_tiptap`` and
``rebuild_tiptap_with_translation`` ACTUALLY return for a set of inputs
chosen to reach all four content shapes a Chapter or Article body can
hold, plus the quirks that survive a round trip.
``frontend/src/lib/translation/tiptapTranslate.parity.test.ts`` asserts the
port reproduces it, and this file fails when the Python changes.

What this record does NOT cover, stated rather than implied: the ROUTE.
``translate_article`` decides which fields are translated, which are copied
verbatim, the title suffix, the ``draft`` status, the language code and the
single-paragraph fallback when a rebuild drops the translation. Recording
that would need a DB session and a provider, so the port pins it with its
own tests against the route read by hand
(``bibliogon_translation/routes.py:404-502``). That split is deliberate -
the #1042 lesson is that a record taken below the API boundary cannot see
what the route supplies, so the half it cannot see has to be named.

Regenerate with ``TRANSLATE_PARITY_WRITE=1 poetry run pytest
tests/test_translate_parity.py`` after a deliberate change, and read the
diff: every line of it is behaviour the port has to follow.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]

# ``extract_plain_text_from_tiptap`` reaches for
# ``app.services.html_text.html_to_plain_text`` when the content is HTML,
# which is what every imported chapter is until someone opens and saves it
# (#787). The plugin does not depend on the backend package, so that
# branch is unreachable from this suite as installed - and it is the
# single most common shape in production, so recording the port without it
# would leave the port's riskiest path unpinned. Putting ``backend/`` on
# the path here makes the import resolve the same way it does in the
# running app, where the plugin is loaded inside the backend process.
_BACKEND = REPO_ROOT / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from bibliogon_translation.book_translator import (  # noqa: E402
    extract_plain_text_from_tiptap,
    rebuild_tiptap_with_translation,
)

FIXTURE_PATH = (
    REPO_ROOT
    / "frontend"
    / "src"
    / "lib"
    / "translation"
    / "tiptapTranslate.parity.json"
)


def _doc(*blocks: dict) -> str:
    return json.dumps({"type": "doc", "content": list(blocks)}, ensure_ascii=False)


def _para(*texts: str) -> dict:
    return {
        "type": "paragraph",
        "content": [{"type": "text", "text": text} for text in texts],
    }


#: Inputs chosen to reach every content shape and every quirk. A shape no
#: case covers is a shape the port could get wrong unnoticed - and an
#: imported chapter is HTML until someone opens and saves it (#787), which
#: is the shape a TipTap-only fixture set would miss entirely.
EXTRACT_CASES: list[dict] = [
    {"name": "empty", "content": ""},
    {"name": "whitespace-only", "content": "   \n  "},
    {"name": "plain-text", "content": "Das ist schon Prosa."},
    {
        "name": "html-imported",
        "content": "<h1>Titel</h1><p>Ein Satz.</p><p>Noch einer.</p>",
    },
    {"name": "html-with-entities", "content": "<p>Caf&eacute; &amp; Kuchen</p>"},
    {"name": "single-paragraph", "content": _doc(_para("Ein Satz."))},
    {
        "name": "two-paragraphs",
        "content": _doc(_para("Erster Absatz."), _para("Zweiter Absatz.")),
    },
    {
        "name": "split-text-nodes",
        "content": _doc(_para("Ein ", "geteilter ", "Satz.")),
    },
    {
        "name": "heading-and-blockquote",
        "content": _doc(
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "Kapitel"}],
            },
            {"type": "blockquote", "content": [_para("Zitat.")]},
        ),
    },
    {
        "name": "bullet-list",
        "content": _doc(
            {
                "type": "bulletList",
                "content": [
                    {"type": "listItem", "content": [_para("Eins")]},
                    {"type": "listItem", "content": [_para("Zwei")]},
                ],
            }
        ),
    },
    {
        "name": "image-figure-no-text",
        "content": _doc(
            {"type": "imageFigure", "attrs": {"src": "a.png", "alt": "A"}},
            _para("Bildunterschrift folgt."),
        ),
    },
    {"name": "empty-doc", "content": _doc()},
    {"name": "malformed-json", "content": '{"type": "doc", "content": ['},
]

#: Rebuild is where a port silently diverges: the segment split drops empty
#: lines, segments are consumed one per text node in document order, and a
#: node with no segment left keeps its original text.
REBUILD_CASES: list[dict] = [
    {
        "name": "one-for-one",
        "original": _doc(_para("Ein Satz."), _para("Noch einer.")),
        "translated": "One sentence.\n\nAnd another.",
    },
    {
        "name": "fewer-segments-than-nodes",
        "original": _doc(_para("Eins."), _para("Zwei."), _para("Drei.")),
        "translated": "One.",
    },
    {
        "name": "more-segments-than-nodes",
        "original": _doc(_para("Eins.")),
        "translated": "One.\nTwo.\nThree.",
    },
    {
        "name": "split-text-nodes-get-one-segment-each",
        "original": _doc(_para("Ein ", "geteilter ", "Satz.")),
        "translated": "A\nsplit\nsentence.",
    },
    {
        "name": "marks-and-attrs-survive",
        "original": _doc(
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "fett", "marks": [{"type": "bold"}]},
                    {"type": "text", "text": " normal"},
                ],
            }
        ),
        "translated": "bold\n normal",
    },
    {
        "name": "non-json-original-returns-the-translation",
        "original": "<p>Ein Satz.</p>",
        "translated": "One sentence.",
    },
    {"name": "empty-original", "original": "", "translated": "One sentence."},
    {
        "name": "empty-translation",
        "original": _doc(_para("Ein Satz.")),
        "translated": "",
    },
]


def _compute_record() -> dict:
    return {
        "extract": [
            {
                "name": case["name"],
                "content": case["content"],
                "expected": extract_plain_text_from_tiptap(case["content"]),
            }
            for case in EXTRACT_CASES
        ],
        "rebuild": [
            {
                "name": case["name"],
                "original": case["original"],
                "translated": case["translated"],
                "expected": rebuild_tiptap_with_translation(
                    case["original"], case["translated"]
                ),
            }
            for case in REBUILD_CASES
        ],
    }


@pytest.mark.skipif(
    not os.environ.get("TRANSLATE_PARITY_WRITE"),
    reason="set TRANSLATE_PARITY_WRITE=1 to regenerate the recorded fixture",
)
def test_write_the_record() -> None:
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(
        json.dumps(_compute_record(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def test_recorded_output_matches_the_live_functions() -> None:
    # Serialise first, then compare what the file would hold rather than
    # the live objects - the write path skips this test, so a generator
    # verified only with the env-var set is a gate that was never run
    # (the lesson from #890's record).
    assert FIXTURE_PATH.exists(), (
        f"{FIXTURE_PATH} is missing. Generate it with "
        "TRANSLATE_PARITY_WRITE=1 poetry run pytest tests/test_translate_parity.py"
    )
    serialised = json.loads(json.dumps(_compute_record(), indent=2, ensure_ascii=False))
    committed = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert committed == serialised


def test_every_case_name_is_unique() -> None:
    # A duplicate name silently overwrites nothing here but makes a
    # failure report point at the wrong case.
    for key, cases in (("extract", EXTRACT_CASES), ("rebuild", REBUILD_CASES)):
        names = [case["name"] for case in cases]
        assert len(names) == len(set(names)), f"duplicate case name in {key}"
