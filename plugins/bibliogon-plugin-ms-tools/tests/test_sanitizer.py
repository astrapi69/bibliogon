"""Tests for sanitizer module."""

from bibliogon_ms_tools.sanitizer import (
    fix_dashes,
    fix_ellipsis,
    fix_quotes,
    fix_whitespace,
    sanitize,
)


# --- Quote Fixing ---


def test_fix_quotes_german():
    text = 'Er sagte "Hallo" zu ihr.'
    fixed, count = fix_quotes(text, "de")
    assert "\u201e" in fixed  # opening „
    assert "\u201c" in fixed  # closing "
    assert count == 2


def test_fix_quotes_english():
    text = 'She said "Hello" to him.'
    fixed, count = fix_quotes(text, "en")
    assert "\u201c" in fixed  # opening "
    assert "\u201d" in fixed  # closing "
    assert count == 2


def test_fix_quotes_preserves_apostrophes():
    text = "It's a beautiful day, isn't it?"
    fixed, count = fix_quotes(text, "en")
    # Apostrophes inside words should become right single quote
    assert "\u2019" in fixed
    assert "It" in fixed
    assert "isn" in fixed


def test_fix_quotes_no_quotes():
    text = "No quotes here."
    fixed, count = fix_quotes(text, "de")
    assert fixed == text
    assert count == 0


# --- Whitespace Fixing ---


def test_fix_double_spaces():
    text = "Hello  world   here."
    fixed, count = fix_whitespace(text)
    assert "  " not in fixed
    assert count >= 2


def test_fix_space_before_punctuation():
    text = "Hello , world . How are you ?"
    fixed, count = fix_whitespace(text)
    assert "Hello, world. How are you?" == fixed.strip()


def test_fix_missing_space_after_punctuation():
    text = "Hello.World,here"
    fixed, count = fix_whitespace(text)
    assert "Hello. World, here" == fixed


def test_fix_trailing_whitespace():
    text = "Line one   \nLine two  "
    fixed, count = fix_whitespace(text)
    assert not fixed.endswith(" ")
    lines = fixed.split("\n")
    assert all(line == line.rstrip() for line in lines)


# --- Dash Fixing ---


def test_fix_triple_hyphen_to_em_dash():
    text = "He said---and I quote---nothing."
    fixed, count = fix_dashes(text)
    assert "\u2014" in fixed
    assert count == 2


def test_fix_double_hyphen_to_en_dash():
    text = "Pages 10--20 are missing."
    fixed, count = fix_dashes(text)
    assert "\u2013" in fixed
    assert count == 1


def test_fix_dashes_no_change():
    text = "A single - hyphen is fine."
    fixed, count = fix_dashes(text)
    assert fixed == text
    assert count == 0


# --- Ellipsis Fixing ---


def test_fix_three_dots_to_ellipsis():
    text = "And then... silence."
    fixed, count = fix_ellipsis(text)
    assert "\u2026" in fixed
    assert count == 1


def test_fix_ellipsis_no_change():
    text = "Just one dot. And two dots.."
    fixed, count = fix_ellipsis(text)
    assert count == 0


# --- Full Sanitize ---


def test_sanitize_combines_all_fixes():
    text = 'Er sagte "Hallo"  und dann...'
    result = sanitize(text, language="de")
    assert result["changed"] is True
    assert result["total_fixes"] > 0
    assert "quotes" in result["fixes"]
    assert "whitespace" in result["fixes"]
    assert "ellipsis" in result["fixes"]


def test_sanitize_clean_text():
    text = "Perfekt formatierter Text."
    result = sanitize(text, language="de")
    assert result["total_fixes"] == 0
    assert result["changed"] is False
    assert result["sanitized"] == text


def test_sanitize_selective_fixes():
    text = 'He said "hello"  and then...'
    result = sanitize(text, language="en", fix_quote_marks=False, fix_ellipses=False)
    # Only whitespace and dashes should be fixed
    assert result["fixes"].get("quotes", 0) == 0
    assert result["fixes"].get("ellipsis", 0) == 0


def test_sanitize_returns_original_and_sanitized():
    text = 'Test  "text"'
    result = sanitize(text, language="de")
    assert result["original"] == text
    assert result["sanitized"] != text
    assert "original" in result
    assert "sanitized" in result
