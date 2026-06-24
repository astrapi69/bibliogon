"""Tests for the WeasyPrint KDP manuscript PDF page geometry.

The page size + margins are controlled through the ``@page`` CSS that
``build_kdp_page_css`` emits. WeasyPrint's native deps aren't available
in CI, so - exactly like
``plugins/bibliogon-plugin-export/tests/test_picture_book_pdf.py`` - the
page size is asserted on the emitted CSS string rather than by rendering
a real PDF. These pure functions carry no ``app`` or ``bibliogon_export``
import, so the suite runs in the standalone plugin pytest environment.
"""

from __future__ import annotations

import pytest
from bibliogon_kdp.manuscript_pdf import (
    DEFAULT_KDP_MARGIN,
    DEFAULT_KDP_TRIM,
    KDP_MARGINS,
    KDP_TRIM_SIZES,
    build_kdp_page_css,
    resolve_kdp_margin,
    resolve_kdp_trim,
)


@pytest.mark.parametrize(
    ("trim_id", "expected"),
    [
        ("5x8", "size: 5.0in 8.0in"),
        ("5.25x8", "size: 5.25in 8.0in"),
        ("5.5x8.5", "size: 5.5in 8.5in"),
        ("6x9", "size: 6.0in 9.0in"),
        ("7x10", "size: 7.0in 10.0in"),
        ("8.5x11", "size: 8.5in 11.0in"),
    ],
)
def test_page_css_emits_correct_page_size(trim_id: str, expected: str) -> None:
    """Every KDP trim id maps to the matching @page size. Covers the
    task's 'Taschenbuch 6x9 -> Seitengroesse' + 'Hardcover 8.5x11 ->
    Seitengroesse' acceptance tests."""
    css = build_kdp_page_css(trim_id, "normal")
    assert expected in css


def test_paperback_6x9_page_size() -> None:
    """Taschenbuch 6x9 -> @page size 6in 9in."""
    assert "size: 6.0in 9.0in" in build_kdp_page_css("6x9", "normal", True)


def test_hardcover_8point5x11_page_size() -> None:
    """Hardcover 8.5x11 -> @page size 8.5in 11in."""
    assert "size: 8.5in 11.0in" in build_kdp_page_css("8.5x11", "wide", True)


@pytest.mark.parametrize("missing", [None, "", "  ", "nonsense", "a4", 6])
def test_resolve_kdp_trim_falls_back_to_6x9(missing: object) -> None:
    """Missing / unknown trim -> default 6x9. Covers the task's
    'Fehlende Format-Wahl -> Default (6x9)' acceptance test."""
    canonical, width, height = resolve_kdp_trim(missing)  # type: ignore[arg-type]
    assert canonical == DEFAULT_KDP_TRIM == "6x9"
    assert (width, height) == (6.0, 9.0)


def test_build_page_css_defaults_to_6x9_on_missing_trim() -> None:
    """A missing trim id still produces a valid 6x9 page."""
    assert "size: 6.0in 9.0in" in build_kdp_page_css(None, None)


@pytest.mark.parametrize(
    ("margin_id", "expected_in"),
    [
        ("narrow", "margin: 0.5in"),
        ("normal", "margin: 0.75in"),
        ("wide", "margin: 1.0in"),
    ],
)
def test_page_css_emits_margin_preset(margin_id: str, expected_in: str) -> None:
    assert expected_in in build_kdp_page_css("6x9", margin_id)


@pytest.mark.parametrize("missing", [None, "", "huge", 1])
def test_resolve_kdp_margin_falls_back_to_default(missing: object) -> None:
    assert resolve_kdp_margin(missing) == KDP_MARGINS[DEFAULT_KDP_MARGIN]  # type: ignore[arg-type]


def test_bleed_marks_emitted_for_print() -> None:
    """Paperback / hardcover get crop + bleed marks."""
    css = build_kdp_page_css("6x9", "normal", bleed_marks=True)
    assert "bleed: 3.0mm" in css
    assert "marks: crop" in css


def test_no_bleed_marks_without_flag() -> None:
    """The bleed / marks rules are absent when not requested."""
    css = build_kdp_page_css("6x9", "normal", bleed_marks=False)
    assert "bleed" not in css
    assert "marks" not in css


def test_trim_and_margin_tables_cover_the_wizard_selections() -> None:
    """Regression pin: the trim + margin tables stay in sync with the
    wizard's FormatStep selectable values."""
    assert set(KDP_TRIM_SIZES) == {
        "5x8",
        "5.25x8",
        "5.5x8.5",
        "6x9",
        "7x10",
        "8.5x11",
    }
    assert set(KDP_MARGINS) == {"narrow", "normal", "wide"}
