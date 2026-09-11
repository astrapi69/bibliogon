"""Regression tests for the translation plugin's content extraction (#806).

Chapter.content is HTML until someone opens and saves it (#787).
extract_plain_text_from_tiptap fed that raw HTML - tags included -
straight to the translation provider as "plain text", degrading
translation quality and risking mangled markup on the way back.
"""

from __future__ import annotations

from bibliogon_translation.book_translator import (
    extract_plain_text_from_tiptap,
    rebuild_tiptap_with_translation,
)


class TestExtractPlainTextFromTiptap:
    def test_html_content_is_stripped_before_translation(self) -> None:
        result = extract_plain_text_from_tiptap("<p>Ein ganzer <strong>Satz</strong>.</p>")
        assert result == "Ein ganzer Satz."
        assert "<" not in result

    def test_tiptap_json_still_extracts_text_nodes(self) -> None:
        import json

        doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Aus JSON."}]}],
        }
        assert extract_plain_text_from_tiptap(json.dumps(doc)).strip() == "Aus JSON."

    def test_genuine_plain_text_passes_through_unchanged(self) -> None:
        assert extract_plain_text_from_tiptap("Nur Text.") == "Nur Text."

    def test_empty_and_whitespace_return_empty_string(self) -> None:
        assert extract_plain_text_from_tiptap("") == ""
        assert extract_plain_text_from_tiptap("   ") == ""


class TestRebuildTiptapWithTranslation:
    def test_html_original_falls_back_to_the_translated_text_verbatim(self) -> None:
        """Formatting cannot be preserved once the source was flattened
        to plain text for translation - the fallback is documented
        content loss (marks), not corruption (raw markup)."""
        result = rebuild_tiptap_with_translation("<p>Original</p>", "Uebersetzt")
        assert result == "Uebersetzt"

    def test_tiptap_json_original_still_preserves_structure(self) -> None:
        import json

        original = json.dumps(
            {
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "Original."}]}
                ],
            }
        )
        rebuilt = json.loads(rebuild_tiptap_with_translation(original, "Uebersetzt."))
        assert rebuilt["content"][0]["content"][0]["text"] == "Uebersetzt."
