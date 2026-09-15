"""Tests for the AI prompt builder (#825)."""

from __future__ import annotations

from bibliogon_aplus.book_context import BookContext
from bibliogon_aplus.prompts import build_system_prompt, build_user_prompt
from bibliogon_aplus.rules import get_ruleset
from bibliogon_aplus.schema import ValidationFinding

RULES = get_ruleset()


def _context(**overrides) -> BookContext:
    defaults = dict(
        book_id="b1",
        title="The Formable Eternity",
        subtitle="A philosophical journey",
        author="Aster Raptis",
        language="en",
        description_text="A quiet meditation on consciousness and time.",
        genre_key=None,
        bisac_codes=["FIC022020"],
        categories=["Fiction > Fantasy"],
        keywords=["philosophy", "consciousness"],
    )
    defaults.update(overrides)
    return BookContext(**defaults)


class TestSystemPrompt:
    def test_names_the_language(self) -> None:
        prompt = build_system_prompt("de")
        assert "de" in prompt or "German" in prompt or "Deutsch" in prompt

    def test_forbids_dashes_and_emoji_explicitly(self) -> None:
        prompt = build_system_prompt("en")
        assert "em dash" in prompt.lower() or "em-dash" in prompt.lower()
        assert "emoji" in prompt.lower()

    def test_requests_a_yaml_response(self) -> None:
        prompt = build_system_prompt("en")
        assert "yaml" in prompt.lower()


class TestUserPrompt:
    def test_includes_the_title_and_author(self) -> None:
        prompt = build_user_prompt(_context(), rules=RULES, prior_findings=None)
        assert "The Formable Eternity" in prompt
        assert "Aster Raptis" in prompt

    def test_includes_the_description_text(self) -> None:
        prompt = build_user_prompt(_context(), rules=RULES, prior_findings=None)
        assert "consciousness and time" in prompt

    def test_includes_the_schema_field_names(self) -> None:
        prompt = build_user_prompt(_context(), rules=RULES, prior_findings=None)
        assert "short_description" in prompt
        assert "bullets" in prompt
        assert "module_header" in prompt
        assert "module_three_images" in prompt

    def test_no_prior_findings_produces_no_correction_section(self) -> None:
        prompt = build_user_prompt(_context(), rules=RULES, prior_findings=None)
        assert "previous attempt" not in prompt.lower()

    def test_prior_findings_are_surfaced_as_correction_guidance(self) -> None:
        findings = [
            ValidationFinding(
                field="short_description", severity="error", message="Em dash found."
            )
        ]
        prompt = build_user_prompt(_context(), rules=RULES, prior_findings=findings)
        assert "Em dash found." in prompt
        assert "short_description" in prompt

    def test_kinderbuch_genre_asks_for_a_friendly_tone(self) -> None:
        prompt = build_user_prompt(
            _context(genre_key="kinderbuch"), rules=RULES, prior_findings=None
        )
        assert "kinderbuch" in prompt.lower() or "children" in prompt.lower()
