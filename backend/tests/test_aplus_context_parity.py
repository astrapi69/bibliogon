"""#890: the recorded context assembly the browser port is checked against.

``POST /aplus/{book_id}/generate`` does four deterministic things before
it ever reaches a provider, and one on the way out:

1. ``find_missing_fields(book)`` - short-circuits with no AI call,
2. ``build_book_context(book)`` - normalises the row to plain text and
   decoded lists, and resolves the genre key,
3. the language override (``language or context.language``, checked
   against ``SUPPORTED_LANGUAGES``),
4. ``compute_source_hash(context, rules.version)`` - the cache key,
5. ``with_rendered_prompts(package)`` - derives each image slot's
   copy-and-paste string, never persisted.

All five run without a provider, so all five can be recorded and the
browser port checked against the recording rather than against what its
author believed the original does.

Recorded from BOOK ROWS rather than from hand-built contexts, because
the row is what the route receives. A record taken below that boundary
would miss what the route adds - which is exactly how #1042 happened.

The ``frontend_book`` field of each case carries the same row in the
frontend's ``Book`` shape, where ``bisac_codes`` / ``categories`` /
``keywords`` are already arrays rather than JSON strings. That mapping
is the one real shape difference between the two sides, so the record
states it instead of leaving each side to assume it.

Lives in ``backend/tests/`` rather than the plugin's own suite because
it feeds HTML-shaped source text through ``build_book_context``, which
lazily imports ``app.services.html_text``. The plugin's isolated venv
has no ``app`` - its own module docstring names this as the reason such
tests belong here.

Regenerate with ``APLUS_CONTEXT_PARITY_WRITE=1 poetry run pytest
tests/test_aplus_context_parity.py`` after a deliberate change, and
read the diff: every line of it is a behaviour change the port has to
follow.
"""

from __future__ import annotations

import dataclasses
import json
import os
from pathlib import Path
from typing import Any

import pytest
from bibliogon_aplus.book_context import (
    _JUVENILE_TEXT_MARKERS,
    build_book_context,
    find_missing_fields,
)
from bibliogon_aplus.generator import compute_source_hash
from bibliogon_aplus.image_prompts import (
    build_style_context,
    render_image_prompt,
    with_rendered_prompts,
)
from bibliogon_aplus.rules import get_ruleset
from bibliogon_aplus.schema import AplusImage

from tests.aplus_context_cases import (
    CASES,
    LIST_FIELDS,
    PACKAGE_CASES,
    RENDER_CASES,
    STYLE_GENRES,
    BookStub,
)
from tests.repo_root import find_repo_root

REPO_ROOT = find_repo_root(Path(__file__))
FIXTURE_PATH = REPO_ROOT / "frontend" / "src" / "lib" / "aplus" / "context.parity.json"


def _frontend_book(raw: dict[str, Any]) -> dict[str, Any]:
    """The same row in the frontend's Book shape: lists decoded."""
    out = dict(raw)
    for name in LIST_FIELDS:
        value = raw.get(name)
        if value is None:
            out[name] = []
            continue
        try:
            decoded = json.loads(value)
        except (ValueError, TypeError):
            decoded = []
        out[name] = decoded if isinstance(decoded, list) else []
    return out


def _marker_probes() -> list[dict[str, Any]]:
    """Every juvenile-text marker, three ways.

    The hand-picked genre cases above happen to use ASCII-spelled
    markers only, so ASCII-ifying ``album illustre`` in the port would
    not have failed a single one of them - the #733 mistake, where a
    whole fixture set turned out to prove nothing. This walks the table
    instead, so no entry can be dropped or mangled unnoticed.

    Per marker: the marker itself, the marker uppercased (the match is
    case-insensitive), and the marker one character short (which must
    NOT match, or the port is matching too loosely).
    """
    probes: list[dict[str, Any]] = []
    for language, markers in sorted(_JUVENILE_TEXT_MARKERS.items()):
        for marker in markers:
            for variant, text in (
                ("as-is", marker),
                ("upper", marker.upper()),
                ("one-char-short", marker[:-1]),
            ):
                book = BookStub(
                    author="A",
                    language=language,
                    description=f"Ein Buch: {text} und mehr.",
                )
                probes.append(
                    {
                        "language": language,
                        "marker": marker,
                        "variant": variant,
                        "description": book.description,
                        "genre_key": build_book_context(book).genre_key,
                    }
                )
    return probes


def _record_case(case: dict[str, Any], ruleset_version: str) -> dict[str, Any]:
    book = BookStub(**case["book"])
    context = build_book_context(book)
    override = case.get("language_override")
    if override is not None:
        context = dataclasses.replace(context, language=override)
    row = book.as_row()
    return {
        "name": case["name"],
        "book": row,
        "frontend_book": _frontend_book(row),
        "language_override": override,
        "missing_fields": [m.model_dump() for m in find_missing_fields(book)],
        "context": dataclasses.asdict(context),
        "source_hash": compute_source_hash(context, ruleset_version),
    }


def _compute_record() -> dict[str, Any]:
    rules = get_ruleset()
    return {
        "_comment": (
            "Generated by backend/tests/test_aplus_context_parity.py. Do "
            "not hand-edit: regenerate with APLUS_CONTEXT_PARITY_WRITE=1 "
            "and read the diff."
        ),
        "ruleset_version": rules.version,
        "juvenile_text_markers": {
            language: list(markers) for language, markers in sorted(_JUVENILE_TEXT_MARKERS.items())
        },
        "marker_probes": _marker_probes(),
        "cases": [_record_case(case, rules.version) for case in CASES],
        "style_contexts": [
            {
                "genre_key": genre,
                "style": dataclasses.asdict(build_style_context(genre_key=genre, rules=rules)),
            }
            for genre in STYLE_GENRES
        ],
        "rendered": [
            {
                "name": case["name"],
                "image": case["image"],
                "rendered": render_image_prompt(AplusImage.model_validate(case["image"])),
            }
            for case in RENDER_CASES
        ],
        "packages": [
            {
                "name": case["name"],
                "package": case["package"],
                "with_rendered": with_rendered_prompts(case["package"]),
            }
            for case in PACKAGE_CASES
        ],
    }


def test_recorded_context_matches_the_live_assembly() -> None:
    # Serialise first, then compare what the file would hold rather than
    # the live objects: `style_flags` is a tuple in Python and a list in
    # JSON, so an object-to-object comparison fails on a record that is
    # in fact identical. Caught by running this test without the write
    # env-var - the write path skips it, so a generator verified only
    # with the env-var set is a gate that was never exercised.
    serialised = json.dumps(_compute_record(), indent=2, ensure_ascii=False) + "\n"
    record = json.loads(serialised)

    if os.environ.get("APLUS_CONTEXT_PARITY_WRITE"):
        FIXTURE_PATH.write_text(serialised, encoding="utf-8")
        pytest.skip("record rewritten; re-run without APLUS_CONTEXT_PARITY_WRITE")

    assert FIXTURE_PATH.exists(), (
        f"{FIXTURE_PATH} is missing. Generate it with "
        f"APLUS_CONTEXT_PARITY_WRITE=1 poetry run pytest "
        f"tests/test_aplus_context_parity.py"
    )
    committed = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert committed == record, (
        "the A+ context assembly no longer produces the recorded output. If "
        "the change is intended, regenerate the record and carry the same "
        "change into frontend/src/lib/aplus/bookContext.ts."
    )


def test_with_rendered_prompts_never_mutates_its_input() -> None:
    """The derived string must not reach the cached JSON (#865)."""
    package = {
        "module_header": {"image": {"prompt": "a cat", "aspect_ratio": "97:60"}},
        "module_three_images": [{"image": {"prompt": "one"}}],
    }
    before = json.dumps(package, sort_keys=True)
    with_rendered_prompts(package)
    assert json.dumps(package, sort_keys=True) == before


def test_every_genre_tier_is_exercised() -> None:
    """A tier no case reaches is a branch the record does not cover."""
    record = _compute_record()
    keys = {case["context"]["genre_key"] for case in record["cases"]}
    assert "kinderbuch" in keys, "no case reaches the juvenile fallback"
    assert None in keys, "no case leaves the genre unresolved"
    assert keys - {"kinderbuch", None}, "no case carries an explicit genre"


def test_a_case_reaches_each_missing_field_rule() -> None:
    record = _compute_record()
    fields = {finding["field"] for case in record["cases"] for finding in case["missing_fields"]}
    assert fields == {"author", "description"}, fields
