"""Walker tests against the 4 real Medium-export fixtures.

These fixtures were extracted from a 209-post production export.
They cover the structural variety the audit identified:

  01_oldest_tech.html        - 2020 short technical post (English,
                                code blocks, images, simple links)
  02_german_philosophical.html - 2026 German long-form post
                                (blockquote, no code, images,
                                inline links)
  03_english_recent_with_code.html - 2026 English post (multiple
                                code blocks, inline code spans,
                                multiple headings)
  04_german_long_with_multi_inner.html - 2026 German long-form post
                                whose section--first contains three
                                ``section-inner`` divs (title, image
                                lane, main body). Triggers the
                                truncation bug fixed in walker.py
                                _walk_body. Source: 3567 words; pre-
                                fix output was 170 words (5%).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from bibliogon_medium_import.walker import MediumWalker, ParsedPost

FIXTURES = Path(__file__).parent / "fixtures"


def _parse(name: str) -> ParsedPost:
    html = (FIXTURES / name).read_text(encoding="utf-8")
    return MediumWalker().parse(html)


# ---------------------------------------------------------------------------
# Sample 01: 2020 oldest tech post (Maven -> Gradle)
# ---------------------------------------------------------------------------


def test_01_extracts_metadata() -> None:
    post = _parse("01_oldest_tech.html")
    assert post.title == "Migrate a maven project to Gradle"
    assert post.subtitle.startswith("I ")
    assert post.canonical_url.startswith("https://medium.com/@asterios-raptis/")
    assert post.canonical_url.endswith("2f276c4a070e")
    assert post.published_at == "2020-02-04T15:46:58.820Z"
    assert post.author == "Asterios Raptis"


def test_01_doc_has_paragraphs_and_code_blocks() -> None:
    post = _parse("01_oldest_tech.html")
    types = [n["type"] for n in post.content_doc["content"]]
    assert "paragraph" in types
    assert "codeBlock" in types
    # graf--title (duplicate H1 in body) must be skipped
    headings = [n for n in post.content_doc["content"] if n["type"] == "heading"]
    assert len(headings) == 0


def test_01_first_node_is_paragraph_not_duplicate_title() -> None:
    """Medium duplicates the page <h1> as the first H3 in the body.
    The walker must skip exactly one occurrence."""
    post = _parse("01_oldest_tech.html")
    first = post.content_doc["content"][0]
    assert first["type"] != "heading"


def test_01_code_block_carries_language() -> None:
    post = _parse("01_oldest_tech.html")
    code_blocks = [n for n in post.content_doc["content"] if n["type"] == "codeBlock"]
    assert len(code_blocks) >= 2  # gradle init, gradle build, BUILD SUCCESSFUL
    assert code_blocks[0]["attrs"]["language"] == "bash"
    assert code_blocks[0]["content"][0]["text"] == "gradle init"


def test_01_captures_images() -> None:
    post = _parse("01_oldest_tech.html")
    assert len(post.images) >= 1
    img = post.images[0]
    assert img.src.startswith("https://cdn-images-1.medium.com/")
    # Captions are preserved
    assert any(i.caption for i in post.images)


def test_01_image_node_has_src_and_caption() -> None:
    post = _parse("01_oldest_tech.html")
    images = [n for n in post.content_doc["content"] if n["type"] == "imageFigure"]
    assert images
    first_img = images[0]
    assert first_img["attrs"]["src"].startswith("https://cdn-images-1.medium.com/")
    assert "title" in first_img["attrs"]  # caption -> title


def test_image_node_type_is_imageFigure_not_image() -> None:
    """Pin the imageFigure node-type contract.

    Bibliogon's editor uses @pentestpad/tiptap-extension-figure which
    registers node name ``imageFigure``; no @tiptap/extension-image is
    loaded. Emitting a plain ``image`` node would fail the schema and
    leave the editor empty for every imported article. This test fails
    loudly if the walker ever regresses to ``image``.
    """
    post = _parse("01_oldest_tech.html")
    found_image_figure = False
    for node in post.content_doc["content"]:
        if node["type"] == "image":
            raise AssertionError(
                "Walker emitted a plain 'image' node; Bibliogon's editor "
                "schema only knows 'imageFigure'. Imports will render empty."
            )
        if node["type"] == "imageFigure":
            found_image_figure = True
    assert found_image_figure, "Test fixture should contain at least one image"


def test_01_links_become_link_marks() -> None:
    post = _parse("01_oldest_tech.html")
    # Find a paragraph with a link mark
    found_link = False
    for node in post.content_doc["content"]:
        if node["type"] != "paragraph":
            continue
        for inline in node.get("content", []):
            for mark in inline.get("marks", []) or []:
                if mark["type"] == "link":
                    assert "href" in mark["attrs"]
                    assert mark["attrs"]["href"].startswith("http")
                    found_link = True
    assert found_link


def test_01_no_warnings_on_clean_post() -> None:
    post = _parse("01_oldest_tech.html")
    assert post.warnings == []


# ---------------------------------------------------------------------------
# Sample 02: German philosophical (blockquotes)
# ---------------------------------------------------------------------------


def test_02_german_metadata_preserved() -> None:
    post = _parse("02_german_philosophical.html")
    assert "Logos" in post.title
    assert "Demokratie" in post.title
    # Real umlauts must survive (mixed-encoding regression test)
    assert post.subtitle  # non-empty


def test_02_blockquote_is_emitted_as_blockquote_node() -> None:
    post = _parse("02_german_philosophical.html")
    blockquotes = [n for n in post.content_doc["content"] if n["type"] == "blockquote"]
    assert blockquotes, "expected at least one blockquote node"
    bq = blockquotes[0]
    # blockquote -> [paragraph -> inline content]
    assert bq["content"][0]["type"] == "paragraph"


def test_02_blockquote_preserves_inline_link() -> None:
    """The Friend Link in the leading blockquote must keep its href."""
    post = _parse("02_german_philosophical.html")
    blockquotes = [n for n in post.content_doc["content"] if n["type"] == "blockquote"]
    assert blockquotes
    inline = blockquotes[0]["content"][0]["content"]
    found_link = False
    for item in inline:
        for mark in item.get("marks", []) or []:
            if mark["type"] == "link":
                assert "asterios-raptis.medium.com" in mark["attrs"]["href"]
                found_link = True
    assert found_link


def test_02_no_codeblocks() -> None:
    post = _parse("02_german_philosophical.html")
    code = [n for n in post.content_doc["content"] if n["type"] == "codeBlock"]
    assert code == []


# ---------------------------------------------------------------------------
# Sample 03: English recent with code (Bibliogon v0.30.0 article)
# ---------------------------------------------------------------------------


def test_03_multiple_headings_at_level_2() -> None:
    """graf--h3 -> TipTap heading level=2 (Medium maps user H2 there)."""
    post = _parse("03_english_recent_with_code.html")
    headings = [n for n in post.content_doc["content"] if n["type"] == "heading"]
    assert len(headings) >= 2
    for h in headings:
        assert h["attrs"]["level"] == 2


def test_03_inline_code_span_yields_code_mark() -> None:
    post = _parse("03_english_recent_with_code.html")
    found_code = False
    for node in post.content_doc["content"]:
        if node["type"] != "paragraph":
            continue
        for inline in node.get("content", []):
            for mark in inline.get("marks", []) or []:
                if mark["type"] == "code":
                    found_code = True
                    break
    assert found_code, "expected at least one inline code mark"


def test_03_code_block_languages_preserved() -> None:
    post = _parse("03_english_recent_with_code.html")
    blocks = [n for n in post.content_doc["content"] if n["type"] == "codeBlock"]
    assert blocks
    # Mix of bash, yaml, python in this post; at least one has a
    # non-null language
    assert any(b["attrs"].get("language") for b in blocks)


def test_03_strong_mark_emitted() -> None:
    post = _parse("03_english_recent_with_code.html")
    found_bold = False
    for node in post.content_doc["content"]:
        if node["type"] != "paragraph":
            continue
        for inline in node.get("content", []):
            for mark in inline.get("marks", []) or []:
                if mark["type"] == "bold":
                    found_bold = True
    assert found_bold


# ---------------------------------------------------------------------------
# Synthetic edge cases
# ---------------------------------------------------------------------------


_HEADER_TEMPLATE = """
<!DOCTYPE html>
<html><head><title>T</title></head><body>
<article class="h-entry">
  <header><h1 class="p-name">Test</h1></header>
  <section data-field="subtitle" class="p-summary">Sub</section>
  <section data-field="body" class="e-content">
    <section name="x" class="section section--body section--first section--last">
      <div class="section-content">
        <div class="section-inner sectionLayout--insetColumn">
          {body}
        </div>
      </div>
    </section>
  </section>
  <footer>
    <p>By <a class="p-author h-card">Tester</a> on
       <a><time class="dt-published" datetime="2024-01-01T00:00:00Z"></time></a>
    </p>
    <p><a class="p-canonical" href="https://medium.com/p/abc">Canonical</a></p>
  </footer>
</article>
</body></html>
"""


def _wrap(body: str) -> str:
    return _HEADER_TEMPLATE.replace("{body}", body)


def test_nested_marks_bold_inside_italic() -> None:
    html = _wrap(
        '<p class="graf graf--p">'
        '<em class="markup--em"><strong class="markup--strong">both</strong></em>'
        "</p>"
    )
    post = MediumWalker().parse(html)
    p = post.content_doc["content"][0]
    text_node = p["content"][0]
    mark_types = sorted(m["type"] for m in text_node["marks"])
    assert mark_types == ["bold", "italic"]


def test_unordered_list_with_bold_item() -> None:
    html = _wrap(
        '<ul class="postList">'
        '<li class="graf graf--li">'
        'Plain and <strong class="markup--strong">bold</strong>'
        "</li>"
        "</ul>"
    )
    post = MediumWalker().parse(html)
    lst = post.content_doc["content"][0]
    assert lst["type"] == "bulletList"
    assert lst["content"][0]["type"] == "listItem"
    inline = lst["content"][0]["content"][0]["content"]
    # Plain "Plain and " then "bold" with bold mark
    assert any(
        i.get("text") == "bold" and any(m["type"] == "bold" for m in i.get("marks", []))
        for i in inline
    )


def test_unknown_block_warns_and_preserves_text() -> None:
    html = _wrap('<aside class="custom-medium-embed">Embedded text content</aside>')
    walker = MediumWalker()
    post = walker.parse(html)
    assert any("aside" in w for w in post.warnings)
    p = post.content_doc["content"][0]
    assert p["type"] == "paragraph"
    assert "Embedded text content" in p["content"][0]["text"]


def test_empty_body_produces_empty_doc() -> None:
    html = _wrap("")
    post = MediumWalker().parse(html)
    assert post.content_doc == {"type": "doc", "content": []}


def test_first_graf_title_is_skipped_only_once() -> None:
    """If a post had multiple H3s with graf--title for some reason,
    only the first is silently dropped."""
    html = _wrap(
        '<h3 class="graf graf--h3 graf--title">Dup title</h3>'
        '<h3 class="graf graf--h3 graf--title">Second occurrence</h3>'
    )
    post = MediumWalker().parse(html)
    nodes = post.content_doc["content"]
    assert len(nodes) == 1
    assert nodes[0]["type"] == "heading"
    assert nodes[0]["content"][0]["text"] == "Second occurrence"


def test_hard_break_emitted_for_br() -> None:
    html = _wrap('<p class="graf graf--p">Line 1<br>Line 2</p>')
    post = MediumWalker().parse(html)
    inline = post.content_doc["content"][0]["content"]
    types = [n["type"] for n in inline]
    assert "hardBreak" in types


@pytest.mark.parametrize(
    "fixture",
    [
        "01_oldest_tech.html",
        "02_german_philosophical.html",
        "03_english_recent_with_code.html",
        "04_german_long_with_multi_inner.html",
    ],
)
def test_all_fixtures_produce_valid_doc_shape(fixture: str) -> None:
    """Every fixture must produce a non-empty doc with title, canonical
    URL, and at least one block-level node. This is the smoke-test
    assertion that no pathological fixture breaks the walker."""
    post = _parse(fixture)
    assert post.title
    assert post.canonical_url
    assert post.content_doc["type"] == "doc"
    assert post.content_doc["content"], f"{fixture} produced empty doc"


def test_04_multi_inner_layout_captures_full_body() -> None:
    """Regression pin for the section-inner truncation bug.

    Fixture 04 uses Medium's standard header-image layout: the first
    ``<section class="section--body section--first">`` contains three
    ``section-inner`` divs — title, image lane, main body. The pre-
    fix walker called ``section.find("div", class_="section-inner")``
    which returned only the first inner; the title-skip then dropped
    that one too, and the main-body inner was never processed. The
    article imported with 5% of its content (170 words out of 3567).

    The fix iterates over every ``section-inner`` per section. This
    test fails loudly with an actionable word-count comparison if the
    walker ever regresses.
    """
    post = _parse("04_german_long_with_multi_inner.html")
    bits: list[str] = []

    def _walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "text":
                bits.append(str(node.get("text", "")))
            for child in node.get("content", []) or []:
                _walk(child)

    _walk(post.content_doc)
    word_count = len(" ".join(bits).split())
    # Source body has ~3567 words. Allow a small loss for whitespace
    # collapsing and skipped boilerplate, but anything below ~3400
    # means the section-inner fix regressed.
    assert word_count >= 3400, (
        f"Expected ~3567 words from the multi-inner fixture; got "
        f"{word_count}. The walker's section-inner iteration regressed; "
        f"see test docstring."
    )
