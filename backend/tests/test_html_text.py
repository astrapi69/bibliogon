"""Tests for the HTML -> plain-text stripper (#806).

Distinct from html_to_markdown: several plugins (audiobook TTS,
ms-tools metrics, story-bible entity detection, translation source
extraction) want READABLE PROSE with no markup at all - not Markdown
syntax, which a TTS engine or a word-counter would read/count literally.
"""

import json

from app.services.html_text import content_to_plain_text, html_to_plain_text


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


class TestContentToPlainText:
    """``content_to_plain_text`` handles all four shapes a chapter body
    actually arrives in (#835). Promoted here from
    ``bibliogon_audiobook.generator.extract_plain_text`` so ms-tools no
    longer has to cross-import another plugin's package to get it.
    """

    def test_html_is_stripped_to_prose(self) -> None:
        result = content_to_plain_text("<p>Ein Buch <strong>über</strong> Bewusstsein.</p>")
        assert result == "Ein Buch über Bewusstsein."

    def test_tiptap_json_string_is_walked(self) -> None:
        doc = json.dumps(
            {
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "Aus JSON."}]}
                ],
            }
        )
        assert content_to_plain_text(doc) == "Aus JSON."

    def test_already_parsed_tiptap_dict_is_walked(self) -> None:
        doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Aus dict."}]}],
        }
        assert content_to_plain_text(doc) == "Aus dict."

    def test_multiple_blocks_are_newline_separated(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {"type": "heading", "content": [{"type": "text", "text": "Titel"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "Absatz."}]},
            ],
        }
        assert content_to_plain_text(doc) == "Titel\n\nAbsatz."

    def test_legacy_plain_text_passes_through(self) -> None:
        assert content_to_plain_text("Nur Text, kein Markup.") == "Nur Text, kein Markup."

    def test_empty_shapes_yield_empty_string(self) -> None:
        assert content_to_plain_text("") == ""
        assert content_to_plain_text("   ") == ""
        assert content_to_plain_text(None) == ""
        assert content_to_plain_text(123) == ""

    def test_json_that_is_not_a_tiptap_doc_yields_empty_string(self) -> None:
        assert content_to_plain_text("[1, 2, 3]") == ""
