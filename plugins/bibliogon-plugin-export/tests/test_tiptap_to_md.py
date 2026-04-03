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

    def test_task_list(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "taskList",
                    "content": [
                        {"type": "taskItem", "attrs": {"checked": True},
                         "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Done"}]}]},
                        {"type": "taskItem", "attrs": {"checked": False},
                         "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Todo"}]}]},
                    ],
                }
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "- [x] Done" in result
        assert "- [ ] Todo" in result

    def test_table(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "table",
                    "content": [
                        {"type": "tableRow", "content": [
                            {"type": "tableHeader", "content": [
                                {"type": "paragraph", "content": [{"type": "text", "text": "Name"}]}]},
                            {"type": "tableHeader", "content": [
                                {"type": "paragraph", "content": [{"type": "text", "text": "Value"}]}]},
                        ]},
                        {"type": "tableRow", "content": [
                            {"type": "tableCell", "content": [
                                {"type": "paragraph", "content": [{"type": "text", "text": "A"}]}]},
                            {"type": "tableCell", "content": [
                                {"type": "paragraph", "content": [{"type": "text", "text": "1"}]}]},
                        ]},
                    ],
                }
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "| Name | Value |" in result
        assert "| --- | --- |" in result
        assert "| A | 1 |" in result

    def test_underline(self) -> None:
        doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "underlined", "marks": [{"type": "underline"}]},
            ]}],
        }
        assert tiptap_to_markdown(doc) == "<u>underlined</u>"

    def test_subscript(self) -> None:
        doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "H"},
                {"type": "text", "text": "2", "marks": [{"type": "subscript"}]},
                {"type": "text", "text": "O"},
            ]}],
        }
        assert tiptap_to_markdown(doc) == "H<sub>2</sub>O"

    def test_superscript(self) -> None:
        doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "E=mc"},
                {"type": "text", "text": "2", "marks": [{"type": "superscript"}]},
            ]}],
        }
        assert tiptap_to_markdown(doc) == "E=mc<sup>2</sup>"

    def test_highlight(self) -> None:
        doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "important", "marks": [{"type": "highlight"}]},
            ]}],
        }
        assert tiptap_to_markdown(doc) == "<mark>important</mark>"

    def test_image_figure(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {"type": "imageFigure", "attrs": {"src": "img.png", "alt": "Photo"},
                 "content": [{"type": "text", "text": "A caption"}]},
            ],
        }
        result = tiptap_to_markdown(doc)
        assert "![Photo](img.png)" in result
        assert "*A caption*" in result
