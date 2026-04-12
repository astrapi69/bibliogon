"""Tests for HTML -> Markdown conversion (export pipeline).

Covers the full element set handled by html_to_markdown:
  - Headings (h1-h6)
  - Paragraphs and inline formatting (bold, italic, code)
  - Links
  - Lists (flat and nested, correct indentation)
  - Images (standalone and inside <figure>/<figcaption>)
  - Blockquotes
  - Horizontal rules
  - Line breaks
  - Triple-newline collapsing
"""

from bibliogon_export.html_to_markdown import html_to_markdown


class TestHeadings:

    def test_h1(self) -> None:
        assert html_to_markdown("<h1>Title</h1>") == "# Title"

    def test_h2(self) -> None:
        assert html_to_markdown("<h2>Section</h2>") == "## Section"

    def test_h3(self) -> None:
        assert html_to_markdown("<h3>Subsection</h3>") == "### Subsection"

    def test_h6(self) -> None:
        assert html_to_markdown("<h6>Deep</h6>") == "###### Deep"


class TestParagraphs:

    def test_simple_paragraph(self) -> None:
        assert html_to_markdown("<p>Hello world</p>") == "Hello world"

    def test_two_paragraphs(self) -> None:
        result = html_to_markdown("<p>First</p><p>Second</p>")
        assert "First" in result
        assert "Second" in result
        # Paragraphs separated by newlines
        assert result.count("\n") >= 1


class TestInlineFormatting:

    def test_bold(self) -> None:
        result = html_to_markdown("<p><strong>bold</strong></p>")
        assert "**bold**" in result

    def test_italic(self) -> None:
        result = html_to_markdown("<p><em>italic</em></p>")
        assert "*italic*" in result

    def test_inline_code(self) -> None:
        result = html_to_markdown("<p><code>code</code></p>")
        assert "`code`" in result

    def test_mixed_inline(self) -> None:
        result = html_to_markdown("<p>Normal <strong>bold</strong> and <em>italic</em></p>")
        assert "**bold**" in result
        assert "*italic*" in result
        assert "Normal" in result


class TestLinks:

    def test_link(self) -> None:
        result = html_to_markdown('<p><a href="https://example.com">Click here</a></p>')
        assert "[Click here](https://example.com)" in result

    def test_link_without_href(self) -> None:
        result = html_to_markdown("<p><a>No href</a></p>")
        assert "[No href]()" in result


class TestLists:

    def test_flat_list(self) -> None:
        html = "<ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>"
        result = html_to_markdown(html)
        assert "- Alpha" in result
        assert "- Beta" in result
        assert "- Gamma" in result

    def test_nested_list(self) -> None:
        html = (
            "<ul>"
            "  <li>Parent"
            "    <ul>"
            "      <li>Child</li>"
            "    </ul>"
            "  </li>"
            "</ul>"
        )
        result = html_to_markdown(html)
        lines = [line for line in result.split("\n") if line.strip()]
        # Parent at depth 0, child at depth 1 (2-space indent)
        parent_line = next(line for line in lines if "Parent" in line)
        child_line = next(line for line in lines if "Child" in line)
        assert parent_line.startswith("- ")
        assert child_line.startswith("  - ")

    def test_deeply_nested_list(self) -> None:
        html = (
            "<ul><li>L1"
            "<ul><li>L2"
            "<ul><li>L3</li></ul>"
            "</li></ul>"
            "</li></ul>"
        )
        result = html_to_markdown(html)
        lines = [line for line in result.split("\n") if line.strip()]
        l3_line = next(line for line in lines if "L3" in line)
        assert l3_line.startswith("    - ")  # 4-space indent for depth 3


class TestImages:

    def test_standalone_image(self) -> None:
        html = '<img src="assets/figures/photo.png" alt="A photo" />'
        result = html_to_markdown(html)
        assert "<figure>" in result
        assert 'src="assets/figures/photo.png"' in result
        assert 'alt="A photo"' in result

    def test_image_without_alt(self) -> None:
        html = '<img src="image.jpg" />'
        result = html_to_markdown(html)
        assert 'src="image.jpg"' in result
        assert 'alt=""' in result


class TestFigures:

    def test_figure_with_caption(self) -> None:
        html = (
            "<figure>"
            '<img src="fig.png" alt="Figure 1" />'
            "<figcaption>Caption text</figcaption>"
            "</figure>"
        )
        result = html_to_markdown(html)
        assert "<figure>" in result
        assert 'src="fig.png"' in result
        assert "<figcaption>" in result
        assert "Caption text" in result

    def test_figure_without_caption(self) -> None:
        html = '<figure><img src="fig.png" alt="Fig" /></figure>'
        result = html_to_markdown(html)
        assert "<figure>" in result
        assert 'src="fig.png"' in result


class TestBlockquotes:

    def test_blockquote(self) -> None:
        html = "<blockquote><p>Quoted text</p></blockquote>"
        result = html_to_markdown(html)
        assert "> Quoted text" in result


class TestHorizontalRule:

    def test_hr(self) -> None:
        result = html_to_markdown("<p>Before</p><hr/><p>After</p>")
        assert "***" in result
        assert "Before" in result
        assert "After" in result


class TestLineBreak:

    def test_br(self) -> None:
        result = html_to_markdown("<p>Line one<br/>Line two</p>")
        assert "Line one" in result
        assert "Line two" in result


class TestEdgeCases:

    def test_empty_string(self) -> None:
        assert html_to_markdown("") == ""

    def test_plain_text(self) -> None:
        assert html_to_markdown("Just plain text") == "Just plain text"

    def test_triple_newlines_collapsed(self) -> None:
        """Multiple blank lines are collapsed to double newlines."""
        html = "<p>A</p><p></p><p></p><p>B</p>"
        result = html_to_markdown(html)
        assert "\n\n\n" not in result

    def test_whitespace_only(self) -> None:
        assert html_to_markdown("   \n\n  ") == ""
