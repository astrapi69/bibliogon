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


# ---------------------------------------------------------------------------
# Language detection (langdetect-backed)
# ---------------------------------------------------------------------------


def test_language_detected_as_english_for_english_fixture() -> None:
    """01_oldest_tech.html is an English technical post; the
    detector should return ``en`` with high confidence."""
    post = _parse("01_oldest_tech.html")
    assert post.detected_language == "en"


def test_language_detected_as_german_for_german_fixture() -> None:
    """02_german_philosophical.html is in German; detector should
    return ``de``."""
    post = _parse("02_german_philosophical.html")
    assert post.detected_language == "de"


def test_language_detected_as_german_for_multi_inner_fixture() -> None:
    """04 was the truncated production article. Its full body (after
    the section-inner fix recovers it) is in German."""
    post = _parse("04_german_long_with_multi_inner.html")
    assert post.detected_language == "de"


def test_language_returns_none_for_empty_body() -> None:
    """Empty content_doc -> None, importer uses default_language."""
    from bibliogon_medium_import.walker import MediumWalker

    walker = MediumWalker()
    result = walker._detect_language({"type": "doc", "content": []})
    assert result is None


def test_language_returns_none_for_too_short_body() -> None:
    """<50 chars of text is too noisy even with the seed pinned;
    the detector returns None and the importer falls back."""
    from bibliogon_medium_import.walker import MediumWalker

    walker = MediumWalker()
    short_doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Hi there."}],
            }
        ],
    }
    assert walker._detect_language(short_doc) is None


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


# ---------------------------------------------------------------------------
# MEDIUM-COMMENTS-IMPORT-01 commit 2: comment-detection heuristic
# ---------------------------------------------------------------------------


from bibliogon_medium_import.walker import _classify_as_comment  # noqa: E402


def _doc(*paragraphs: str) -> dict:
    """Build a TipTap doc with the given plain-text paragraphs."""
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": p}],
            }
            for p in paragraphs
        ],
    }


def test_classifier_short_plain_text_is_comment() -> None:
    """A 50-char single-paragraph doc is the canonical comment
    shape."""
    doc = _doc("Thanks for the writeup!")
    assert _classify_as_comment(doc) is True


def test_classifier_long_plain_text_is_article() -> None:
    """Same shape as the comment case but >= 500 chars body
    becomes an article."""
    long_para = "x " * 300  # 600 chars
    doc = _doc(long_para)
    assert _classify_as_comment(doc) is False


def test_classifier_heading_disqualifies_short_post() -> None:
    """A heading is a structural element. Even a 30-char body
    with a single h2 is an article."""
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "Section"}],
            },
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Short body"}],
            },
        ],
    }
    assert _classify_as_comment(doc) is False


def test_classifier_codeblock_disqualifies_short_post() -> None:
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Quick note"}],
            },
            {
                "type": "codeBlock",
                "content": [{"type": "text", "text": "print('hi')"}],
            },
        ],
    }
    assert _classify_as_comment(doc) is False


def test_classifier_image_figure_disqualifies_short_post() -> None:
    """imageFigure is Bibliogon's image node type (not 'image' —
    see the regression-pin in test_image_node_type_is_imageFigure_not_image
    above). The heuristic must check the same name."""
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "See chart"}],
            },
            {
                "type": "imageFigure",
                "attrs": {"src": "x.png"},
                "content": [],
            },
        ],
    }
    assert _classify_as_comment(doc) is False


def test_classifier_list_disqualifies_short_post() -> None:
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
                                "content": [{"type": "text", "text": "one"}],
                            }
                        ],
                    },
                ],
            }
        ],
    }
    assert _classify_as_comment(doc) is False


def test_classifier_threshold_boundary() -> None:
    """At exactly 500 chars: NOT a comment (strict `<` cutoff)."""
    body = "x" * 500
    assert _classify_as_comment(_doc(body)) is False
    assert _classify_as_comment(_doc("x" * 499)) is True


def test_parsed_post_carries_is_comment_flag() -> None:
    """End-to-end: the walker sets is_comment on the dataclass.
    None of the 4 production fixtures are comments; they all
    have structure and / or long bodies."""
    for name in (
        "01_oldest_tech.html",
        "02_german_philosophical.html",
        "03_english_recent_with_code.html",
        "04_german_long_with_multi_inner.html",
    ):
        post = _parse(name)
        assert post.is_comment is False, (
            f"Fixture {name} should not classify as a comment "
            f"(has structure and / or long body)."
        )


# ---------------------------------------------------------------------------
# v0.32.0 UX-Polish session: tier-2 conversational-marker rule
# ---------------------------------------------------------------------------
#
# Tier 1 (strict, < 500 chars + no structure) is fully covered by
# the tests above. The tier-2 cases below cover the extension that
# catches longer comment-shaped replies. See the audit doc at
# docs/audits/medium-comment-heuristic-2026-05-14.md.


def test_tier2_closing_question_in_long_comment() -> None:
    """The user-reported edge case shape: ~940 chars, one
    paragraph, ends with a question. Tier 1 misses it (body >=
    500); tier 2 catches it via the closing-question marker."""
    long_body = (
        "This is a powerful and unsettling reframing of longevity "
        "and youth despair as a class struggle rather than a purely "
        "medical or psychological issue. " * 6
    ).strip() + " Where do we go from here?"
    assert len(long_body) >= 500
    assert _classify_as_comment(_doc(long_body)) is True


def test_tier2_second_person_opener_in_long_comment() -> None:
    """German thank-you reply shape: opens with second-person
    address. No question marks anywhere — second-person opener
    alone is enough to fire tier 2."""
    body = (
        "Your insight on contemplative practice resonated with my "
        "own experience. The way you connect the morning ritual to "
        "the rest of the day is something I have been trying to "
        "articulate for months. " * 3
    ).strip()
    assert len(body) >= 500
    assert "?" not in body
    assert _classify_as_comment(_doc(body)) is True


def test_tier2_opening_question_in_long_comment() -> None:
    """Question in the first 200 chars also fires tier 2."""
    body = (
        "Have you considered the alternative framing where the "
        "subject is its own observer? "
    ) + ("Filler content. " * 30)
    assert len(body) >= 500
    assert _classify_as_comment(_doc(body)) is True


def test_tier2_no_marker_keeps_article_classification() -> None:
    """The Vollmond-poem class: 600-1000 char doc with no
    conversational marker (no question marks, no second-person
    opener). Stays Article. Without this rule, v1's multi-signal
    scoring promoted it to comment — the regression-pin.
    """
    body = (
        "Zwischen Schienen und Schatten erhebt sich der Mond. "
        "Lichter flackern, Stahl reflektiert das blasse Licht. " * 10
    ).strip()
    assert len(body) >= 500
    assert _classify_as_comment(_doc(body)) is False


def test_tier2_heading_disqualifies_long_comment() -> None:
    """A heading is a hard tier-2 disqualifier even when a
    conversational marker is present."""
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "Section"}],
            },
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Your point about the framing is interesting "
                            "but I want to push back on this. " * 6
                        ),
                    }
                ],
            },
        ],
    }
    assert _classify_as_comment(doc) is False


def test_tier2_code_block_disqualifies_long_comment() -> None:
    """Code blocks are a tier-2 disqualifier — code = article."""
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Your snippet doesn't compile on my machine. "
                            "Here's the error trace I get? " * 4
                        ),
                    }
                ],
            },
            {
                "type": "codeBlock",
                "content": [{"type": "text", "text": "error: undefined"}],
            },
        ],
    }
    assert _classify_as_comment(doc) is False


def test_tier2_image_disqualifies_long_comment() -> None:
    """Image-bearing posts are articles even if the prose looks
    conversational (regression-pin for the Vollmond-class case
    when the image is present)."""
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Your moonlit Ludwigsburg shot is gorgeous. "
                            "How long was the exposure? " * 6
                        ),
                    }
                ],
            },
            {
                "type": "imageFigure",
                "attrs": {"src": "moon.jpg"},
                "content": [],
            },
        ],
    }
    assert _classify_as_comment(doc) is False


def test_tier2_lists_allowed_in_comments() -> None:
    """Unlike tier 1, tier 2 does NOT disqualify on lists.
    Numbered/bulleted replies ("1. ... 2. ... 3. ...") are a
    real comment pattern and should classify as comments when
    a conversational marker is present."""
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Your point is well-taken but I see a few "
                            "concerns. Let me lay them out: " * 4
                        ),
                    }
                ],
            },
            {
                "type": "orderedList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "First concern"},
                                ],
                            }
                        ],
                    },
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "Second concern"},
                                ],
                            }
                        ],
                    },
                ],
            },
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": "What do you think?",
                    }
                ],
            },
        ],
    }
    assert _classify_as_comment(doc) is True


def test_tier2_body_over_2000_chars_is_article() -> None:
    """Hard cap at 2000 chars — past that, even a closing
    question doesn't promote to comment. This prevents long-form
    rhetorical-question articles from being mis-classified."""
    long_body = "Filler content sentence number ${i}. " * 80
    long_body = long_body.strip() + " What does this all mean?"
    assert len(long_body) >= 2000
    assert _classify_as_comment(_doc(long_body)) is False


def test_tier2_question_must_be_in_window() -> None:
    """A question mid-body (outside both windows) is not a tier-2
    signal. Regression-pin for the "long article asks a rhetorical
    question in para 5" case.
    """
    # Three paragraphs: first/last have no question, middle does.
    # _classify_as_comment inspects only the first and last top-level
    # paragraph, so the middle question must NOT fire.
    para1 = "Opening statement about a topic. " * 10
    para_middle = "But what does it mean? Let me explain. "
    para_last = "Concluding remarks without any conversational marker. " * 5
    doc = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": para1}]},
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": para_middle}],
            },
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": para_last}],
            },
        ],
    }
    body_len = len(para1 + " " + para_middle + " " + para_last)
    assert body_len >= 500
    assert _classify_as_comment(doc) is False
