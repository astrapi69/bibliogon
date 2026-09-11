"""Tests for the HTML -> plain-text stripper (#806).

Distinct from html_to_markdown: several plugins (audiobook TTS,
ms-tools metrics, story-bible entity detection, translation source
extraction) want READABLE PROSE with no markup at all - not Markdown
syntax, which a TTS engine or a word-counter would read/count literally.
"""

from bibliogon_export.html_to_markdown import html_to_plain_text


def test_strips_tags_and_keeps_the_text() -> None:
    assert html_to_plain_text("<p>Hello <strong>world</strong>.</p>") == "Hello world."


def test_block_elements_are_separated_by_newlines() -> None:
    result = html_to_plain_text("<h1>Title</h1><p>First.</p><p>Second.</p>")
    assert result == "Title\nFirst.\nSecond."


def test_entities_are_decoded() -> None:
    assert html_to_plain_text("<p>Caf&eacute; &amp; bar</p>") == "Café & bar"


def test_script_and_style_content_is_dropped() -> None:
    result = html_to_plain_text("<p>Visible</p><script>evil()</script><style>.x{}</style>")
    assert result == "Visible"
    assert "evil" not in result


def test_empty_and_whitespace_input_returns_empty_string() -> None:
    assert html_to_plain_text("") == ""
    assert html_to_plain_text("   ") == ""


def test_plain_text_with_no_tags_passes_through() -> None:
    assert html_to_plain_text("Just a sentence.") == "Just a sentence."


def test_consecutive_whitespace_collapses_to_one_space() -> None:
    result = html_to_plain_text("<p>Too   many\n\n  spaces</p>")
    assert result == "Too many spaces"


def test_lists_render_one_item_per_line() -> None:
    result = html_to_plain_text("<ul><li>Eins</li><li>Zwei</li></ul>")
    assert result == "Eins\nZwei"
