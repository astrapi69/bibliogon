"""Tests for the generate-validate-regenerate orchestration (#825).

The AI client is a trivial fake - no network calls. Covers the
regeneration budget: a bad response triggers exactly one retry, and
after ``max_regeneration_retries`` the result is returned WITH its
remaining errors rather than raised or silently discarded.
"""

from __future__ import annotations

import asyncio

from bibliogon_aplus.book_context import BookContext
from bibliogon_aplus.generator import compute_source_hash, generate_package
from bibliogon_aplus.rules import get_ruleset

RULES = get_ruleset()

GOOD_YAML = """
short_description: A quiet story about memory and choice.
bullets:
  - heading: Clear structure
    body: Chapters build on each other.
  - heading: Real examples
    body: Every idea comes with a concrete case.
  - heading: Practical takeaways
    body: Readers leave with something usable.
module_header:
  title: Overview
  text: An inviting overview of the book's premise.
  image_prompt: cinematic, warm lighting
  alt_text: A reader immersed in the story
module_three_images:
  - title: Concept one
    text: A supporting idea.
    image_prompt: minimalist, flat colors
    alt_text: Icon representing concept one
  - title: Concept two
    text: Another supporting idea.
    image_prompt: minimalist, flat colors
    alt_text: Icon representing concept two
  - title: Concept three
    text: A final supporting idea.
    image_prompt: minimalist, flat colors
    alt_text: Icon representing concept three
"""

BAD_YAML_EM_DASH = GOOD_YAML.replace(
    "A quiet story about memory and choice.",
    "A quiet story—about memory and choice.",
)


def _context(**overrides) -> BookContext:
    defaults = dict(
        book_id="b1",
        title="The Formable Eternity",
        subtitle=None,
        author="Aster Raptis",
        language="en",
        description_text="A quiet meditation on consciousness and time.",
        genre_key=None,
        bisac_codes=[],
        categories=[],
        keywords=[],
    )
    defaults.update(overrides)
    return BookContext(**defaults)


class _FakeClient:
    """Returns each of ``responses`` in order, one per call."""

    def __init__(self, responses: list[str], model: str = "fake-model-1") -> None:
        self._responses = list(responses)
        self.model = model
        self.calls: list[list[dict[str, str]]] = []

    async def chat(self, messages, temperature=None):
        self.calls.append(messages)
        content = self._responses.pop(0) if self._responses else self._responses[-1]
        return {"content": content, "model": self.model, "usage": {}}


def _run(coro):
    return asyncio.run(coro)


class TestHappyPath:
    def test_a_clean_first_response_needs_no_retry(self) -> None:
        client = _FakeClient([GOOD_YAML])
        package = _run(generate_package(_context(), language="en", rules=RULES, client=client))
        assert not package.has_errors
        assert len(client.calls) == 1
        assert package.short_description.startswith("A quiet story")

    def test_meta_carries_the_model_name_and_ruleset_version(self) -> None:
        client = _FakeClient([GOOD_YAML], model="my-model-7")
        package = _run(generate_package(_context(), language="en", rules=RULES, client=client))
        assert package.meta.model == "my-model-7"
        assert package.meta.ruleset_version == RULES.version
        assert package.meta.book_id == "b1"
        assert package.meta.language == "en"


class TestRegeneration:
    def test_a_bad_response_triggers_exactly_one_retry(self) -> None:
        client = _FakeClient([BAD_YAML_EM_DASH, GOOD_YAML])
        package = _run(generate_package(_context(), language="en", rules=RULES, client=client))
        assert not package.has_errors
        assert len(client.calls) == 2

    def test_the_retry_prompt_includes_the_prior_error(self) -> None:
        client = _FakeClient([BAD_YAML_EM_DASH, GOOD_YAML])
        _run(generate_package(_context(), language="en", rules=RULES, client=client))
        second_call_user_message = client.calls[1][1]["content"]
        assert (
            "Em dash" in second_call_user_message or "em dash" in second_call_user_message.lower()
        )

    def test_after_the_retry_budget_the_result_is_returned_with_remaining_errors(self) -> None:
        client = _FakeClient([BAD_YAML_EM_DASH, BAD_YAML_EM_DASH, BAD_YAML_EM_DASH])
        package = _run(generate_package(_context(), language="en", rules=RULES, client=client))
        assert package.has_errors
        assert len(client.calls) == RULES.max_regeneration_retries + 1

    def test_a_completely_unparseable_response_still_produces_a_returned_package(self) -> None:
        client = _FakeClient(["not: [valid, yaml: at all"] * 3)
        package = _run(generate_package(_context(), language="en", rules=RULES, client=client))
        assert package.has_errors
        assert len(client.calls) == RULES.max_regeneration_retries + 1


class TestKinderbuchEscalationAffectsRegeneration:
    def test_a_soft_word_that_escalates_for_kinderbuch_forces_a_retry(self) -> None:
        theft_yaml = GOOD_YAML.replace(
            "A quiet story about memory and choice.",
            "A story about theft and betrayal.",
        )
        client = _FakeClient([theft_yaml, GOOD_YAML])
        package = _run(
            generate_package(
                _context(genre_key="kinderbuch"), language="en", rules=RULES, client=client
            )
        )
        assert not package.has_errors
        assert len(client.calls) == 2

    def test_the_same_word_outside_kinderbuch_does_not_force_a_retry(self) -> None:
        theft_yaml = GOOD_YAML.replace(
            "A quiet story about memory and choice.",
            "A story about theft and betrayal.",
        )
        client = _FakeClient([theft_yaml])
        package = _run(
            generate_package(_context(genre_key=None), language="en", rules=RULES, client=client)
        )
        assert not package.has_errors
        assert len(client.calls) == 1


class TestComputeSourceHash:
    def test_identical_context_and_ruleset_version_hash_the_same(self) -> None:
        assert compute_source_hash(_context(), "1") == compute_source_hash(_context(), "1")

    def test_a_changed_description_changes_the_hash(self) -> None:
        first = compute_source_hash(_context(), "1")
        second = compute_source_hash(_context(description_text="different text"), "1")
        assert first != second

    def test_a_changed_ruleset_version_changes_the_hash(self) -> None:
        first = compute_source_hash(_context(), "1")
        second = compute_source_hash(_context(), "2")
        assert first != second
