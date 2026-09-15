"""Tests for image-prompt/style assembly (#825).

Technical parameters (model hint, aspect ratio, style flags) come
from the ruleset, never hardcoded - a bump in the YAML must change
the output without touching this module.
"""

from __future__ import annotations

from bibliogon_aplus.image_prompts import build_style_context
from bibliogon_aplus.rules import get_ruleset

RULES = get_ruleset()


class TestDefaultStyle:
    def test_default_style_has_no_text_overlay_flag(self) -> None:
        context = build_style_context(genre_key=None, rules=RULES)
        assert "no text overlay" in context.header.style_flags

    def test_default_model_hint_comes_from_the_ruleset(self) -> None:
        context = build_style_context(genre_key=None, rules=RULES)
        assert context.header.model_hint == RULES.image_style.default_model_hint

    def test_header_uses_the_97_60_aspect_ratio(self) -> None:
        context = build_style_context(genre_key=None, rules=RULES)
        assert context.header.aspect_ratio == "97:60"
        assert context.header.target_pixel_size == "970x600"

    def test_three_image_tiles_use_the_1_1_aspect_ratio(self) -> None:
        context = build_style_context(genre_key=None, rules=RULES)
        assert context.three_images.aspect_ratio == "1:1"
        assert context.three_images.target_pixel_size == "300x300"


class TestKinderbuchStyle:
    def test_kinderbuch_genre_gets_the_friendly_illustration_style(self) -> None:
        context = build_style_context(genre_key="kinderbuch", rules=RULES)
        assert "friendly illustration" in context.header.style_flags
        assert "warm colors" in context.header.style_flags

    def test_kinderbuch_style_still_forbids_text_overlay(self) -> None:
        context = build_style_context(genre_key="kinderbuch", rules=RULES)
        assert "no text overlay" in context.header.style_flags


class TestUnknownGenreFallsBackToDefault:
    def test_an_unrecognised_genre_key_uses_the_default_style(self) -> None:
        context = build_style_context(genre_key="not-a-real-genre", rules=RULES)
        assert context.header.model_hint == RULES.image_style.default_model_hint
        assert "friendly illustration" not in context.header.style_flags


class TestPromptRendering:
    def test_prompt_is_comma_separated_and_keyword_based(self) -> None:
        context = build_style_context(genre_key=None, rules=RULES)
        prompt = context.header.render_prompt(["reader at a desk", "morning light"])
        assert "reader at a desk" in prompt
        assert "morning light" in prompt
        assert "," in prompt

    def test_prompt_never_contains_literal_text_instruction(self) -> None:
        """The prompt itself must never ask for rendered text in the
        image - the A+ text modules carry the copy, not the artwork."""
        context = build_style_context(genre_key=None, rules=RULES)
        prompt = context.header.render_prompt(["a cozy reading nook"])
        assert "no text overlay" in prompt

    def test_target_size_is_not_baked_into_the_prompt_string(self) -> None:
        """Pixel sizes are metadata for the UI/production step, not
        part of the keyword prompt itself - an image generator prompt
        with a literal '970x600' in it is noise."""
        context = build_style_context(genre_key=None, rules=RULES)
        prompt = context.header.render_prompt(["a cozy reading nook"])
        assert "970x600" not in prompt
