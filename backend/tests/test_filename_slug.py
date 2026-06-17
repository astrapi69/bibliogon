"""Tests for the shared ASCII filename-slug helper (#390).

Pins the exact behavior the two consolidated call sites
(``article_export`` + ``book_ai_template``) relied on, so the
consolidation is provably behavior-preserving.
"""

from __future__ import annotations

import pytest

from app.services.filename_slug import ascii_filename_slug


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Hello World", "hello-world"),
        # NFKD folds accents to their base letter (diacritic dropped),
        # NOT ae/oe/ue - that is the git-book serializer's separate variant.
        ("Cafe Deja Vu!", "cafe-deja-vu"),
        ("Uber Bucher", "uber-bucher"),
        ("Über Bücher", "uber-bucher"),
        # Non-word characters are dropped; runs of space/underscore/hyphen
        # collapse to a single hyphen.
        ("A/B:C", "abc"),
        ("a  b__c--d", "a-b-c-d"),
        ("  trim  me  ", "trim-me"),
    ],
)
def test_ascii_filename_slug_cases(text: str, expected: str) -> None:
    assert ascii_filename_slug(text) == expected


def test_fallback_on_empty_and_symbol_only() -> None:
    assert ascii_filename_slug("") == "file"
    assert ascii_filename_slug("!!!") == "file"
    assert ascii_filename_slug("😀") == "file"


def test_fallback_is_configurable() -> None:
    assert ascii_filename_slug("", fallback="article") == "article"
    assert ascii_filename_slug("###", fallback="book") == "book"


def test_matches_the_former_inline_helpers() -> None:
    """Reproduce the exact pipeline the inline ``_slugify`` helpers used,
    so a future change to the shared helper can't silently drift from the
    behavior the two routers shipped with."""
    import re
    import unicodedata

    def _legacy(title: str, fallback: str) -> str:
        folded = unicodedata.normalize("NFKD", title)
        ascii_only = folded.encode("ascii", "ignore").decode("ascii")
        cleaned = re.sub(r"[^\w\s-]", "", ascii_only).strip()
        cleaned = re.sub(r"[\s_-]+", "-", cleaned)
        return cleaned.lower() or fallback

    for title in ["My Book: Part 1", "Über Größe", "  ", "Ω≈ç√", "a-b_c d"]:
        assert ascii_filename_slug(title, fallback="book") == _legacy(title, "book")
        assert ascii_filename_slug(title, fallback="article") == _legacy(title, "article")
