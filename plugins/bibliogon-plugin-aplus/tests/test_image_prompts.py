"""Tests for image-prompt/style assembly (#825).

Technical parameters (model hint, aspect ratio, style flags) come
from the ruleset, never hardcoded - a bump in the YAML must change
the output without touching this module.
"""

from __future__ import annotations

from bibliogon_aplus.image_prompts import (
    build_style_context,
    render_image_prompt,
    with_rendered_prompts,
)
from bibliogon_aplus.rules import get_ruleset
from bibliogon_aplus.schema import AplusImage

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


class TestRenderedPrompt:
    """``rendered`` is a derivation of the persisted parts, in the form
    approved for #865: ``<prompt> --ar <aspect_ratio> <style_flags>``.
    It is computed for every response and never stored, so a change
    to the form or to the ruleset's flags never leaves a stale string
    behind."""

    def test_rendered_joins_prompt_ratio_and_flags(self) -> None:
        image = AplusImage(
            prompt="reader at a desk, morning light",
            aspect_ratio="97:60",
            size="970x600",
            style_flags=["photorealistic", "editorial", "no text overlay"],
        )
        assert render_image_prompt(image) == (
            "reader at a desk, morning light --ar 97:60 photorealistic editorial no text overlay"
        )

    def test_an_empty_prompt_renders_as_empty(self) -> None:
        image = AplusImage(prompt="", aspect_ratio="1:1", size="300x300", style_flags=["x"])
        assert render_image_prompt(image) == ""

    def test_a_whitespace_only_prompt_renders_as_empty(self) -> None:
        image = AplusImage(prompt="   ", aspect_ratio="1:1", size="300x300", style_flags=["x"])
        assert render_image_prompt(image) == ""

    def test_a_missing_aspect_ratio_leaves_no_dangling_ar_flag(self) -> None:
        """A ruleset without a slot's aspect ratio (build_style_context
        falls back to "") must not render "--ar " with nothing after it."""
        image = AplusImage(prompt="a fox", aspect_ratio="", size="", style_flags=["warm colors"])
        assert render_image_prompt(image) == "a fox warm colors"

    def test_target_size_is_not_baked_into_the_rendered_string(self) -> None:
        """Pixel sizes are metadata for the UI/production step, not
        part of the prompt - a literal '970x600' in it is noise."""
        image = AplusImage(prompt="a cozy reading nook", aspect_ratio="97:60", size="970x600")
        assert "970x600" not in render_image_prompt(image)

    def test_style_context_builds_an_image_with_the_slot_parameters(self) -> None:
        context = build_style_context(genre_key="kinderbuch", rules=RULES)
        image = context.three_images.image("a fox cub in a meadow")
        assert image.prompt == "a fox cub in a meadow"
        assert image.aspect_ratio == "1:1"
        assert image.size == "300x300"
        assert "friendly illustration" in image.style_flags
        assert "rendered" not in image.model_dump()


class TestWithRenderedPrompts:
    def test_adds_rendered_to_the_header_and_every_tile(self) -> None:
        payload = {
            "module_header": {
                "image": {
                    "prompt": "p",
                    "aspect_ratio": "97:60",
                    "size": "970x600",
                    "style_flags": ["a"],
                }
            },
            "module_three_images": [
                {
                    "image": {
                        "prompt": "q",
                        "aspect_ratio": "1:1",
                        "size": "300x300",
                        "style_flags": [],
                    }
                },
                {
                    "image": {
                        "prompt": "",
                        "aspect_ratio": "1:1",
                        "size": "300x300",
                        "style_flags": ["b"],
                    }
                },
            ],
        }
        out = with_rendered_prompts(payload)
        assert out["module_header"]["image"]["rendered"] == "p --ar 97:60 a"
        assert out["module_three_images"][0]["image"]["rendered"] == "q --ar 1:1"
        assert out["module_three_images"][1]["image"]["rendered"] == ""

    def test_does_not_mutate_the_stored_dict(self) -> None:
        payload = {
            "module_header": {
                "image": {"prompt": "p", "aspect_ratio": "1:1", "size": "", "style_flags": []}
            }
        }
        with_rendered_prompts(payload)
        assert "rendered" not in payload["module_header"]["image"]

    def test_tolerates_a_package_without_image_blocks(self) -> None:
        """Rows cached under ruleset version 2 predate the image block."""
        payload = {"module_header": {"image_prompt": "x"}, "module_three_images": [{"title": "t"}]}
        assert with_rendered_prompts(payload) == payload
