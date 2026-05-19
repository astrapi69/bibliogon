"""Tests for picture_book_pdf module (PB-PHASE4 Session 6 Commit 1).

Covers the skeleton generator's contract: per-layout class mapping,
speech-bubble + image-row inline-style derivation (mirroring
PageCanvas.tsx's logic so the in-editor view and the printed PDF
render the same model), HTML structure per layout, asset URL
resolution, and a single end-to-end WeasyPrint render smoke.

Front-matter (cover + title page) + PDF metadata embedding are
deferred to Commit 3.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

import json as _json

from bibliogon_export.picture_book_pdf import (
    _build_assets_map,
    _build_html,
    _extract_plain_text,
    _image_layout_style,
    _layout_class,
    _render_page,
    _speech_bubble_style,
    generate_picture_book_pdf,
)


# --- _layout_class ---


@pytest.mark.parametrize(
    "layout,expected",
    [
        ("speech_bubble", "page--speech_bubble"),
        ("image_top_text_bottom", "page--image_top_text_bottom"),
        ("image_left_text_right", "page--image_left_text_right"),
        ("image_full_text_overlay", "page--image_full_text_overlay"),
        ("text_only", "page--text_only"),
    ],
)
def test_layout_class_maps_each_valid_layout(layout: str, expected: str) -> None:
    assert _layout_class(layout) == expected


def test_layout_class_falls_back_for_unknown_layout() -> None:
    assert _layout_class("garbage") == "page--image_top_text_bottom"


# --- _speech_bubble_style ---


def test_speech_bubble_default_bottom_center_when_config_is_none() -> None:
    style = _speech_bubble_style(None)
    assert "bottom: 16pt" in style
    assert "left: 50%" in style
    assert "translateX(-50%)" in style
    assert "rgba(255, 255, 255, 1.0)" in style or "rgba(255, 255, 255, 1)" in style
    assert "width: 40%" in style


@pytest.mark.parametrize(
    "anchor,must_contain",
    [
        ("top-left", ["top: 16pt", "left: 16pt", "transform: none"]),
        ("top-right", ["top: 16pt", "right: 16pt", "transform: none"]),
        ("bottom-left", ["bottom: 16pt", "left: 16pt", "transform: none"]),
        ("bottom-right", ["bottom: 16pt", "right: 16pt", "transform: none"]),
        ("center", ["top: 50%", "left: 50%", "translate(-50%, -50%)"]),
        ("bottom-center", ["bottom: 16pt", "left: 50%", "translateX(-50%)"]),
    ],
)
def test_speech_bubble_anchor_variants(anchor: str, must_contain: list[str]) -> None:
    style = _speech_bubble_style({"anchor_position": anchor})
    for fragment in must_contain:
        assert fragment in style


def test_speech_bubble_opacity_clamped_into_range() -> None:
    style_low = _speech_bubble_style({"opacity": 0.1})
    assert "rgba(255, 255, 255, 0.3)" in style_low
    style_high = _speech_bubble_style({"opacity": 1.5})
    assert "rgba(255, 255, 255, 1.0)" in style_high or "rgba(255, 255, 255, 1)" in style_high


def test_speech_bubble_legacy_size_falls_through_to_width() -> None:
    """PB-PHASE4 Session 4c-B-1 smoke Bug 1 (2026-05-18):
    pre-Bug-1 pages persisted ``size``; the new code reads it as
    a legacy fallback for ``bubble_width``. Clamp range expanded
    to [20, 80]."""
    assert "width: 20%" in _speech_bubble_style({"size": 10})
    assert "width: 80%" in _speech_bubble_style({"size": 90})
    assert "width: 30%" in _speech_bubble_style({"size": 30})


def test_speech_bubble_bubble_width_takes_precedence_over_size() -> None:
    """When both keys are present, ``bubble_width`` wins. The
    legacy key fades out as the dispatcher overwrites with the
    new key on the next user edit."""
    style = _speech_bubble_style({"bubble_width": 65, "size": 30})
    assert "width: 65%" in style


def test_speech_bubble_bubble_height_default_and_clamp() -> None:
    """Default height is 30% when not configured; clamp is
    [15, 60] (separate from width's [20, 80] range)."""
    default = _speech_bubble_style({})
    assert "height: 30%" in default
    explicit = _speech_bubble_style({"bubble_height": 45})
    assert "height: 45%" in explicit
    clamped_high = _speech_bubble_style({"bubble_height": 99})
    assert "height: 60%" in clamped_high
    clamped_low = _speech_bubble_style({"bubble_height": 5})
    assert "height: 15%" in clamped_low


def test_speech_bubble_finding_a_anchors_now_emit_correct_positions() -> None:
    """Finding A added 3 new edge-midpoint anchors
    (top-center, middle-left, middle-right) to the frontend.
    Bug 1 closes the parallel gap in the backend's positions
    dict: those 3 anchors must now emit their distinct CSS
    rather than silently falling back to bottom-center."""
    top_center = _speech_bubble_style({"anchor_position": "top-center"})
    assert "top: 16pt" in top_center
    assert "left: 50%" in top_center
    assert "translateX(-50%)" in top_center

    middle_left = _speech_bubble_style({"anchor_position": "middle-left"})
    assert "top: 50%" in middle_left
    assert "left: 16pt" in middle_left
    assert "translateY(-50%)" in middle_left

    middle_right = _speech_bubble_style({"anchor_position": "middle-right"})
    assert "top: 50%" in middle_right
    assert "right: 16pt" in middle_right
    assert "translateY(-50%)" in middle_right


def test_speech_bubble_unknown_anchor_falls_back_to_bottom_center() -> None:
    style = _speech_bubble_style({"anchor_position": "garbage"})
    assert "bottom: 16pt" in style
    assert "left: 50%" in style


# --- 4c-B-2 C1: bubbles[0] wrapper-shape (NQ2 scope-anticipate) ---
#
# ``_speech_bubble_style`` resolves identically whether per-bubble
# fields live under ``bubbles[0]`` (canonical) or at the top level
# (legacy fallback). Mirrors the TypeScript ``readBubbleConfig``
# in ``frontend/src/components/PageCanvas.tsx`` so the in-editor
# view + the printed PDF agree.


def test_bubbles_zero_anchor_position_overrides_flat() -> None:
    style = _speech_bubble_style(
        {
            "anchor_position": "top-left",
            "bubbles": [{"anchor_position": "bottom-right"}],
        }
    )
    assert "bottom: 16pt" in style
    assert "right: 16pt" in style
    # top-left would have emitted ``top: 16pt`` / ``left: 16pt``.
    assert "top: 16pt" not in style
    assert "left: 16pt" not in style


def test_bubbles_zero_opacity_overrides_flat() -> None:
    style = _speech_bubble_style(
        {"opacity": 0.4, "bubbles": [{"opacity": 0.9}]}
    )
    assert "rgba(255, 255, 255, 0.9)" in style
    assert "rgba(255, 255, 255, 0.4)" not in style


def test_bubbles_zero_bubble_width_overrides_flat_and_legacy_size() -> None:
    style = _speech_bubble_style(
        {
            "size": 30,
            "bubble_width": 50,
            "bubbles": [{"bubble_width": 70}],
        }
    )
    assert "width: 70%" in style
    assert "width: 50%" not in style
    assert "width: 30%" not in style


def test_bubbles_zero_bubble_height_overrides_flat() -> None:
    style = _speech_bubble_style(
        {"bubble_height": 20, "bubbles": [{"bubble_height": 55}]}
    )
    assert "height: 55%" in style
    assert "height: 20%" not in style


def test_flat_top_level_keys_still_work_when_bubbles_absent() -> None:
    # Pre-C1 picture-books carry flat shape. The PDF walker's shim
    # must keep them rendering correctly.
    style = _speech_bubble_style(
        {
            "anchor_position": "center",
            "opacity": 0.5,
            "bubble_width": 60,
            "bubble_height": 40,
        }
    )
    assert "top: 50%" in style
    assert "translate(-50%, -50%)" in style
    assert "rgba(255, 255, 255, 0.5)" in style
    assert "width: 60%" in style
    assert "height: 40%" in style


def test_empty_bubbles_array_does_not_shadow_flat_keys() -> None:
    # Defensive: a write that produced ``bubbles: []`` must NOT
    # discard the flat fallback values; the shim treats the missing
    # first element as "no override".
    style = _speech_bubble_style(
        {"anchor_position": "top-left", "bubbles": []}
    )
    assert "top: 16pt" in style
    assert "left: 16pt" in style


def test_bubbles_zero_partial_override_merges_with_flat() -> None:
    # ``bubbles[0]`` may carry only a subset of per-bubble fields;
    # the rest come from the flat fallback (mid-migration shape).
    style = _speech_bubble_style(
        {
            "anchor_position": "top-left",
            "opacity": 0.6,
            "bubbles": [{"bubble_width": 65}],
        }
    )
    # bubbles[0] only sets width; anchor + opacity come from flat.
    assert "top: 16pt" in style
    assert "left: 16pt" in style
    assert "rgba(255, 255, 255, 0.6)" in style
    assert "width: 65%" in style


# --- 4c-B-2 C2: Tier 1 Visual Style emit ---
#
# Six per-bubble visual properties land in the inline-style on the
# bubble element. Mirrors PageCanvas.tsx speechBubbleInlineStyle so
# the printed PDF + the in-editor view stay visually in sync.


def test_tier1_default_bubble_emits_white_rgba_with_full_opacity() -> None:
    # NULL config: defaults are white bg / full opacity / 2px solid
    # black / 50% radius / shadow on intensity 5.
    style = _speech_bubble_style(None)
    assert "rgba(255, 255, 255, 1.0)" in style or "rgba(255, 255, 255, 1)" in style
    assert "border: 2px solid rgb(0, 0, 0)" in style
    assert "border-radius: 50%" in style
    assert "box-shadow: 0 2.5px 10.0px rgba(0, 0, 0, 0.3)" in style or (
        "box-shadow: 0 2.5px 10px rgba(0, 0, 0, 0.3)" in style
    )


def test_tier1_background_color_composes_with_opacity_into_rgba() -> None:
    style = _speech_bubble_style(
        {"bubbles": [{"background_color": "#ff8800", "opacity": 0.5}]}
    )
    assert "rgba(255, 136, 0, 0.5)" in style


def test_tier1_border_emits_composed_color_width_style() -> None:
    style = _speech_bubble_style(
        {
            "bubbles": [
                {
                    "border_color": "#0000ff",
                    "border_width": 4,
                    "border_style": "dashed",
                }
            ]
        }
    )
    assert "border: 4px dashed rgb(0, 0, 255)" in style


def test_tier1_border_radius_emits_percentage() -> None:
    style = _speech_bubble_style({"bubbles": [{"border_radius": 20}]})
    assert "border-radius: 20%" in style


def test_tier1_shadow_off_emits_box_shadow_none() -> None:
    style = _speech_bubble_style({"bubbles": [{"shadow": False}]})
    assert "box-shadow: none" in style


def test_tier1_shadow_intensity_scales_blur() -> None:
    # intensity 10 -> offset_y = 5 px, blur = 20 px.
    style = _speech_bubble_style(
        {"bubbles": [{"shadow": True, "shadow_intensity": 10}]}
    )
    assert "box-shadow: 0 5.0px 20px rgba(0, 0, 0, 0.3)" in style or (
        "box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3)" in style
    )


def test_tier1_border_style_none_emits_no_border() -> None:
    style = _speech_bubble_style(
        {
            "bubbles": [
                {
                    "border_style": "none",
                    "border_width": 0,
                    "border_radius": 0,
                }
            ]
        }
    )
    assert "border: 0px none rgb(0, 0, 0)" in style
    assert "border-radius: 0%" in style


def test_tier1_unknown_border_style_falls_back_to_solid() -> None:
    style = _speech_bubble_style({"bubbles": [{"border_style": "garbage"}]})
    # Defensive: an unknown enum value must not break rendering.
    assert "border: 2px solid rgb(0, 0, 0)" in style


def test_tier1_malformed_hex_color_falls_back_to_default() -> None:
    style = _speech_bubble_style(
        {"bubbles": [{"background_color": "not-a-hex", "border_color": "#zzzzzz"}]}
    )
    # background falls back to white, border falls back to black.
    assert "rgba(255, 255, 255," in style
    assert "border: 2px solid rgb(0, 0, 0)" in style


# --- PADDING-FONT-STYLE-01 C1: uniform padding emit ---
#
# Padding lands in the inline-style on the .region-text element.
# Mirrors PageCanvas.tsx speechBubbleInlineStyle. Default 12 pt is
# the mean of the static CSS rule ``padding: 10pt 14pt`` (which
# the inline-style overrides by specificity).


def test_padding_default_is_12pt() -> None:
    style = _speech_bubble_style(None)
    assert "padding: 12pt" in style


def test_padding_custom_value_emits() -> None:
    style = _speech_bubble_style({"bubbles": [{"padding": 24}]})
    assert "padding: 24pt" in style


def test_padding_clamps_into_range() -> None:
    high = _speech_bubble_style({"bubbles": [{"padding": 99}]})
    assert "padding: 32pt" in high
    low = _speech_bubble_style({"bubbles": [{"padding": -5}]})
    assert "padding: 0pt" in low


def test_padding_zero_emits_no_padding() -> None:
    style = _speech_bubble_style({"bubbles": [{"padding": 0}]})
    assert "padding: 0pt" in style


def test_padding_honours_bubbles_zero_precedence() -> None:
    style = _speech_bubble_style({"padding": 5, "bubbles": [{"padding": 22}]})
    assert "padding: 22pt" in style
    assert "padding: 5pt" not in style


def test_padding_malformed_value_falls_back_to_default() -> None:
    style = _speech_bubble_style({"bubbles": [{"padding": "not-a-number"}]})
    assert "padding: 12pt" in style


# --- PADDING-FONT-STYLE-01 C2: italic boolean -> font-style emit ---


def test_italic_default_emits_font_style_normal() -> None:
    style = _speech_bubble_style(None)
    assert "font-style: normal" in style


def test_italic_true_emits_font_style_italic() -> None:
    style = _speech_bubble_style({"bubbles": [{"italic": True}]})
    assert "font-style: italic" in style


def test_italic_false_emits_font_style_normal() -> None:
    style = _speech_bubble_style({"bubbles": [{"italic": False}]})
    assert "font-style: normal" in style


def test_italic_honours_bubbles_zero_precedence() -> None:
    style = _speech_bubble_style(
        {"italic": False, "bubbles": [{"italic": True}]}
    )
    assert "font-style: italic" in style


def test_italic_malformed_value_falls_back_to_normal() -> None:
    # Non-boolean must not flip the toggle by truthy-coerce.
    style = _speech_bubble_style({"bubbles": [{"italic": "yes"}]})
    assert "font-style: normal" in style


# --- 4c-B-2 C3: Tier 2 Typography emit ---
#
# Five typography properties land in the inline-style on the
# .region-text element. Mirrors PageCanvas.tsx speechBubbleInlineStyle.


def test_tier2_default_emits_atkinson_hyperlegible_14pt_normal_black_center() -> None:
    style = _speech_bubble_style(None)
    assert "font-family: 'Atkinson Hyperlegible'" in style
    assert "font-size: 14pt" in style
    assert "font-weight: normal" in style
    assert "color: rgb(0, 0, 0)" in style
    assert "text-align: center" in style


def test_tier2_font_family_emits_selected_font() -> None:
    style = _speech_bubble_style({"bubbles": [{"font_family": "Comic Neue"}]})
    assert "font-family: 'Comic Neue'" in style


def test_tier2_font_size_emits_pt_unit() -> None:
    style = _speech_bubble_style({"bubbles": [{"font_size": 24}]})
    assert "font-size: 24pt" in style


def test_tier2_font_size_clamps_into_range() -> None:
    high = _speech_bubble_style({"bubbles": [{"font_size": 99}]})
    assert "font-size: 32pt" in high
    low = _speech_bubble_style({"bubbles": [{"font_size": 5}]})
    assert "font-size: 10pt" in low


def test_tier2_font_weight_bold_emits() -> None:
    style = _speech_bubble_style({"bubbles": [{"font_weight": "bold"}]})
    assert "font-weight: bold" in style


def test_tier2_text_color_hex_emits_rgb() -> None:
    style = _speech_bubble_style({"bubbles": [{"text_color": "#aa1122"}]})
    assert "color: rgb(170, 17, 34)" in style


def test_tier2_text_align_variants_all_emit() -> None:
    for align in ("left", "right", "center"):
        style = _speech_bubble_style({"bubbles": [{"text_align": align}]})
        assert f"text-align: {align}" in style


def test_tier2_unknown_text_align_falls_back_to_center() -> None:
    style = _speech_bubble_style({"bubbles": [{"text_align": "garbage"}]})
    assert "text-align: center" in style


def test_tier2_unknown_font_weight_falls_back_to_normal() -> None:
    style = _speech_bubble_style({"bubbles": [{"font_weight": "garbage"}]})
    assert "font-weight: normal" in style


def test_tier2_malformed_text_color_falls_back_to_black() -> None:
    style = _speech_bubble_style({"bubbles": [{"text_color": "not-a-hex"}]})
    assert "color: rgb(0, 0, 0)" in style


# --- _image_layout_style ---


def test_image_top_text_bottom_default_no_styles() -> None:
    out = _image_layout_style("image_top_text_bottom", None)
    assert out["canvas_style"] == ""
    assert out["region_image_style"] == ""
    assert out["image_style"] == ""
    assert out["region_text_style"] == ""


def test_image_top_text_bottom_position_left_sets_justify_content() -> None:
    out = _image_layout_style(
        "image_top_text_bottom", {"image_position": "left"}
    )
    assert "justify-content: flex-start" in out["region_image_style"]


def test_image_top_text_bottom_position_right_sets_flex_end() -> None:
    out = _image_layout_style(
        "image_top_text_bottom", {"image_position": "right"}
    )
    assert "justify-content: flex-end" in out["region_image_style"]


def test_image_top_text_bottom_fit_cover_sets_object_fit() -> None:
    out = _image_layout_style(
        "image_top_text_bottom", {"image_fit": "cover"}
    )
    assert "object-fit: cover" in out["image_style"]


def test_image_left_text_right_split_ratio_drives_canvas_columns() -> None:
    out = _image_layout_style(
        "image_left_text_right", {"split_ratio": 65}
    )
    assert "grid-template-columns: 65% 35%" in out["canvas_style"]


def test_image_left_text_right_split_ratio_clamped_into_range() -> None:
    out_low = _image_layout_style("image_left_text_right", {"split_ratio": 30})
    assert "grid-template-columns: 50% 50%" in out_low["canvas_style"]
    out_high = _image_layout_style("image_left_text_right", {"split_ratio": 90})
    assert "grid-template-columns: 70% 30%" in out_high["canvas_style"]


def test_image_full_text_overlay_text_position_top() -> None:
    out = _image_layout_style(
        "image_full_text_overlay", {"text_position": "top"}
    )
    assert "top: 0" in out["region_text_style"]
    assert "bottom: auto" in out["region_text_style"]


def test_image_full_text_overlay_text_position_middle() -> None:
    out = _image_layout_style(
        "image_full_text_overlay", {"text_position": "middle"}
    )
    assert "top: 50%" in out["region_text_style"]
    assert "translateY(-50%)" in out["region_text_style"]


def test_image_full_text_overlay_text_position_default_bottom() -> None:
    out = _image_layout_style("image_full_text_overlay", None)
    assert "bottom: 0" in out["region_text_style"]
    assert "top: auto" in out["region_text_style"]
    assert "rgba(0, 0, 0, 0.45)" in out["region_text_style"]


def test_image_full_text_overlay_backdrop_opacity_clamped() -> None:
    out_low = _image_layout_style(
        "image_full_text_overlay", {"text_backdrop_opacity": 0.1}
    )
    assert "rgba(0, 0, 0, 0.3)" in out_low["region_text_style"]
    out_high = _image_layout_style(
        "image_full_text_overlay", {"text_backdrop_opacity": 0.95}
    )
    assert "rgba(0, 0, 0, 0.8)" in out_high["region_text_style"]


# --- _render_page ---


def _make_page(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": "p1",
        "position": 1,
        "layout": "image_top_text_bottom",
        "text_content": "Hello world",
        "image_asset_id": None,
        "layout_config": None,
    }
    base.update(overrides)
    return base


def test_render_page_emits_layout_class() -> None:
    html = _render_page(_make_page(layout="speech_bubble"), {})
    assert 'class="page page--speech_bubble"' in html


def test_render_page_escapes_text_content() -> None:
    html = _render_page(
        _make_page(text_content="<script>alert(1)</script>"), {}
    )
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_render_page_omits_image_region_for_text_only() -> None:
    html = _render_page(_make_page(layout="text_only"), {})
    assert "region-image" not in html
    assert "region-text" in html


def test_render_page_includes_img_when_asset_resolves() -> None:
    html = _render_page(
        _make_page(image_asset_id="a1"),
        {"a1": "file:///tmp/img.png"},
    )
    assert '<img' in html
    assert 'src="file:///tmp/img.png"' in html


def test_render_page_omits_img_when_asset_missing_from_map() -> None:
    html = _render_page(_make_page(image_asset_id="a1"), {})
    assert "<img" not in html
    # The image REGION is still rendered (placeholder space).
    assert "region-image" in html


def test_render_page_speech_bubble_inline_style_present() -> None:
    html = _render_page(
        _make_page(
            layout="speech_bubble",
            layout_config={"anchor_position": "top-left", "opacity": 0.7, "size": 35},
        ),
        {},
    )
    # The bubble's region-text carries the computed inline style.
    assert "top: 16pt" in html
    assert "left: 16pt" in html
    assert "rgba(255, 255, 255, 0.7)" in html
    assert "width: 35%" in html


def test_render_page_image_top_text_bottom_layout_config_styles() -> None:
    html = _render_page(
        _make_page(
            layout="image_top_text_bottom",
            image_asset_id="a1",
            layout_config={"image_position": "right", "image_fit": "cover"},
        ),
        {"a1": "file:///tmp/img.png"},
    )
    assert "justify-content: flex-end" in html
    assert "object-fit: cover" in html


def test_render_page_image_left_text_right_split_ratio_inline() -> None:
    html = _render_page(
        _make_page(
            layout="image_left_text_right",
            layout_config={"split_ratio": 65},
        ),
        {},
    )
    assert "grid-template-columns: 65% 35%" in html


def test_render_page_image_full_text_overlay_position_top() -> None:
    html = _render_page(
        _make_page(
            layout="image_full_text_overlay",
            image_asset_id="a1",
            layout_config={"text_position": "top", "text_backdrop_opacity": 0.6},
        ),
        {"a1": "file:///tmp/img.png"},
    )
    assert "top: 0" in html
    assert "rgba(0, 0, 0, 0.6)" in html


# --- _build_html ---


def test_build_html_emits_doctype_and_title() -> None:
    html = _build_html({"title": "My Book"}, [], {})
    assert html.startswith("<!DOCTYPE html>")
    assert "<title>My Book</title>" in html


def test_build_html_escapes_title() -> None:
    html = _build_html({"title": "<evil>"}, [], {})
    assert "<title>&lt;evil&gt;</title>" in html


def test_build_html_includes_atkinson_font_face() -> None:
    html = _build_html({}, [], {})
    assert "Atkinson Hyperlegible" in html
    assert "@font-face" in html


def test_build_html_renders_one_page_per_page_entry() -> None:
    pages = [_make_page(id="p1"), _make_page(id="p2"), _make_page(id="p3")]
    html = _build_html({}, pages, {})
    assert len(re.findall(r'class="page', html)) == 3


# --- PDF metadata embedding (PB-PHASE4 Session 6 Commit 3) ---


def test_build_html_includes_author_meta_when_author_set() -> None:
    """``<meta name="author">`` lands in head when book has an
    author. WeasyPrint reads this into the PDF's /Author field."""
    html = _build_html(
        {"title": "Book", "author": "T. Tester"}, [], {}
    )
    assert '<meta name="author" content="T. Tester" />' in html


def test_build_html_omits_author_meta_when_author_empty() -> None:
    """Empty author -> NO meta tag emitted. Avoids an empty-string
    PDF /Author field that would look like authored-by-nobody."""
    html = _build_html({"title": "Book", "author": ""}, [], {})
    assert 'name="author"' not in html


def test_build_html_omits_author_meta_when_author_whitespace_only() -> None:
    html = _build_html({"title": "Book", "author": "   "}, [], {})
    assert 'name="author"' not in html


def test_build_html_omits_author_meta_when_author_missing() -> None:
    html = _build_html({"title": "Book"}, [], {})
    assert 'name="author"' not in html


def test_build_html_includes_description_meta_when_description_set() -> None:
    """Description -> PDF /Subject field via the description meta tag."""
    html = _build_html(
        {"title": "Book", "description": "A whimsical tale."}, [], {}
    )
    assert '<meta name="description" content="A whimsical tale." />' in html


def test_build_html_omits_description_meta_when_description_empty() -> None:
    html = _build_html(
        {"title": "Book", "description": ""}, [], {}
    )
    assert 'name="description"' not in html


def test_build_html_always_includes_generator_meta() -> None:
    """Generator meta lands unconditionally (no per-book toggle).
    Surfaces in PDF /Producer field as "Bibliogon picture-book PDF"
    + the WeasyPrint version (WeasyPrint appends itself)."""
    html = _build_html({"title": "Book"}, [], {})
    assert '<meta name="generator" content="Bibliogon picture-book PDF" />' in html


def test_build_html_escapes_author_in_meta_tag() -> None:
    """Defense against XSS-style author values + plain attribute
    escape (a name containing '"' would break the attribute)."""
    html = _build_html(
        {"title": "Book", "author": 'Evil "quoted" Author'}, [], {}
    )
    assert '<meta name="author" content="Evil &quot;quoted&quot; Author" />' in html


def test_build_html_escapes_description_in_meta_tag() -> None:
    html = _build_html(
        {"title": "Book", "description": "<script>alert(1)</script>"}, [], {}
    )
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


def test_build_html_lang_from_book_data_language() -> None:
    """``<html lang="...">`` reflects book language (PDF
    accessibility metadata)."""
    html = _build_html(
        {"title": "Book", "language": "en"}, [], {}
    )
    assert '<html lang="en">' in html


def test_build_html_lang_defaults_de_when_language_absent() -> None:
    """No language field on book_data -> defaults to "de" (Bibliogon's
    primary authoring language). Matches pre-Commit-3 behavior."""
    html = _build_html({"title": "Book"}, [], {})
    assert '<html lang="de">' in html


def test_build_html_lang_defaults_de_when_language_empty_string() -> None:
    """Empty-string language coerces to "de" (the same fallback as
    missing). Defensive against legacy rows."""
    html = _build_html(
        {"title": "Book", "language": ""}, [], {}
    )
    assert '<html lang="de">' in html


def test_build_html_emits_meta_tags_in_head_section() -> None:
    """Sanity: the metadata meta tags live inside <head>, not
    floating between <body> tags. PDF readers only parse the head
    for metadata."""
    html = _build_html(
        {
            "title": "Book",
            "author": "T. Tester",
            "description": "Desc",
        },
        [],
        {},
    )
    head_section = html.split("</head>")[0]
    assert '<meta name="author"' in head_section
    assert '<meta name="description"' in head_section
    assert '<meta name="generator"' in head_section


# --- _build_assets_map ---


def test_build_assets_map_resolves_absolute_paths(tmp_path: Path) -> None:
    img = tmp_path / "img.png"
    img.write_bytes(b"PNG-FAKE")
    out = _build_assets_map(
        [{"id": "a1", "path": str(img)}],
        tmp_path,
    )
    assert "a1" in out
    assert out["a1"].startswith("file://")
    assert out["a1"].endswith("img.png")


def test_build_assets_map_resolves_relative_paths(tmp_path: Path) -> None:
    img = tmp_path / "subdir" / "img.png"
    img.parent.mkdir()
    img.write_bytes(b"PNG-FAKE")
    out = _build_assets_map(
        [{"id": "a1", "path": "subdir/img.png"}],
        tmp_path,
    )
    assert "a1" in out
    assert "img.png" in out["a1"]


def test_build_assets_map_skips_missing_files(tmp_path: Path) -> None:
    out = _build_assets_map(
        [{"id": "a1", "path": "nonexistent.png"}],
        tmp_path,
    )
    assert "a1" not in out


def test_build_assets_map_skips_entries_without_id_or_path(tmp_path: Path) -> None:
    out = _build_assets_map(
        [{"path": "no-id.png"}, {"id": "a1"}, {"id": "a2", "path": ""}],
        tmp_path,
    )
    assert out == {}


# --- End-to-end WeasyPrint render ---


def test_generate_picture_book_pdf_produces_pdf_file(tmp_path: Path) -> None:
    """Smoke: render a 3-page picture-book to PDF; assert PDF exists + non-zero."""
    book_data = {"title": "Smoke Test Book"}
    pages = [
        _make_page(
            id="p1",
            position=1,
            layout="image_top_text_bottom",
            text_content="Page one.",
        ),
        _make_page(
            id="p2",
            position=2,
            layout="speech_bubble",
            text_content="Page two with bubble.",
            layout_config={"anchor_position": "top-right", "opacity": 0.8, "size": 35},
        ),
        _make_page(
            id="p3",
            position=3,
            layout="text_only",
            text_content="Page three text only.",
        ),
    ]
    out = tmp_path / "out.pdf"
    result = generate_picture_book_pdf(
        book_data=book_data,
        pages=pages,
        assets=[],
        upload_dir=tmp_path,
        output_path=out,
    )
    assert result == out
    assert out.exists()
    assert out.stat().st_size > 1000  # non-trivial PDF
    # Sanity: PDF magic bytes.
    assert out.read_bytes()[:4] == b"%PDF"


# --- PB-PHASE4 Session 4c-B-1 Fix C: defensive plain-text extraction ---


def test_extract_plain_text_returns_empty_for_none_and_empty() -> None:
    assert _extract_plain_text(None) == ""
    assert _extract_plain_text("") == ""


def test_extract_plain_text_returns_plain_as_is() -> None:
    """Legacy plain-text rows (Tier-Property layouts pre-Session-
    4c-B-1) round-trip unchanged."""
    assert _extract_plain_text("Hello world") == "Hello world"
    assert _extract_plain_text("Multi\nline") == "Multi\nline"
    # Leading whitespace that does NOT start with '{' stays as-is.
    assert _extract_plain_text("  leading spaces") == "  leading spaces"


def test_extract_plain_text_unwraps_single_paragraph_tiptap_doc() -> None:
    doc = _json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Once upon a time."}],
                }
            ],
        }
    )
    assert _extract_plain_text(doc) == "Once upon a time."


def test_extract_plain_text_joins_multi_paragraph_with_newlines() -> None:
    doc = _json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "First."}],
                },
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Second."}],
                },
            ],
        }
    )
    assert _extract_plain_text(doc) == "First.\nSecond."


def test_extract_plain_text_drops_formatting_marks() -> None:
    """Bold + italic marks degrade to plain text in the PDF render.
    Proper TipTap-to-HTML walking (preserving <strong>/<em>) lands
    as PICTURE-BOOK-PDF-TIPTAP-RENDER-01 (P3)."""
    doc = _json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "plain "},
                        {"type": "text", "marks": [{"type": "bold"}], "text": "bold"},
                        {"type": "text", "text": " more"},
                    ],
                }
            ],
        }
    )
    assert _extract_plain_text(doc) == "plain bold more"


def test_extract_plain_text_heading_blocks_get_newline_boundary() -> None:
    doc = _json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": "Chapter One"}],
                },
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Once upon a time."}],
                },
            ],
        }
    )
    assert _extract_plain_text(doc) == "Chapter One\nOnce upon a time."


def test_extract_plain_text_falls_back_on_malformed_json() -> None:
    """Defensive: a string starting with '{' but failing to parse
    returns as-is rather than raising."""
    malformed = "{not valid json"
    assert _extract_plain_text(malformed) == malformed


def test_extract_plain_text_falls_back_on_non_tiptap_json() -> None:
    """A JSON object that parses but isn't a TipTap doc returns
    as-is. Defensive against any future text_content shape change."""
    other = '{"foo": "bar"}'
    assert _extract_plain_text(other) == other


def test_extract_plain_text_handles_nested_lists() -> None:
    """Bullet lists land in TipTap JSON as nested
    bulletList > listItem > paragraph > text. The walker
    recursively descends."""
    doc = _json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "bulletList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [
                                        {"type": "text", "text": "Item 1"}
                                    ],
                                }
                            ],
                        },
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [
                                        {"type": "text", "text": "Item 2"}
                                    ],
                                }
                            ],
                        },
                    ],
                }
            ],
        }
    )
    assert _extract_plain_text(doc) == "Item 1\nItem 2"


def test_render_page_uses_extracted_plain_text_for_tiptap_json() -> None:
    """Regression pin for the v0.34.0+v0.35.0-bound regression: a
    TipTap-layout page with JSON-shaped text_content must render the
    EXTRACTED text in the <p>, not the raw JSON. Otherwise the
    printed PDF shows users their text as ``{"type":"doc",...}``."""
    doc = _json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Authored in TipTap"}],
                }
            ],
        }
    )
    page = {
        "id": "p1",
        "position": 1,
        "layout": "image_top_text_bottom",
        "text_content": doc,
        "image_asset_id": None,
        "layout_config": None,
    }
    html = _render_page(page, {})
    assert "Authored in TipTap" in html
    assert '"type":"doc"' not in html
    # The raw JSON braces also must NOT leak through.
    assert '{"type"' not in html


def test_render_page_keeps_plain_text_unchanged() -> None:
    """Legacy plain-text Tier-Property pages render unchanged."""
    page = {
        "id": "p2",
        "position": 1,
        "layout": "speech_bubble",
        "text_content": "Bubble text!",
        "image_asset_id": None,
        "layout_config": None,
    }
    html = _render_page(page, {})
    assert "Bubble text!" in html


# --- PB-PHASE4 Session 4c-B-1 Finding G3: OFL font bundle ---
#
# Tests for the 5-font catalog that ships under
# ``plugins/bibliogon-plugin-export/fonts/`` and the @font-face
# generator that embeds them into the picture-book PDF CSS via
# ``src: url(file://...)``. KDP-grade embedded fonts per D10.


def test_picture_book_fonts_catalog_has_five_entries() -> None:
    """The D8-locked set: Atkinson + Andika + Comic Neue +
    Lexend + OpenDyslexic. Pins the catalog size + canonical ids
    against accidental drift between the TS + Python sides."""
    from bibliogon_export.picture_book_fonts import PICTURE_BOOK_FONTS

    assert len(PICTURE_BOOK_FONTS) == 5
    ids = [f.id for f in PICTURE_BOOK_FONTS]
    assert ids == [
        "Atkinson Hyperlegible",
        "Andika",
        "Comic Neue",
        "Lexend",
        "OpenDyslexic",
    ]


def test_picture_book_fonts_default_is_atkinson() -> None:
    """D11 backward-compat: pages without a fontFamily mark
    render with Atkinson Hyperlegible (the pre-Finding-G
    hardcoded default).
    """
    from bibliogon_export.picture_book_fonts import (
        DEFAULT_PICTURE_BOOK_FONT_ID,
    )

    assert DEFAULT_PICTURE_BOOK_FONT_ID == "Atkinson Hyperlegible"


def test_picture_book_fonts_files_exist_on_disk() -> None:
    """Every catalog entry's ``file_name`` MUST resolve to a real
    file under :data:`FONTS_DIR`. Catches accidental deletion of
    a font bundle file before it bites the PDF generator at
    render-time (font_face_css raises FileNotFoundError then —
    this test makes the failure visible at test-time instead).
    """
    from bibliogon_export.picture_book_fonts import (
        FONTS_DIR,
        PICTURE_BOOK_FONTS,
    )

    for font in PICTURE_BOOK_FONTS:
        font_path = FONTS_DIR / font.file_name
        assert font_path.is_file(), (
            f"Bundled font file missing for {font.id!r}: {font_path}"
        )
        # File-magic check: TTF starts with 0x00010000 or "OTTO"
        # / "true"; OTF starts with "OTTO". Reject empty / HTML-
        # 404 / corrupt files. Reading 4 bytes is enough.
        with open(font_path, "rb") as f:
            magic = f.read(4)
        assert magic in (
            b"\x00\x01\x00\x00",  # TTF
            b"OTTO",  # OTF
            b"true",  # legacy TTF
        ), f"Bundled font {font.file_name!r} has non-font magic: {magic!r}"


def test_font_face_css_emits_one_rule_per_font() -> None:
    """The CSS generator must produce 5 @font-face blocks, one
    per shipped font. Catches under/over-generation regressions
    in :func:`font_face_css`."""
    from bibliogon_export.picture_book_fonts import font_face_css

    css = font_face_css()
    # 5 @font-face rules.
    assert css.count("@font-face") == 5
    # Each canonical id appears as a font-family value.
    for font_id in [
        "Atkinson Hyperlegible",
        "Andika",
        "Comic Neue",
        "Lexend",
        "OpenDyslexic",
    ]:
        assert f'font-family: "{font_id}"' in css


def test_font_face_css_uses_file_url_for_kdp_embedding() -> None:
    """D10: every @font-face must use ``src: url(file://...)``,
    NOT ``src: local(...)``. The url() form forces WeasyPrint
    to embed the font bytes into the PDF; local() relies on
    the system font cache (KDP-print-fragile)."""
    from bibliogon_export.picture_book_fonts import font_face_css

    css = font_face_css()
    # At least one file:// url per font.
    assert css.count("src: url(\"file://") == 5
    # And NO local() references (rule is exclusive).
    assert "src: local(" not in css


def test_is_known_font_matches_catalog_ids() -> None:
    """The G4 walker uses this predicate to decide whether to
    honor a TipTap fontFamily mark or fall back to the default.
    Pins the contract: case-sensitive match against the 5
    canonical ids; ``None`` + unknowns return False."""
    from bibliogon_export.picture_book_fonts import is_known_font

    for known in [
        "Atkinson Hyperlegible",
        "Andika",
        "Comic Neue",
        "Lexend",
        "OpenDyslexic",
    ]:
        assert is_known_font(known) is True
    # Unknown / fuzzy / None all reject.
    assert is_known_font(None) is False
    assert is_known_font("") is False
    assert is_known_font("Helvetica") is False
    assert is_known_font("atkinson hyperlegible") is False  # case-sensitive


def test_build_html_includes_font_face_block() -> None:
    """End-to-end: the picture-book PDF HTML must contain the
    @font-face declarations BEFORE the static _BASE_CSS rules
    (so the in-PDF @page + html, body rules can reference the
    embedded fonts). Pins the wiring at the _build_html call
    site, which is the actual PDF render path."""
    html = _build_html(
        book_data={"title": "Test", "author": "Author", "language": "en"},
        pages=[],
        assets_map={},
    )
    # 5 @font-face rule blocks landed. Counting "@font-face {"
    # (the actual rule opener) rather than the bare token — the
    # static _BASE_CSS comment block also references "@font-face"
    # in prose, which is a happy false positive for a bare count.
    assert html.count("@font-face {") == 5
    # Embeds the 5 ids
    assert 'font-family: "Atkinson Hyperlegible"' in html
    assert 'font-family: "OpenDyslexic"' in html
    # Static _BASE_CSS rules also still present (the @page rule
    # is the load-bearing one for the PDF dimensions).
    assert "@page" in html
    assert "size: 8.5in 8.5in" in html
    # Order: the first @font-face rule precedes the @page rule
    # (the dynamic block is prepended ahead of _BASE_CSS).
    assert html.index("@font-face {") < html.index("@page")


# --- PB-PHASE4 Session 4c-B-1 Finding G4: TipTap walker ---
#
# Closes PICTURE-BOOK-PDF-TIPTAP-RENDER-01. _render_tiptap_doc
# walks a TipTap JSON doc + emits structured HTML preserving
# the D1 MVP marks (bold/italic/underline/fontFamily) +
# alignment + headings 1-3 + lists. Plain-string text_content
# (Tier-Property layouts) passes through as <p>{escaped}</p>.


def _make_tiptap_doc(*paragraphs: dict[str, Any]) -> str:
    """Build a serialized TipTap doc JSON. Each ``paragraphs``
    arg is a fully-formed paragraph or heading node dict."""
    return _json.dumps({"type": "doc", "content": list(paragraphs)})


def test_render_tiptap_doc_none_returns_empty_string() -> None:
    """D11 backward-compat: an empty/None text_content renders
    no content at all (not even an empty <p>)."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    assert _render_tiptap_doc(None) == ""
    assert _render_tiptap_doc("") == ""


def test_render_tiptap_doc_plain_string_wraps_in_single_p() -> None:
    """Tier-Property layouts store text_content as a plain
    string. The walker must wrap it in a single <p> with the
    text escaped — same shape as the pre-Finding-G output."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    assert _render_tiptap_doc("Hello world") == "<p>Hello world</p>"
    # HTML-special chars must be escaped.
    assert (
        _render_tiptap_doc("a < b & c") == "<p>a &lt; b &amp; c</p>"
    )


def test_render_tiptap_doc_malformed_json_falls_back_to_plain() -> None:
    """A text_content value that starts with '{' but is NOT
    valid JSON falls back to the plain-string wrap. Defensive
    path; should never happen in practice but matches the
    pre-Finding-G defensive read behavior."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    assert _render_tiptap_doc("{not valid json") == (
        "<p>{not valid json</p>"
    )


def test_render_tiptap_doc_basic_paragraph() -> None:
    """A minimal TipTap doc with one paragraph + plain text
    renders as a single <p>."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc = _make_tiptap_doc({
        "type": "paragraph",
        "content": [{"type": "text", "text": "Hello"}],
    })
    assert _render_tiptap_doc(doc) == "<p>Hello</p>"


def test_render_tiptap_doc_multiple_paragraphs() -> None:
    """Multiple top-level paragraphs render as separate <p>
    elements. This is a structural improvement over the
    pre-Finding-G path that flattened everything into one
    paragraph joined by newlines."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc = _make_tiptap_doc(
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": "First"}],
        },
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": "Second"}],
        },
    )
    assert _render_tiptap_doc(doc) == "<p>First</p><p>Second</p>"


def test_render_tiptap_doc_bold_mark() -> None:
    """Text with a ``bold`` mark wraps in ``<strong>``."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc = _make_tiptap_doc({
        "type": "paragraph",
        "content": [
            {
                "type": "text",
                "text": "loud",
                "marks": [{"type": "bold"}],
            }
        ],
    })
    assert _render_tiptap_doc(doc) == "<p><strong>loud</strong></p>"


def test_render_tiptap_doc_italic_mark() -> None:
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc = _make_tiptap_doc({
        "type": "paragraph",
        "content": [
            {
                "type": "text",
                "text": "leaning",
                "marks": [{"type": "italic"}],
            }
        ],
    })
    assert _render_tiptap_doc(doc) == "<p><em>leaning</em></p>"


def test_render_tiptap_doc_underline_mark() -> None:
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc = _make_tiptap_doc({
        "type": "paragraph",
        "content": [
            {
                "type": "text",
                "text": "lined",
                "marks": [{"type": "underline"}],
            }
        ],
    })
    assert _render_tiptap_doc(doc) == "<p><u>lined</u></p>"


def test_render_tiptap_doc_combined_marks_stable_order() -> None:
    """Multiple marks on the same text node nest in a stable
    order: bold (outer) → italic → underline → fontFamily
    (inner). Test asserts the exact nesting so a refactor
    that flips the order is caught."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc = _make_tiptap_doc({
        "type": "paragraph",
        "content": [
            {
                "type": "text",
                "text": "all",
                "marks": [
                    {"type": "bold"},
                    {"type": "italic"},
                    {"type": "underline"},
                    {
                        "type": "textStyle",
                        "attrs": {"fontFamily": "Andika"},
                    },
                ],
            }
        ],
    })
    assert _render_tiptap_doc(doc) == (
        "<p><strong><em><u>"
        '<span style="font-family: \'Andika\'">all</span>'
        "</u></em></strong></p>"
    )


def test_render_tiptap_doc_known_font_emits_span() -> None:
    """Every one of the 5 catalog fonts wraps in a
    font-family span. Pins the contract that the walker
    honors the full D8 set."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    for font_id in [
        "Atkinson Hyperlegible",
        "Andika",
        "Comic Neue",
        "Lexend",
        "OpenDyslexic",
    ]:
        doc = _make_tiptap_doc({
            "type": "paragraph",
            "content": [
                {
                    "type": "text",
                    "text": "x",
                    "marks": [
                        {
                            "type": "textStyle",
                            "attrs": {"fontFamily": font_id},
                        }
                    ],
                }
            ],
        })
        rendered = _render_tiptap_doc(doc)
        assert (
            f'<span style="font-family: \'{font_id}\'">x</span>'
            in rendered
        )


def test_render_tiptap_doc_unknown_font_falls_through_silently() -> None:
    """Unknown fontFamily values (e.g. injected via malformed
    JSON or a future TipTap upgrade) are silently dropped.
    D11 backward-compat: the rendered HTML carries no
    font-family span; the html, body default Atkinson
    Hyperlegible takes over."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc = _make_tiptap_doc({
        "type": "paragraph",
        "content": [
            {
                "type": "text",
                "text": "x",
                "marks": [
                    {
                        "type": "textStyle",
                        "attrs": {"fontFamily": "Helvetica"},
                    }
                ],
            }
        ],
    })
    rendered = _render_tiptap_doc(doc)
    assert "font-family" not in rendered
    assert rendered == "<p>x</p>"


def test_render_tiptap_doc_heading_levels() -> None:
    """D1 MVP supports heading levels 1-3 via the toolbar.
    The walker emits <h1>/<h2>/<h3> for those. Levels 4-6
    pass through (TipTap supports them via the API even if
    the toolbar doesn't expose them); levels out of range
    clamp."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    for level in [1, 2, 3, 4, 5, 6]:
        doc = _make_tiptap_doc({
            "type": "heading",
            "attrs": {"level": level},
            "content": [{"type": "text", "text": "T"}],
        })
        assert _render_tiptap_doc(doc) == f"<h{level}>T</h{level}>"


def test_render_tiptap_doc_heading_level_out_of_range_clamps() -> None:
    """Level 0 clamps up to 1; level 99 clamps down to 6.
    Defensive against malformed input + future upstream changes."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc_low = _make_tiptap_doc({
        "type": "heading",
        "attrs": {"level": 0},
        "content": [{"type": "text", "text": "T"}],
    })
    assert _render_tiptap_doc(doc_low) == "<h1>T</h1>"
    doc_high = _make_tiptap_doc({
        "type": "heading",
        "attrs": {"level": 99},
        "content": [{"type": "text", "text": "T"}],
    })
    assert _render_tiptap_doc(doc_high) == "<h6>T</h6>"


def test_render_tiptap_doc_text_align() -> None:
    """Paragraph + heading nodes carry a ``textAlign`` attr that
    the walker emits as ``style="text-align: ..."``. Values
    outside the 4-value enum are dropped (defensive)."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    for align in ["left", "center", "right", "justify"]:
        doc = _make_tiptap_doc({
            "type": "paragraph",
            "attrs": {"textAlign": align},
            "content": [{"type": "text", "text": "T"}],
        })
        assert (
            _render_tiptap_doc(doc)
            == f'<p style="text-align: {align}">T</p>'
        )

    # Unknown value silently dropped.
    doc_bogus = _make_tiptap_doc({
        "type": "paragraph",
        "attrs": {"textAlign": "diagonal"},
        "content": [{"type": "text", "text": "T"}],
    })
    assert _render_tiptap_doc(doc_bogus) == "<p>T</p>"


def test_render_tiptap_doc_lists() -> None:
    """Bullet + ordered lists with list items."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc = _make_tiptap_doc(
        {
            "type": "bulletList",
            "content": [
                {
                    "type": "listItem",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "a"}
                            ],
                        }
                    ],
                },
                {
                    "type": "listItem",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "b"}
                            ],
                        }
                    ],
                },
            ],
        },
    )
    assert _render_tiptap_doc(doc) == (
        "<ul>"
        "<li><p>a</p></li>"
        "<li><p>b</p></li>"
        "</ul>"
    )


def test_render_tiptap_doc_escapes_html_special_chars() -> None:
    """User text containing HTML special chars (``<``, ``>``,
    ``&``, etc.) must be escaped before insertion. Defensive
    against any text-injection class issue at the PDF render
    layer."""
    from bibliogon_export.picture_book_pdf import _render_tiptap_doc

    doc = _make_tiptap_doc({
        "type": "paragraph",
        "content": [
            {"type": "text", "text": "a < b & <script>x</script>"}
        ],
    })
    rendered = _render_tiptap_doc(doc)
    assert "<script>" not in rendered
    assert "&lt;script&gt;" in rendered
    assert "&amp;" in rendered


def test_render_page_uses_tiptap_walker_for_json_text_content() -> None:
    """End-to-end at the _render_page level: a TipTap-shaped
    text_content with bold + a known font renders inside the
    region-text div as proper HTML. Pins the integration of
    _render_page → _render_tiptap_doc."""
    doc = _make_tiptap_doc({
        "type": "paragraph",
        "content": [
            {
                "type": "text",
                "text": "Hello",
                "marks": [
                    {"type": "bold"},
                    {
                        "type": "textStyle",
                        "attrs": {"fontFamily": "Comic Neue"},
                    },
                ],
            }
        ],
    })
    page = {
        "id": "p1",
        "position": 1,
        "layout": "image_top_text_bottom",
        "text_content": doc,
        "image_asset_id": None,
        "layout_config": None,
    }
    html = _render_page(page, {})
    # The walker output sits inside the region-text div.
    assert (
        '<div class="region region-text"'
        in html
    )
    assert "<strong>" in html
    assert '<span style="font-family: \'Comic Neue\'">Hello</span>' in html
    # And NOT the raw JSON.
    assert '"type":"doc"' not in html


def test_render_page_tier_property_layout_plain_text_unchanged() -> None:
    """Tier-Property layouts (speech_bubble +
    image_full_text_overlay) store text_content as a plain
    string. The walker preserves the pre-Finding-G shape:
    ``<p>{escaped}</p>``. Pins backward-compat for those
    layouts."""
    page = {
        "id": "p1",
        "position": 1,
        "layout": "speech_bubble",
        "text_content": "Bubble & text!",
        "image_asset_id": None,
        "layout_config": None,
    }
    html = _render_page(page, {})
    # Exact match for the text-bearing fragment.
    assert "<p>Bubble &amp; text!</p>" in html
