"""Regression tests for custom stylesheet discovery during project import.

write-book-template projects do not agree on a single filename for the
book's custom CSS. Real-world shipments carry it as ``config/styles.css``
(the original hardcode), ``config/style.css`` (without the 's'),
``config/custom.css``, or under ``assets/css/``. This test pins the
accepted set.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.backup.project_import import _read_custom_css


@pytest.fixture
def project(tmp_path: Path) -> Path:
    (tmp_path / "config").mkdir()
    return tmp_path


def test_config_styles_css_is_read(project: Path) -> None:
    (project / "config" / "styles.css").write_text(".book{color:red}", encoding="utf-8")
    assert _read_custom_css(project / "config", project) == ".book{color:red}"


def test_config_style_css_without_s_is_read(project: Path) -> None:
    (project / "config" / "style.css").write_text(".x{margin:0}", encoding="utf-8")
    assert _read_custom_css(project / "config", project) == ".x{margin:0}"


def test_config_custom_css_is_read(project: Path) -> None:
    (project / "config" / "custom.css").write_text(".y{}", encoding="utf-8")
    assert _read_custom_css(project / "config", project) == ".y{}"


def test_assets_css_stylesheet_is_read(project: Path) -> None:
    (project / "assets" / "css").mkdir(parents=True)
    (project / "assets" / "css" / "style.css").write_text(".z{}", encoding="utf-8")
    assert _read_custom_css(project / "config", project) == ".z{}"


def test_root_style_css_is_read(project: Path) -> None:
    (project / "style.css").write_text(".w{}", encoding="utf-8")
    assert _read_custom_css(project / "config", project) == ".w{}"


def test_missing_all_variants_returns_none(project: Path) -> None:
    assert _read_custom_css(project / "config", project) is None


def test_config_styles_wins_over_root(project: Path) -> None:
    """If both locations have a stylesheet, the config/ variant wins
    because write-book-template's conventions put the authoritative
    CSS there."""
    (project / "config" / "styles.css").write_text("/* config */", encoding="utf-8")
    (project / "style.css").write_text("/* root */", encoding="utf-8")
    assert _read_custom_css(project / "config", project) == "/* config */"


def test_rglob_fallback_finds_nested_css(project: Path) -> None:
    """Real ZIPs sometimes nest the stylesheet at a non-standard
    location (e.g. ``book/print/custom.css``). Rather than leaving
    the field empty, the fallback picks the first CSS it finds
    anywhere in the project tree."""
    (project / "print").mkdir()
    (project / "print" / "theme.css").write_text("/* nested */", encoding="utf-8")
    assert _read_custom_css(project / "config", project) == "/* nested */"


def test_rglob_fallback_skips_node_modules(project: Path) -> None:
    """Noise directories must be filtered out of the fallback scan."""
    (project / "node_modules" / "pkg").mkdir(parents=True)
    (project / "node_modules" / "pkg" / "style.css").write_text("/* noise */", encoding="utf-8")
    (project / "print").mkdir()
    (project / "print" / "theme.css").write_text("/* real */", encoding="utf-8")
    assert _read_custom_css(project / "config", project) == "/* real */"
