"""Tests for comic_book_pdf walker (plugin-comics Session 2 C3).

Lives in backend/tests/ (not the plugin's own tests/) because the
walker imports from bibliogon_export.* which is NOT in the
per-plugin isolated venv. The backend's combined poetry.lock has
both plugins as path-deps so the walker is importable here.

Coverage scope (pre-WeasyPrint, no actual PDF render):
- Grid-template resolution (3 ids + default + invalid + missing).
- Bubble-type CSS variants (6 types + unknown falls back to speech).
- SVG tail emit (4 octant directions + none + auto + invalid).
- Single-bubble HTML emit (text + position + width/height +
  bubble_config Tier 1+2 overrides + tail).
- Single-panel HTML emit (image_asset_id resolution + bubbles
  nested + panel_config overrides).
- Page render (CSS Grid template from layout_config + panels in
  position order).
- Full HTML doc emit (metadata + font CSS + format CSS + pages).
- Assets map resolution (file:// URLs + missing files skipped).
- Filename suffix policy (format-first-then-bleed; default +
  bleed + non-default combinations) — covered indirectly via
  _export_comic_book_pdf integration test in test_comic_routes.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from bibliogon_comics.comic_book_pdf import (
    COMIC_GRID_TEMPLATES,
    DEFAULT_COMIC_GRID_TEMPLATE,
    _BUBBLE_TYPE_CSS,
    _GRID_TEMPLATE_CSS,
    _build_assets_map,
    _build_bubble_path,
    _build_comic_html,
    _bubble_type_style,
    _render_bubble_tail_svg,
    _render_comic_bubble,
    _render_comic_page,
    _render_comic_panel,
    _resolve_comic_grid_template,
    generate_comic_book_pdf,
)


# --- Grid-template resolution ---


@pytest.mark.parametrize("template_id", list(COMIC_GRID_TEMPLATES))
def test_resolve_comic_grid_template_accepts_each_valid_id(template_id: str) -> None:
    assert _resolve_comic_grid_template({"comic_grid_template": template_id}) == template_id


def test_resolve_comic_grid_template_falls_back_for_missing_key() -> None:
    assert _resolve_comic_grid_template({}) == DEFAULT_COMIC_GRID_TEMPLATE


def test_resolve_comic_grid_template_falls_back_for_none_input() -> None:
    assert _resolve_comic_grid_template(None) == DEFAULT_COMIC_GRID_TEMPLATE


def test_resolve_comic_grid_template_falls_back_for_unknown_value() -> None:
    assert (
        _resolve_comic_grid_template({"comic_grid_template": "garbage"})
        == DEFAULT_COMIC_GRID_TEMPLATE
    )


def test_resolve_comic_grid_template_default_is_single_panel() -> None:
    assert DEFAULT_COMIC_GRID_TEMPLATE == "single_panel"


# --- Standard Layouts CSS shape (Phase 1, 2026-05-20) ---


def test_comic_grid_templates_includes_all_7_standards() -> None:
    """Standard Layouts shipped in Phase 1: 6 user-facing + 1 legacy
    (grid_3x3). Adding/removing a template here is a contract change
    that must mirror frontend ``COMIC_GRID_TEMPLATES`` in
    ``frontend/src/components/comics/ComicPanelGrid.tsx`` AND update
    the i18n picker labels."""
    assert set(COMIC_GRID_TEMPLATES) == {
        "single_panel",
        "grid_1x2",
        "grid_2x1",
        "grid_2x2",
        "grid_2x3",
        "grid_3x2",
        "grid_3x3",
    }
    # Every template id must have matching CSS.
    assert set(_GRID_TEMPLATE_CSS.keys()) == set(COMIC_GRID_TEMPLATES)


def test_grid_1x2_emits_2_columns_single_row() -> None:
    """grid_1x2 = side-by-side (1 row × 2 cols)."""
    css = _GRID_TEMPLATE_CSS["grid_1x2"]
    assert "grid-template-columns: repeat(2, 1fr)" in css
    assert "grid-template-rows: 1fr" in css


def test_grid_2x1_emits_single_column_2_rows() -> None:
    """grid_2x1 = stacked (2 rows × 1 col)."""
    css = _GRID_TEMPLATE_CSS["grid_2x1"]
    assert "grid-template-columns: 1fr" in css
    assert "grid-template-rows: repeat(2, 1fr)" in css


def test_grid_2x3_emits_3_columns_2_rows() -> None:
    """grid_2x3 = two-tier (2 rows × 3 cols)."""
    css = _GRID_TEMPLATE_CSS["grid_2x3"]
    assert "grid-template-columns: repeat(3, 1fr)" in css
    assert "grid-template-rows: repeat(2, 1fr)" in css


def test_grid_3x2_emits_2_columns_3_rows() -> None:
    """grid_3x2 = three-tier (3 rows × 2 cols)."""
    css = _GRID_TEMPLATE_CSS["grid_3x2"]
    assert "grid-template-columns: repeat(2, 1fr)" in css
    assert "grid-template-rows: repeat(3, 1fr)" in css


# --- Bubble-type CSS variants ---


@pytest.mark.parametrize(
    "bubble_type",
    ["speech", "thought", "narration", "shout", "whisper", "sound_effect"],
)
def test_bubble_type_style_returns_distinct_css_for_each_type(bubble_type: str) -> None:
    style = _bubble_type_style(bubble_type)
    assert style == _BUBBLE_TYPE_CSS[bubble_type]
    assert len(style) > 0


def test_bubble_type_style_falls_back_to_speech_for_unknown() -> None:
    assert _bubble_type_style("garbage") == _BUBBLE_TYPE_CSS["speech"]


def test_bubble_type_speech_uses_border_radius_50_percent() -> None:
    assert "border-radius: 50%" in _BUBBLE_TYPE_CSS["speech"]


def test_bubble_type_thought_carries_cloud_box_shadow_inset() -> None:
    assert "box-shadow" in _BUBBLE_TYPE_CSS["thought"]


def test_bubble_type_shout_uses_clip_path_polygon() -> None:
    assert "clip-path: polygon" in _BUBBLE_TYPE_CSS["shout"]


def test_bubble_type_whisper_uses_dashed_border() -> None:
    assert "dashed" in _BUBBLE_TYPE_CSS["whisper"]


def test_bubble_type_sound_effect_has_no_border() -> None:
    assert "border: none" in _BUBBLE_TYPE_CSS["sound_effect"]


# --- SVG tail primitive ---


def test_tail_svg_empty_for_none_direction() -> None:
    assert _render_bubble_tail_svg("none", 50, 16) == ""


def test_tail_svg_auto_emits_south_shape_by_default() -> None:
    auto = _render_bubble_tail_svg("auto", 50, 16)
    south = _render_bubble_tail_svg("S", 50, 16)
    assert auto == south
    assert "<svg" in auto
    assert "<polygon" in auto


@pytest.mark.parametrize("direction", ["N", "NE", "E", "SE", "S", "SW", "W", "NW"])
def test_tail_svg_emits_polygon_for_each_octant(direction: str) -> None:
    svg = _render_bubble_tail_svg(direction, 50, 16)
    assert svg.startswith("<svg")
    assert "<polygon" in svg
    # Visual integration (overlap + mask): the polygon is the
    # bubble-bg mask (no stroke); the two <line> elements carry
    # the tail's outline strokes.
    assert 'fill="white"' in svg
    assert 'stroke="none"' in svg
    assert svg.count("<line") == 2
    assert 'stroke="black"' in svg


def test_tail_svg_returns_empty_for_invalid_direction() -> None:
    assert _render_bubble_tail_svg("XYZ", 50, 16) == ""


def test_tail_svg_position_pct_clamps_to_0_100() -> None:
    low = _render_bubble_tail_svg("S", -10, 16)
    high = _render_bubble_tail_svg("S", 200, 16)
    assert "left: 0%" in low
    assert "left: 100%" in high


def test_tail_svg_bubble_background_color_threads_into_mask_fill() -> None:
    """Visual integration: the tail-fill polygon (the mask that
    hides the bubble border under the tail base) renders with the
    bubble's interior color, NOT a hardcoded white. Narration's
    parchment ``#f5f5dc`` is the canonical non-white case."""
    parchment = _render_bubble_tail_svg(
        "S", 50, 16, bubble_background_color="#f5f5dc",
    )
    assert 'fill="#f5f5dc"' in parchment
    # The stroke lines are unaffected — they remain black.
    assert 'stroke="black"' in parchment


def test_tail_svg_no_base_line_in_output() -> None:
    """The old closed-polygon shape stroked all three sides; the
    new overlap-mask shape strokes only the two side edges via
    <line> elements. This pin prevents a regression to the
    seam-visible closed-polygon form."""
    svg = _render_bubble_tail_svg("S", 50, 16)
    # Only the mask polygon (no stroke) + 2 lines.
    assert svg.count("<polygon") == 1
    assert svg.count("<line") == 2


# --- Single-bubble render ---


def _make_bubble(**overrides: Any) -> dict[str, Any]:
    base = {
        "id": "bub-1",
        "panel_id": "panel-1",
        "position": 1,
        "bubble_type": "speech",
        "anchor": {"x_pct": 50, "y_pct": 50},
        "width_pct": 30,
        "height_pct": 20,
        "tail_direction": "S",
        "tail_position_pct": 50,
        "tail_length_px": 16,
        "bubble_config": None,
        "text_content": "Hello world",
    }
    base.update(overrides)
    return base


def test_render_comic_bubble_includes_text_content() -> None:
    html = _render_comic_bubble(_make_bubble(text_content="Wow!"))
    assert "Wow!" in html


def test_render_comic_bubble_escapes_html_in_text() -> None:
    html = _render_comic_bubble(_make_bubble(text_content="<script>alert(1)</script>"))
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_render_comic_bubble_positions_via_anchor() -> None:
    html = _render_comic_bubble(_make_bubble(anchor={"x_pct": 25, "y_pct": 75}))
    assert "left: 25%" in html
    assert "top: 75%" in html


def test_render_comic_bubble_carries_bubble_type_in_data_attr() -> None:
    html = _render_comic_bubble(_make_bubble(bubble_type="thought"))
    assert 'data-bubble-type="thought"' in html


def test_render_comic_bubble_emits_svg_path_when_tail_direction_set() -> None:
    """Approach A (2026-05-27): bubble outline + tail render as one
    <svg> with one <path>. The tail diversion uses cubic beziers, so
    the path string includes ``C `` segments past the bubble's bbox."""
    html = _render_comic_bubble(_make_bubble(tail_direction="S"))
    assert "<svg" in html
    assert "<path" in html
    # Tail uses bezier curves, not straight lines.
    assert " C " in html


def test_render_comic_bubble_no_tail_for_direction_none() -> None:
    """Bubble outline still renders without the tail diversion when
    tail_direction='none'; the path's d attr just closes the
    bubble shape."""
    html = _render_comic_bubble(_make_bubble(tail_direction="none"))
    assert "<svg" in html
    assert "<path" in html


def test_render_comic_bubble_applies_bubble_config_background_color() -> None:
    """Approach A: background_color flows into the SVG path's fill
    attribute, not into a CSS background-color rule."""
    html = _render_comic_bubble(
        _make_bubble(bubble_config={"background_color": "#ff0000"})
    )
    assert 'fill="#ff0000"' in html


def test_render_comic_bubble_applies_bubble_config_typography_overrides() -> None:
    html = _render_comic_bubble(
        _make_bubble(
            bubble_config={
                "font_family": "Comic Neue",
                "font_size": 14,
                "font_weight": "bold",
                "text_align": "center",
                "italic": True,
                "text_color": "#0000ff",
            }
        )
    )
    assert "font-family: 'Comic Neue'" in html
    assert "font-size: 14pt" in html
    assert "font-weight: bold" in html
    assert "text-align: center" in html
    assert "font-style: italic" in html
    assert "color: #0000ff" in html


def test_render_comic_bubble_handles_anchor_as_json_string() -> None:
    # Defensive: ORM serializer should decode anchor before passing
    # it in, but the walker should tolerate string anchors.
    html = _render_comic_bubble(_make_bubble(anchor='{"x_pct": 10, "y_pct": 20}'))
    assert "left: 10%" in html
    assert "top: 20%" in html


def test_render_comic_bubble_defaults_when_anchor_is_invalid_json() -> None:
    html = _render_comic_bubble(_make_bubble(anchor="not-json"))
    # Default 50/50 from .get(..., 50).
    assert "left: 50%" in html


# --- Single-panel render ---


def _make_panel(**overrides: Any) -> dict[str, Any]:
    base = {
        "id": "panel-1",
        "page_id": "page-1",
        "position": 1,
        "image_asset_id": None,
        "bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100},
        "panel_config": None,
    }
    base.update(overrides)
    return base


def test_render_comic_panel_no_image_when_image_asset_id_missing() -> None:
    html = _render_comic_panel(_make_panel(image_asset_id=None), [], {})
    assert "<img" not in html


def test_render_comic_panel_renders_image_when_asset_resolved() -> None:
    panel = _make_panel(image_asset_id="asset-42")
    assets_map = {"asset-42": "file:///tmp/img.png"}
    html = _render_comic_panel(panel, [], assets_map)
    assert "<img" in html
    assert "file:///tmp/img.png" in html


def test_render_comic_panel_skips_image_when_asset_id_unresolved() -> None:
    panel = _make_panel(image_asset_id="missing-asset")
    html = _render_comic_panel(panel, [], {})
    assert "<img" not in html


def test_render_comic_panel_nests_bubbles() -> None:
    bubbles = [_make_bubble(id="b1", text_content="One"), _make_bubble(id="b2", text_content="Two")]
    html = _render_comic_panel(_make_panel(), bubbles, {})
    assert "One" in html
    assert "Two" in html
    assert html.count("comic-bubble") == 2


def test_render_comic_panel_default_border_style_solid() -> None:
    html = _render_comic_panel(_make_panel(), [], {})
    assert "border: 1pt solid black" in html


def test_render_comic_panel_config_border_style_override() -> None:
    html = _render_comic_panel(
        _make_panel(panel_config={"border_style": "dashed"}),
        [],
        {},
    )
    assert "border: 1pt dashed black" in html


# --- Page-level render ---


def _make_page(**overrides: Any) -> dict[str, Any]:
    base = {
        "id": "page-1",
        "book_id": "book-1",
        "position": 1,
        "layout": "single_panel",
        "text_content": None,
        "image_asset_id": None,
        "layout_config": {"comic_grid_template": "single_panel"},
    }
    base.update(overrides)
    return base


def test_render_comic_page_uses_grid_template_from_layout_config() -> None:
    page = _make_page(layout_config={"comic_grid_template": "grid_2x2"})
    html = _render_comic_page(page, [], {}, {})
    assert 'data-grid-template="grid_2x2"' in html
    assert "grid-template-columns: repeat(2, 1fr)" in html


def test_render_comic_page_falls_back_to_single_panel_without_config() -> None:
    page = _make_page(layout_config=None)
    html = _render_comic_page(page, [], {}, {})
    assert 'data-grid-template="single_panel"' in html


def test_render_comic_page_renders_panels_in_position_order() -> None:
    page = _make_page()
    panels = [
        _make_panel(id="p1", position=1),
        _make_panel(id="p2", position=2),
    ]
    panel_bubbles_map = {
        "p1": [_make_bubble(id="b1", panel_id="p1", text_content="FirstP")],
        "p2": [_make_bubble(id="b2", panel_id="p2", text_content="SecondP")],
    }
    html = _render_comic_page(page, panels, panel_bubbles_map, {})
    # Both panels' bubbles present.
    assert "FirstP" in html
    assert "SecondP" in html
    # Order respected (p1 panel comes before p2 panel).
    assert html.find("FirstP") < html.find("SecondP")


def test_render_comic_page_handles_layout_config_as_json_string() -> None:
    # Defensive: the page serializer at routes.py:_serialize_page
    # decodes layout_config, but the walker should tolerate strings.
    page = _make_page(layout_config='{"comic_grid_template": "grid_3x3"}')
    html = _render_comic_page(page, [], {}, {})
    assert 'data-grid-template="grid_3x3"' in html


# --- Full HTML doc emit ---


def test_build_comic_html_includes_title() -> None:
    book_data = {"id": "b1", "title": "My Comic", "author": "", "language": "en"}
    html = _build_comic_html(book_data, [], [], [], {})
    assert "<title>My Comic</title>" in html


def test_build_comic_html_carries_author_metadata() -> None:
    book_data = {"id": "b1", "title": "X", "author": "J. Author", "language": "en"}
    html = _build_comic_html(book_data, [], [], [], {})
    assert '<meta name="author" content="J. Author"' in html


def test_build_comic_html_omits_author_meta_when_empty() -> None:
    book_data = {"id": "b1", "title": "X", "author": "", "language": "en"}
    html = _build_comic_html(book_data, [], [], [], {})
    assert '<meta name="author"' not in html


def test_build_comic_html_includes_description_meta_when_set() -> None:
    book_data = {
        "id": "b1",
        "title": "X",
        "author": "",
        "language": "en",
        "description": "A test comic.",
    }
    html = _build_comic_html(book_data, [], [], [], {})
    assert '<meta name="description" content="A test comic."' in html


def test_build_comic_html_generator_meta_basic() -> None:
    book_data = {"id": "b1", "title": "X"}
    html = _build_comic_html(book_data, [], [], [], {})
    assert 'content="Bibliogon comic-book PDF"' in html


def test_build_comic_html_generator_meta_bleed_suffix() -> None:
    book_data = {"id": "b1", "title": "X"}
    html = _build_comic_html(
        book_data, [], [], [], {}, picture_book_bleed_marks=True
    )
    assert 'content="Bibliogon comic-book PDF (bleed)"' in html


def test_build_comic_html_lang_defaults_to_de_when_missing() -> None:
    book_data = {"id": "b1", "title": "X"}
    html = _build_comic_html(book_data, [], [], [], {})
    assert '<html lang="de">' in html


def test_build_comic_html_respects_explicit_language() -> None:
    book_data = {"id": "b1", "title": "X", "language": "ja"}
    html = _build_comic_html(book_data, [], [], [], {})
    assert '<html lang="ja">' in html


def test_build_comic_html_groups_panels_by_page_id() -> None:
    book_data = {"id": "b1", "title": "X"}
    pages = [_make_page(id="page-A"), _make_page(id="page-B", position=2)]
    panels = [
        _make_panel(id="pa", page_id="page-A", position=1),
        _make_panel(id="pb", page_id="page-B", position=1),
    ]
    bubbles = [
        _make_bubble(id="b1", panel_id="pa", text_content="OnA"),
        _make_bubble(id="b2", panel_id="pb", text_content="OnB"),
    ]
    html = _build_comic_html(book_data, pages, panels, bubbles, {})
    assert "OnA" in html
    assert "OnB" in html
    # Each bubble appears inside its own page section in order.
    assert html.find("OnA") < html.find("OnB")


def test_build_comic_html_carries_font_face_block() -> None:
    book_data = {"id": "b1", "title": "X"}
    html = _build_comic_html(book_data, [], [], [], {})
    # The fonts CSS comes from bibliogon_export.picture_book_fonts;
    # we just assert the @font-face emit is present so font
    # embedding cannot regress silently.
    assert "@font-face" in html


def test_build_comic_html_carries_format_css() -> None:
    book_data = {"id": "b1", "title": "X"}
    html = _build_comic_html(book_data, [], [], [], {})
    # _format_css emits the @page rule + CSS variables. Default
    # format is 8.5x8.5 = 21.59cm × 21.59cm or equivalent.
    assert "@page" in html
    assert "--page-w" in html


def test_build_comic_html_bleed_marks_added_when_enabled() -> None:
    book_data = {"id": "b1", "title": "X"}
    html = _build_comic_html(
        book_data, [], [], [], {}, picture_book_bleed_marks=True
    )
    # _format_css emits marks: crop + bleed when enabled.
    assert "marks: crop" in html
    assert "bleed:" in html


# --- _build_assets_map ---


def test_build_assets_map_resolves_existing_file(tmp_path: Path) -> None:
    # Create an asset file in tmp.
    img = tmp_path / "img.png"
    img.write_bytes(b"\x89PNG\r\n")
    assets = [{"id": "asset-1", "path": "img.png"}]
    out = _build_assets_map(assets, tmp_path)
    assert "asset-1" in out
    assert out["asset-1"].startswith("file://")
    assert out["asset-1"].endswith("/img.png")


def test_build_assets_map_skips_missing_file(tmp_path: Path) -> None:
    assets = [{"id": "asset-x", "path": "nonexistent.png"}]
    out = _build_assets_map(assets, tmp_path)
    assert out == {}


def test_build_assets_map_skips_entries_without_id() -> None:
    assets = [{"id": None, "path": "img.png"}]
    out = _build_assets_map(assets, Path("/tmp"))
    assert out == {}


def test_build_assets_map_skips_entries_without_path() -> None:
    assets = [{"id": "a", "path": ""}]
    out = _build_assets_map(assets, Path("/tmp"))
    assert out == {}


# --- End-to-end smoke (requires WeasyPrint) ---


def test_generate_comic_book_pdf_writes_pdf_file(tmp_path: Path) -> None:
    """Smoke: minimal comic book renders to a non-empty PDF.

    Verifies the full chain (HTML build + CSS emit + WeasyPrint)
    runs without raising. Detailed CSS / visual fidelity is covered
    by the string-level tests above; this one just pins the
    integration with WeasyPrint.
    """
    pytest.importorskip("weasyprint")
    book_data = {"id": "b-smoke", "title": "Smoke Comic", "language": "en"}
    pages = [_make_page(id="page-1")]
    panels = [_make_panel(id="panel-1", page_id="page-1")]
    bubbles = [
        _make_bubble(id="b1", panel_id="panel-1", text_content="Hello"),
    ]
    output = tmp_path / "out.pdf"
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    result = generate_comic_book_pdf(
        book_data=book_data,
        pages=pages,
        panels=panels,
        bubbles=bubbles,
        assets=[],
        upload_dir=upload_dir,
        output_path=output,
    )
    assert result == output
    assert output.exists()
    # PDFs start with the magic bytes %PDF.
    assert output.read_bytes()[:4] == b"%PDF"



# --- Single-SVG-path bubble generator (mirror of bubblePath.ts) ---


_BUBBLE_PATH_BASE = dict(
    width=100,
    height=100,
    tail_direction="none",
    tail_position_pct=50,
    tail_length_px=16,
)


class TestThoughtCircleChain:
    """Thought tail = chain of 1-3 shrinking circles (concept doc).
    Mirrors ``frontend/src/components/comics/bubblePath.test.ts``."""

    def test_emits_no_cubic_beziers_for_tail(self) -> None:
        no_tail = _build_bubble_path(shape="thought", **_BUBBLE_PATH_BASE)
        with_tail = _build_bubble_path(
            shape="thought",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=35,
        )
        assert no_tail.count("C ") == 0
        assert with_tail.count("C ") == 0

    def test_count_scales_with_tail_length(self) -> None:
        sub15 = _build_bubble_path(
            shape="thought",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=10,
        )
        mid = _build_bubble_path(
            shape="thought",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=20,
        )
        long = _build_bubble_path(
            shape="thought",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=35,
        )
        # Outline = 4 A commands; each circle adds 2 A commands.
        assert sub15.count("A ") == 4 + 2 * 1
        assert mid.count("A ") == 4 + 2 * 2
        assert long.count("A ") == 4 + 2 * 3

    def test_no_chain_when_direction_none(self) -> None:
        out = _build_bubble_path(
            shape="thought",
            width=100,
            height=100,
            tail_direction="none",
            tail_position_pct=50,
            tail_length_px=40,
        )
        assert out.count("A ") == 4

    def test_direction_drives_chain_offset(self) -> None:
        south = _build_bubble_path(
            shape="thought",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=40,
        )
        north = _build_bubble_path(
            shape="thought",
            width=100,
            height=100,
            tail_direction="N",
            tail_position_pct=50,
            tail_length_px=40,
        )
        # S chain has cy values past y=100; N chain has cy values
        # past y=0 (negative numbers).
        assert any(
            tok and tok.lstrip("-").replace(".", "").isdigit() and float(tok) > 100
            for tok in south.split()
        )
        assert "-" in north

    def test_cross_language_snapshot_pin(self) -> None:
        """Same inputs as the TS test in bubblePath.test.ts. The
        two implementations must produce a byte-identical ``d``
        string. Drift here breaks the pin on at least one side."""
        out = _build_bubble_path(
            shape="thought",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=35,
        )
        expected = (
            "M 30 0 L 70 0 A 30 30 0 0 1 100 30 "
            "L 100 70 A 30 30 0 0 1 70 100 "
            "L 30 100 A 30 30 0 0 1 0 70 "
            "L 0 30 A 30 30 0 0 1 30 0 Z "
            "M 44 108.8 A 6 6 0 1 0 56 108.8 A 6 6 0 1 0 44 108.8 Z "
            "M 46.4 121 A 3.6 3.6 0 1 0 53.6 121 A 3.6 3.6 0 1 0 46.4 121 Z "
            "M 47.8 135 A 2.2 2.2 0 1 0 52.2 135 A 2.2 2.2 0 1 0 47.8 135 Z"
        )
        assert out == expected


class TestShoutSpikeExtension:
    """Shout tail = extended star spike (concept doc). Mirrors
    ``frontend/src/components/comics/bubblePath.test.ts``."""

    def test_no_spike_extension_when_direction_none(self) -> None:
        no_tail = _build_bubble_path(
            shape="shout",
            width=100,
            height=100,
            tail_direction="none",
            tail_position_pct=50,
            tail_length_px=30,
        )
        # Star = 1 M + 19 L + 1 Z, no other commands.
        assert no_tail.count("L ") == 19
        # No vertex extended past y=100 (all stay inside bbox).
        for tok in no_tail.split():
            stripped = tok.lstrip("-").replace(".", "")
            if stripped.isdigit() and "." not in tok and 100 < int(tok) < 200:
                raise AssertionError(
                    f"vertex coord {tok} outside bbox unexpectedly: {no_tail}"
                )

    def test_s_direction_extends_bottom_most_spike(self) -> None:
        with_tail = _build_bubble_path(
            shape="shout",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=20,
        )
        # bottom-most outer vertex [45, 100] pushed to y=120.
        assert "120" in with_tail.split()
        assert with_tail.count("L ") == 19

    def test_n_direction_extends_top_most_spike(self) -> None:
        with_tail = _build_bubble_path(
            shape="shout",
            width=100,
            height=100,
            tail_direction="N",
            tail_position_pct=50,
            tail_length_px=25,
        )
        # Closest outer spike to N at center-x is [40, 0]; pushed
        # to y = -25.
        assert "-25" in with_tail.split()

    def test_e_direction_extends_right_most_spike(self) -> None:
        with_tail = _build_bubble_path(
            shape="shout",
            width=100,
            height=100,
            tail_direction="E",
            tail_position_pct=50,
            tail_length_px=18,
        )
        # Right-edge outer spike pushed to x=118.
        assert "118" in with_tail.split()

    def test_no_separate_cubic_bezier_tail_subpath(self) -> None:
        with_tail = _build_bubble_path(
            shape="shout",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=20,
        )
        # Spike-extension uses the star's existing L commands; no
        # curves and no extra M.
        assert with_tail.count("C ") == 0
        assert with_tail.count("M ") == 1
        assert with_tail.count("Z") == 1

    def test_cross_language_snapshot_pin(self) -> None:
        """Mirrors the TS snapshot pin. Same input → byte-identical
        ``d``."""
        out = _build_bubble_path(
            shape="shout",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=20,
        )
        expected = (
            "M 0 20 L 10 0 L 25 15 L 40 0 L 55 15 L 70 0 "
            "L 85 15 L 100 20 L 90 40 L 100 60 L 85 75 "
            "L 100 90 L 75 100 L 60 85 L 45 120 L 30 85 "
            "L 15 100 L 0 80 L 10 60 L 0 40 Z"
        )
        assert out == expected


class TestNarrationForceNoTail:
    """Narration ignores stored tail_direction (concept doc).
    Mirrors ``frontend/src/components/comics/bubblePath.test.ts``."""

    @pytest.mark.parametrize(
        "direction",
        ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "auto"],
    )
    def test_ignores_each_stored_direction(self, direction: str) -> None:
        ignored = _build_bubble_path(
            shape="narration",
            width=100,
            height=100,
            tail_direction=direction,
            tail_position_pct=50,
            tail_length_px=30,
        )
        no_tail = _build_bubble_path(
            shape="narration",
            width=100,
            height=100,
            tail_direction="none",
            tail_position_pct=50,
            tail_length_px=30,
        )
        assert ignored == no_tail

    def test_emits_no_cubic_beziers_regardless_of_direction(self) -> None:
        out = _build_bubble_path(
            shape="narration",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=30,
        )
        assert out.count("C ") == 0

    def test_cross_language_snapshot_pin(self) -> None:
        """Mirrors the TS snapshot pin. Same input → byte-identical
        ``d``."""
        out = _build_bubble_path(
            shape="narration",
            width=100,
            height=100,
            tail_direction="S",
            tail_position_pct=50,
            tail_length_px=25,
        )
        expected = (
            "M 0 0 L 100 0 A 0 0 0 0 1 100 0 "
            "L 100 100 A 0 0 0 0 1 100 100 "
            "L 0 100 A 0 0 0 0 1 0 100 "
            "L 0 0 A 0 0 0 0 1 0 0 Z"
        )
        assert out == expected


def test_generate_comic_book_pdf_renders_all_6_bubble_types(tmp_path: Path) -> None:
    """Visual verification (F2 close-out, 2026-05-28).

    Generates a comic_book PDF with all 6 bubble types in a 2×3
    grid panel + uses ``pdftoppm`` to rasterise page 1 to PNG +
    asserts the PNG contains non-white pixels. Pins the
    "approach-A SVG paths actually survive the WeasyPrint
    pipeline" contract end-to-end.

    Skipped if either ``weasyprint`` or ``pdftoppm`` is missing
    on the host (the latter is a poppler-utils binary; not in
    Poetry's dependency tree).
    """
    pytest.importorskip("weasyprint")
    import shutil
    import subprocess

    pdftoppm = shutil.which("pdftoppm")
    if not pdftoppm:
        pytest.skip("pdftoppm (poppler-utils) not available on host")

    book_data = {
        "id": "b-6types",
        "title": "All Bubble Types",
        "language": "en",
    }
    pages = [_make_page(id="page-1")]
    panels = [_make_panel(id="panel-1", page_id="page-1")]

    # Six bubbles, one per type, arranged in a 3×2 grid inside
    # the single panel. Each carries text + an outward-pointing
    # tail so the per-type renderer is fully exercised.
    bubble_types = ["speech", "thought", "narration", "shout", "whisper", "sound_effect"]
    bubbles = []
    for i, btype in enumerate(bubble_types):
        col = i % 3
        row = i // 3
        bubbles.append(
            _make_bubble(
                id=f"b-{btype}",
                panel_id="panel-1",
                position=i + 1,
                bubble_type=btype,
                anchor={"x_pct": 20 + col * 30, "y_pct": 25 + row * 45},
                width_pct=22,
                height_pct=22,
                tail_direction="none" if btype == "sound_effect" else "S",
                tail_position_pct=50,
                tail_length_px=20,
                text_content=btype,
            )
        )

    output = tmp_path / "all-types.pdf"
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    generate_comic_book_pdf(
        book_data=book_data,
        pages=pages,
        panels=panels,
        bubbles=bubbles,
        assets=[],
        upload_dir=upload_dir,
        output_path=output,
    )
    assert output.exists()
    assert output.read_bytes()[:4] == b"%PDF"

    # Rasterise page 1 to PNG via pdftoppm + count non-white
    # pixels. PDF byte-size is an unreliable visual-content proxy
    # because WeasyPrint produces efficient vector PDFs (6 small
    # bubbles fit in ~4 KB even when rendered correctly). The
    # actual visual contract is "the rasterised page has the
    # bubble strokes + text in it", which means non-white pixels.
    png_prefix = tmp_path / "page"
    result = subprocess.run(
        [
            pdftoppm,
            "-r",
            "150",
            "-png",
            "-f",
            "1",
            "-l",
            "1",
            str(output),
            str(png_prefix),
        ],
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, (
        f"pdftoppm failed: {result.stderr.decode(errors='replace')}"
    )
    png_file = tmp_path / "page-1.png"
    assert png_file.exists(), f"pdftoppm did not write {png_file}"
    assert png_file.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"

    from PIL import Image

    img = Image.open(png_file).convert("RGB")
    raw = img.tobytes()
    non_white = sum(
        1 for i in range(0, len(raw), 3) if raw[i : i + 3] != b"\xff\xff\xff"
    )
    # An empty-canvas PNG at 150 DPI / A4 has 0 non-white pixels.
    # Six rendered bubbles (outlines + tails + text labels) on
    # the same canvas produce in the tens of thousands. The
    # threshold of 10_000 is a comfortable floor that catches
    # the regression class "WeasyPrint silently failed to render
    # the SVG paths".
    assert non_white > 10_000, (
        f"only {non_white} non-white pixels in the rendered PNG; "
        "WeasyPrint likely failed to render some/all bubble paths"
    )
