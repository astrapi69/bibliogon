"""#890 stage 3b: the recorded A+ generation the browser port is checked against.

Stage 3a recorded everything ``POST /aplus/{book_id}/generate`` does
without a provider. What was left is the part that talks to one, and it
is still mostly deterministic: the prompts, the tolerant construction
from the model's reply, and the generate -> validate -> regenerate
decision. Only the reply itself is not, so it is scripted.

Recorded at ``generate_package`` rather than at the route, and the
difference matters after #1042 - a record taken below the boundary the
consumer calls cannot see what the boundary supplies. What the route
adds on top of this function is, in full:

- ``_is_ai_enabled()``        -> offline: a configured provider key,
- ``_load_book``              -> the book row, from the storage seam,
- ``find_missing_fields``     -> recorded in stage 3a,
- ``get_ruleset``             -> the committed offline seed,
- ``build_book_context``      -> recorded in stage 3a,
- the language override + the ``SUPPORTED_LANGUAGES`` check,
- ``compute_source_hash``     -> recorded in stage 3a,
- the ``aplus_content`` cache read/write,
- ``with_rendered_prompts``   -> recorded in stage 3a,
- the ``LLMError`` -> ``ExternalServiceError`` mapping.

Every one of those is either already recorded or has no browser
equivalent to record, and the two that do not are stated in the port's
own docstring rather than left implicit: the cache has no reader (the
only caller passes ``force=true`` and the generated package is written
into the editable A+ document, which lives in the storage seam since
#891), and ``_is_ai_enabled`` becomes ``isAiConfigured``.

The scripted client is the one piece of make-believe, and it is the
honest kind: the function's own ``ChatClient`` Protocol is what
production passes too. Its replies are the raw text a provider returns,
so the fence stripping and the YAML parse run on the same bytes the
port is handed.

Regenerate with ``APLUS_GENERATE_PARITY_WRITE=1 poetry run pytest
tests/test_aplus_generate_parity.py`` after a deliberate change, and
read the diff: every line is a behaviour change the port has to follow.
"""

from __future__ import annotations

import asyncio
import dataclasses
import inspect
import json
import os
from pathlib import Path
from typing import Any

import pytest
from bibliogon_aplus import generator as generator_module
from bibliogon_aplus.book_context import build_book_context
from bibliogon_aplus.generator import (
    _INITIAL_GENERATION_ATTEMPT,
    _build_draft_package,
    _parse_ai_yaml_fragment,
    generate_package,
)
from bibliogon_aplus.image_prompts import build_style_context
from bibliogon_aplus.prompts import build_system_prompt, build_user_prompt
from bibliogon_aplus.rules import get_ruleset
from bibliogon_aplus.schema import AplusMeta, ValidationFinding
from bibliogon_aplus.validation import validate_package

from tests.aplus_context_cases import BookStub
from tests.aplus_generate_cases import (
    FRAGMENT_CASES,
    LOOP_CASES,
    PROMPT_CASES,
    RAW_RESPONSE_CASES,
    SYSTEM_PROMPT_LANGUAGES,
)
from tests.repo_root import find_repo_root

REPO_ROOT = find_repo_root(Path(__file__))
FIXTURE_PATH = REPO_ROOT / "frontend" / "src" / "lib" / "aplus" / "generate.parity.json"

#: ``generated_at`` is ``datetime.now``, so it differs on every run and
#: would make the record unstable. The port stamps its own clock; what
#: has to match is everything else. Replaced rather than dropped, so a
#: record that stopped carrying the field would still be a visible diff.
_CLOCK_PLACEHOLDER = "<generated_at>"


class ScriptedClient:
    """A ``ChatClient`` that replies from a list and records its calls.

    Re-uses the last reply once the script runs out, so a case cannot
    silently depend on how many attempts the ruleset budgets.
    """

    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self._responses = responses
        self.calls: list[list[dict[str, str]]] = []
        self.temperatures: list[float | None] = []

    async def chat(
        self, messages: list[dict[str, str]], temperature: float | None = None
    ) -> dict[str, Any]:
        self.calls.append([dict(message) for message in messages])
        self.temperatures.append(temperature)
        index = min(len(self.calls) - 1, len(self._responses) - 1)
        return dict(self._responses[index])


def _context_for(case: dict[str, Any]):
    context = build_book_context(BookStub(**case["book"]))
    override = case.get("language_override")
    if override is not None:
        context = dataclasses.replace(context, language=override)
    return context


def _findings(raw: list[dict[str, Any]]) -> list[ValidationFinding]:
    return [ValidationFinding.model_validate(entry) for entry in raw]


def _without_clock(package: dict[str, Any]) -> dict[str, Any]:
    meta = dict(package.get("meta") or {})
    if "generated_at" in meta:
        meta["generated_at"] = _CLOCK_PLACEHOLDER
    return {**package, "meta": meta}


def _record_prompt_case(case: dict[str, Any], rules: Any) -> dict[str, Any]:
    context = _context_for(case)
    prior = _findings(case["prior_findings"]) or None
    return {
        "name": case["name"],
        "context": dataclasses.asdict(context),
        "prior_findings": case["prior_findings"],
        "user_prompt": build_user_prompt(context, rules=rules, prior_findings=prior),
    }


def _record_fragment_case(case: dict[str, Any], rules: Any) -> dict[str, Any]:
    styles = build_style_context(genre_key=case["genre_key"], rules=rules)
    meta = AplusMeta(
        book_id="book-1",
        language="de",
        model="test-model",
        ruleset_version=rules.version,
        generated_at=_CLOCK_PLACEHOLDER,
    )
    draft = _build_draft_package(case["parsed"], meta, styles)
    return {
        "name": case["name"],
        "genre_key": case["genre_key"],
        "parsed": case["parsed"],
        "draft": draft.model_dump(),
    }


def _record_loop_case(case: dict[str, Any], rules: Any) -> dict[str, Any]:
    context = build_book_context(BookStub(**case["book"]))
    if case["language"] != context.language:
        context = dataclasses.replace(context, language=case["language"])
    client = ScriptedClient(case["responses"])
    package = asyncio.run(
        generate_package(context, language=case["language"], rules=rules, client=client)
    )
    return {
        "name": case["name"],
        "context": dataclasses.asdict(context),
        "language": case["language"],
        "responses": case["responses"],
        "attempts": len(client.calls),
        "temperatures": client.temperatures,
        "prompts": client.calls,
        "package": _without_clock(package.model_dump()),
    }


def _compute_record() -> dict[str, Any]:
    rules = get_ruleset()
    return {
        "_comment": (
            "Generated by backend/tests/test_aplus_generate_parity.py. Do "
            "not hand-edit: regenerate with APLUS_GENERATE_PARITY_WRITE=1 "
            "and read the diff."
        ),
        "ruleset_version": rules.version,
        "generated_at_placeholder": _CLOCK_PLACEHOLDER,
        "initial_generation_attempt": _INITIAL_GENERATION_ATTEMPT,
        "max_regeneration_retries": rules.max_regeneration_retries,
        "system_prompts": [
            {"language": language, "prompt": build_system_prompt(language)}
            for language in SYSTEM_PROMPT_LANGUAGES
        ],
        "prompt_cases": [_record_prompt_case(case, rules) for case in PROMPT_CASES],
        "raw_responses": [
            {
                "name": case["name"],
                "text": case["text"],
                "parsed": _parse_ai_yaml_fragment(case["text"]),
            }
            for case in RAW_RESPONSE_CASES
        ],
        "fragment_cases": [_record_fragment_case(case, rules) for case in FRAGMENT_CASES],
        "loop_cases": [_record_loop_case(case, rules) for case in LOOP_CASES],
    }


def test_recorded_generation_matches_the_live_generator() -> None:
    # Serialise first, compare the JSON: `style_flags` is a tuple on the
    # Python side and a list in the file, so an object-to-object compare
    # fails on a record that is in fact identical (the same trap the
    # context recorder documents).
    serialised = json.dumps(_compute_record(), indent=2, ensure_ascii=False) + "\n"
    record = json.loads(serialised)

    if os.environ.get("APLUS_GENERATE_PARITY_WRITE"):
        FIXTURE_PATH.write_text(serialised, encoding="utf-8")
        pytest.skip("record rewritten; re-run without APLUS_GENERATE_PARITY_WRITE")

    assert FIXTURE_PATH.exists(), (
        f"{FIXTURE_PATH} is missing. Generate it with "
        f"APLUS_GENERATE_PARITY_WRITE=1 poetry run pytest "
        f"tests/test_aplus_generate_parity.py"
    )
    committed = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert committed == record, (
        "the A+ generation no longer produces the recorded output. If the "
        "change is intended, regenerate the record and carry the same "
        "change into frontend/src/lib/aplus/{prompts,generate}.ts."
    )


def test_every_recorded_loop_case_spends_the_whole_budget_or_stops_early() -> None:
    """The attempt count is 1 + the retry budget, not the budget (#829).

    Pinned here as well as in the record so a ruleset whose
    ``max_regeneration_retries`` changes cannot quietly turn the
    "budget-exhausted" case into a single-attempt one, which would
    leave the retry path uncovered on both sides.
    """
    record = _compute_record()
    rules = get_ruleset()
    budget = _INITIAL_GENERATION_ATTEMPT + rules.max_regeneration_retries
    assert budget > 1, "a retry budget of zero leaves the correction path unrecorded"

    by_name = {case["name"]: case for case in record["loop_cases"]}
    assert by_name["first-attempt-is-clean"]["attempts"] == 1
    assert by_name["retry-fixes-the-error"]["attempts"] == 2
    assert by_name["budget-exhausted-returns-the-errors"]["attempts"] == budget
    assert any(
        finding["severity"] == "error"
        for finding in by_name["budget-exhausted-returns-the-errors"]["package"]["validation"]
    ), "the exhausted case must come back WITH its errors, not silently clean"


def test_the_correction_section_quotes_the_prior_attempts_errors() -> None:
    """The retry prompt has to name what went wrong, or the retry is a
    second roll of the same dice. Asserted on the recorded prompts so
    the port's own correction section is compared against a text that is
    known to carry the finding, not against an empty string."""
    record = _compute_record()
    retry = next(case for case in record["loop_cases"] if case["name"] == "retry-fixes-the-error")
    first, second = retry["prompts"][0][1]["content"], retry["prompts"][1][1]["content"]
    assert "previous attempt" not in first
    assert "previous attempt" in second
    assert "module_header.alt_text" in second


def test_the_warning_case_actually_produces_a_warning() -> None:
    """The error-vs-warning case has to carry both, or it proves nothing.

    ``_ERROR_AND_WARNING_RESPONSE`` exists so the record pins that the
    correction section lists the failed attempt's ERRORS and not its
    warnings. A port that passed every finding through passed every
    other recorded case, because none of them produced a warning
    alongside an error. If the ruleset ever stops treating "Streit" as
    a soft word, this case silently stops distinguishing the two and
    the gap reopens - so the reply is validated here directly rather
    than trusted.
    """
    from tests.aplus_generate_cases import _ERROR_AND_WARNING_RESPONSE

    rules = get_ruleset()
    styles = build_style_context(genre_key=None, rules=rules)
    meta = AplusMeta(book_id="b", language="de", ruleset_version=rules.version, generated_at="x")
    draft = _build_draft_package(_parse_ai_yaml_fragment(_ERROR_AND_WARNING_RESPONSE), meta, styles)
    severities = {
        finding.severity
        for finding in validate_package(draft, language="de", genre_key=None, rules=rules)
    }
    assert severities == {"error", "warning"}, severities

    retry = next(
        case
        for case in _compute_record()["loop_cases"]
        if case["name"] == "the-retry-quotes-errors-not-warnings"
    )
    correction = retry["prompts"][1][1]["content"]
    assert "module_header.alt_text" in correction
    assert "genre_word_tone" not in correction
    assert "bullets[1].body" not in correction


def test_the_scripted_client_is_the_protocol_production_uses() -> None:
    """A fake that drifts from the real client's shape records a path
    nothing calls.

    ``ChatClient`` is not ``@runtime_checkable`` and should not become
    so for a test, so the comparison is the signature: same parameter
    names, same annotations, same async-ness as the Protocol
    ``generate_package`` is typed against. A stand-in that took
    ``prompt`` instead of ``messages`` would pass a duck-typed call and
    record a shape production cannot hand it.
    """
    protocol = inspect.signature(generator_module.ChatClient.chat)
    fake = inspect.signature(ScriptedClient.chat)
    assert str(fake) == str(protocol)
    assert inspect.iscoroutinefunction(ScriptedClient.chat)
