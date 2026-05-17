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

from bibliogon_export.picture_book_pdf import (
    _build_assets_map,
    _build_html,
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


def test_speech_bubble_size_clamped_into_range() -> None:
    assert "width: 20%" in _speech_bubble_style({"size": 10})
    assert "width: 60%" in _speech_bubble_style({"size": 90})
    assert "width: 30%" in _speech_bubble_style({"size": 30})


def test_speech_bubble_unknown_anchor_falls_back_to_bottom_center() -> None:
    style = _speech_bubble_style({"anchor_position": "garbage"})
    assert "bottom: 16pt" in style
    assert "left: 50%" in style


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
