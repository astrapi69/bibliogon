"""Tests for the generate-validate-regenerate orchestration (#825).

The AI client is a trivial fake - no network calls. Covers the
regeneration budget: a bad response triggers exactly one retry, and
after ``max_regeneration_retries`` the result is returned WITH its
remaining errors rather than raised or silently discarded.
"""

from __future__ import annotations

import asyncio

import yaml
from bibliogon_aplus.book_context import BookContext
from bibliogon_aplus.generator import compute_source_hash, generate_package
from bibliogon_aplus.rules import RULESET_PATH, get_ruleset, load_ruleset

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

    def test_the_exhausted_attempt_count_is_1_initial_plus_the_configured_retries(self) -> None:
        """#829: pins the decomposition explicitly (1 initial call +
        max_regeneration_retries retries), not just the combined
        total, so a future reader can't misread "3 calls" as "3
        retries" the way #827's closing report did."""
        assert RULES.max_regeneration_retries == 2
        client = _FakeClient([BAD_YAML_EM_DASH] * 5)
        _run(generate_package(_context(), language="en", rules=RULES, client=client))
        initial_attempts = 1
        assert len(client.calls) == initial_attempts + RULES.max_regeneration_retries
        assert len(client.calls) == 3


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


class TestImageStyleIsAppliedToThePackage:
    """#865: the builder in image_prompts.py existed but nothing called
    it, so no generated package ever carried the ruleset's image
    parameters. These pin the wiring at the generator level; the
    endpoint tests in backend/tests pin it at the response level."""

    def test_header_and_tiles_get_their_slot_parameters_from_the_ruleset(self) -> None:
        package = _run(
            generate_package(
                _context(), language="en", rules=RULES, client=_FakeClient([GOOD_YAML])
            )
        )
        header = package.module_header.image
        assert header.prompt == "cinematic, warm lighting"
        assert header.aspect_ratio == RULES.image_style.aspect_ratios["module_header"] == "97:60"
        assert header.size == RULES.image_style.target_pixel_sizes["module_header"] == "970x600"
        for tile in package.module_three_images:
            assert tile.image.prompt == "minimalist, flat colors"
            assert tile.image.aspect_ratio == "1:1"
            assert tile.image.size == "300x300"

    def test_a_book_without_a_genre_gets_the_default_flags(self) -> None:
        package = _run(
            generate_package(
                _context(), language="en", rules=RULES, client=_FakeClient([GOOD_YAML])
            )
        )
        assert package.module_header.image.style_flags == list(
            RULES.image_style.default_style_flags
        )

    def test_a_kinderbuch_gets_the_kinderbuch_flags_on_every_image(self) -> None:
        package = _run(
            generate_package(
                _context(genre_key="kinderbuch"),
                language="en",
                rules=RULES,
                client=_FakeClient([GOOD_YAML]),
            )
        )
        expected = list(RULES.image_style.genre_style_flags["kinderbuch"])
        assert package.module_header.image.style_flags == expected
        assert [tile.image.style_flags for tile in package.module_three_images] == [expected] * 3
        assert "friendly illustration" in expected

    def test_the_persisted_package_has_no_rendered_string(self) -> None:
        package = _run(
            generate_package(
                _context(), language="en", rules=RULES, client=_FakeClient([GOOD_YAML])
            )
        )
        assert "rendered" not in package.model_dump_json()


class TestImageParametersComeFromTheRuleset:
    """The rule for #865 is "all values from the ruleset, nothing
    hardcoded". Asserting the vendored values alone cannot prove that -
    a Python literal equal to the YAML would pass. So this loads a
    ruleset with DIFFERENT values and expects them in the package."""

    def _custom_rules(self, tmp_path):
        raw = yaml.safe_load(RULESET_PATH.read_text(encoding="utf-8"))
        raw["image_style"]["aspect_ratios"] = {"module_header": "4:3", "module_three_images": "2:1"}
        raw["image_style"]["target_pixel_sizes"] = {
            "module_header": "400x300",
            "module_three_images": "200x100",
        }
        raw["image_style"]["default"]["style_flags"] = ["custom-default"]
        raw["image_style"]["genres"]["kinderbuch"]["style_flags"] = ["custom-kinderbuch"]
        path = tmp_path / "ruleset.yaml"
        path.write_text(yaml.safe_dump(raw), encoding="utf-8")
        return load_ruleset(path)

    def test_default_slot_values_follow_the_loaded_ruleset(self, tmp_path) -> None:
        rules = self._custom_rules(tmp_path)
        package = _run(
            generate_package(
                _context(), language="en", rules=rules, client=_FakeClient([GOOD_YAML])
            )
        )
        header = package.module_header.image
        assert (header.aspect_ratio, header.size, header.style_flags) == (
            "4:3",
            "400x300",
            ["custom-default"],
        )
        for tile in package.module_three_images:
            assert (tile.image.aspect_ratio, tile.image.size) == ("2:1", "200x100")
            assert tile.image.style_flags == ["custom-default"]

    def test_kinderbuch_flags_follow_the_loaded_ruleset(self, tmp_path) -> None:
        rules = self._custom_rules(tmp_path)
        package = _run(
            generate_package(
                _context(genre_key="kinderbuch"),
                language="en",
                rules=rules,
                client=_FakeClient([GOOD_YAML]),
            )
        )
        assert package.module_header.image.style_flags == ["custom-kinderbuch"]


class TestBrokenImagePromptShapes:
    """A partially broken reply must not leak "None" or whitespace into
    the prompt that later becomes the copy-and-paste string."""

    def test_a_bare_image_prompt_key_becomes_an_empty_prompt(self) -> None:
        broken = GOOD_YAML.replace(
            "  image_prompt: cinematic, warm lighting\n", "  image_prompt:\n"
        )
        package = _run(
            generate_package(_context(), language="en", rules=RULES, client=_FakeClient([broken]))
        )
        assert package.module_header.image.prompt == ""

    def test_a_whitespace_only_image_prompt_becomes_an_empty_prompt(self) -> None:
        broken = GOOD_YAML.replace("image_prompt: minimalist, flat colors", 'image_prompt: "   "')
        package = _run(
            generate_package(_context(), language="en", rules=RULES, client=_FakeClient([broken]))
        )
        assert [tile.image.prompt for tile in package.module_three_images] == ["", "", ""]
