"""Tests for TipTap JSON to Markdown conversion."""

from bibliogon_export.tiptap_to_md import tiptap_to_markdown


class TestTiptapToMarkdown:

    def test_empty_doc(self) -> None:
        assert tiptap_to_markdown({"type": "doc", "content": []}) == ""

    def test_none_input(self) -> None:
        assert tiptap_to_markdown(None) == ""  # type: ignore[arg-type]

    def test_invalid_type(self) -> None:
        assert tiptap_to_markdown({"type": "other"}) == ""

    def test_paragraph(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Hello world"}],
                }
            ],
        }
        assert tiptap_to_markdown(doc) == "Hello world"

    def test_heading(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": "Chapter Title"}],
                }
            ],
        }
        assert tiptap_to_markdown(doc) == "## Chapter Title"

    def test_bold_and_italic(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "bold",
                            "marks": [{"type": "bold"}],
                        },
                        {"type": "text", "text": " and "},
                        {
                            "type": "text",
                            "text": "italic",
                            "marks": [{"type": "italic"}],
                        },
                    ],
                }
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "**bold**" in result
        assert "*italic*" in result

    def test_inline_code(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "code",
                            "marks": [{"type": "code"}],
                        }
                    ],
                }
            ],
        }
        assert tiptap_to_markdown(doc) == "`code`"

    def test_link(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "click here",
                            "marks": [
                                {"type": "link", "attrs": {"href": "https://example.com"}}
                            ],
                        }
                    ],
                }
            ],
        }
        assert tiptap_to_markdown(doc) == "[click here](https://example.com)"

    def test_bullet_list(self) -> None:
        doc = {
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
                                    "content": [{"type": "text", "text": "Item A"}],
                                }
                            ],
                        },
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "Item B"}],
                                }
                            ],
                        },
                    ],
                }
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "- Item A" in result
        assert "- Item B" in result

    def test_ordered_list(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "orderedList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "First"}],
                                }
                            ],
                        },
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "Second"}],
                                }
                            ],
                        },
                    ],
                }
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "1. First" in result
        assert "2. Second" in result

    def test_code_block(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "codeBlock",
                    "attrs": {"language": "python"},
                    "content": [{"type": "text", "text": "print('hello')"}],
                }
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "```python" in result
        assert "print('hello')" in result
        assert result.endswith("```")

    def test_blockquote(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "blockquote",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "A quote"}],
                        }
                    ],
                }
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "> A quote" in result

    def test_horizontal_rule(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Before"}]},
                {"type": "horizontalRule"},
                {"type": "paragraph", "content": [{"type": "text", "text": "After"}]},
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "---" in result

    def test_multiple_paragraphs(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "First paragraph"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "Second paragraph"}]},
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "First paragraph\n\nSecond paragraph" == result

    def test_strikethrough(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "deleted",
                            "marks": [{"type": "strike"}],
                        }
                    ],
                }
            ],
        }
        assert tiptap_to_markdown(doc) == "~~deleted~~"
