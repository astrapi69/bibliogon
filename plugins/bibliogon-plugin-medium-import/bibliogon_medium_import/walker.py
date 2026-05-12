"""HTML -> TipTap walker for Medium HTML export posts.

Medium's HTML export is templated and predictable. Each post lives
inside ``<article class="h-entry">`` with header (title, subtitle),
body (``<section data-field="body">``), and footer (canonical URL,
author, date). Body content is split into one or more
``<section class="section--body">`` containers; inside each, the
``<div class="section-inner">`` wraps the actual content elements.

Block elements use ``graf graf--<kind>`` classes. Inline elements
use ``markup--<kind>``. The walker handles every class observed in
the audit of 209 real posts:

  graf--p           -> TipTap paragraph
  graf--h2/h3/h4    -> TipTap heading (Medium maps user-typed H2 to
                       graf--h3 in body; the actual H1 lives in the
                       header, so graf--h3 -> level=2)
  graf--pre         -> TipTap codeBlock with language attribute
                       carried over from data-code-block-lang
  graf--blockquote  -> TipTap blockquote wrapping a paragraph
  graf--li (in ul/  -> TipTap bulletList / orderedList of listItem
    ol class postList)
  graf--figure      -> TipTap image (caption preserved as title attr)
  graf--title       -> SKIPPED on first occurrence; Medium duplicates
                       the page <h1> as the first H3 in the body.

Inline marks recognized:

  <strong> / markup--strong -> bold
  <em>     / markup--em     -> italic
  <code>   / markup--code   -> code
  <a>      / markup--anchor -> link with href

The walker is deliberately tolerant. Unknown block elements with
text content land as plain paragraphs and emit a conversion
warning so the user can spot them after import. Unknown inline
elements pass through as plain text.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from bs4 import BeautifulSoup, NavigableString, Tag
from langdetect import DetectorFactory, LangDetectException, detect_langs

# Make detection deterministic across runs and processes. langdetect
# internally seeds a PRNG; without this, two consecutive runs can
# return different language codes for the same short input. Setting
# the seed pins the output.
DetectorFactory.seed = 0

# A language is only assigned when langdetect's top candidate clears
# this confidence floor. Threshold picked from the 209-post production
# corpus: 0.85 cleanly separates German / English / Greek (top
# candidate ~0.99 each) from genuinely ambiguous mixes (top candidate
# in the 0.3-0.6 range). Below the threshold, the importer falls back
# to its ``default_language`` kwarg (currently hardcoded to "en").
_LANG_CONFIDENCE_THRESHOLD = 0.85


# MEDIUM-COMMENTS-IMPORT-01 commit 2/10. Heuristic constants for
# classifying a parsed post as a comment vs an article. The
# heuristic is intentionally conservative: a false negative (a
# short article being kept as an Article) is acceptable; a
# false positive (a real article being routed to comments)
# would be confusing. Bar set after a real-corpus audit on the
# 209-file production export — 8 unambiguous comments
# classified, zero false positives.
_COMMENT_BODY_LEN_THRESHOLD = 500
_COMMENT_STRUCTURAL_NODE_TYPES: frozenset[str] = frozenset(
    {"heading", "codeBlock", "bulletList", "orderedList", "imageFigure"}
)


@dataclass
class ImageRef:
    """A figure image referenced from a post.

    Captured during the walk so the importer can download images to
    local ArticleAsset storage (commit 4) before persisting the doc.
    The ``src`` is the cdn-images-1.medium.com URL Medium emits in
    the export.
    """

    src: str
    alt: str = ""
    caption: str = ""
    data_image_id: str = ""


@dataclass
class ParsedPost:
    """The result of walking one Medium post HTML file."""

    title: str
    subtitle: str
    canonical_url: str
    published_at: str | None
    author: str
    content_doc: dict[str, Any]
    images: list[ImageRef] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    # Two-letter ISO 639-1 language code detected from the body text
    # when langdetect's top candidate cleared the confidence floor.
    # ``None`` means: low-confidence detection or empty body. The
    # importer falls back to ``default_language`` in that case.
    detected_language: str | None = None
    # MEDIUM-COMMENTS-IMPORT-01 commit 2. True when the heuristic
    # in ``_classify_as_comment`` matches: body_text < 500 chars
    # AND no structural TipTap nodes (heading / codeBlock /
    # bulletList / orderedList / imageFigure). The importer reads
    # this flag together with the ``import_comments_mode`` plugin
    # setting (commit 3) to decide whether to route the post to
    # the ArticleComment table, the Article table, or skip it.
    is_comment: bool = False


# Medium maps user-typed H2 to graf--h3 in body (the H1 is in the
# header). h3 -> level=2; h2/h4/h5/h6 are rare but mapped sensibly.
_HEADING_LEVELS: dict[str, int] = {
    "h1": 1,
    "h2": 1,
    "h3": 2,
    "h4": 3,
    "h5": 4,
    "h6": 5,
}


class MediumWalker:
    """Stateful per-file walker. Construct one per HTML file."""

    def __init__(self) -> None:
        self.warnings: list[str] = []
        self.images: list[ImageRef] = []
        self._title_skipped = False

    def parse(self, html: str) -> ParsedPost:
        soup = BeautifulSoup(html, "html.parser")
        content_doc = self._walk_body(soup)
        return ParsedPost(
            title=self._extract_title(soup),
            subtitle=self._extract_subtitle(soup),
            canonical_url=self._extract_canonical(soup),
            published_at=self._extract_date(soup),
            author=self._extract_author(soup),
            content_doc=content_doc,
            images=self.images,
            warnings=self.warnings,
            detected_language=self._detect_language(content_doc),
            is_comment=_classify_as_comment(content_doc),
        )

    def _detect_language(self, content_doc: dict[str, Any]) -> str | None:
        """Return the ISO 639-1 code of the dominant body language,
        or None when detection is not confident enough.

        Medium HTML exports carry no canonical language metadata
        (verified against the 209-post production corpus: every
        sample has empty ``<html lang>``, ``<body lang>``,
        ``<article lang>``, and ``<meta http-equiv>`` attributes),
        so we have to fall back to statistical detection. Body text
        is what we score, not title/subtitle: titles can be in a
        different language than the body and the body is the
        canonical signal of "what language is this post in".
        """
        text_bits: list[str] = []

        def _gather(node: object) -> None:
            if isinstance(node, dict):
                if node.get("type") == "text":
                    text_bits.append(str(node.get("text", "")))
                for child in node.get("content", []) or []:
                    _gather(child)

        _gather(content_doc)
        text = " ".join(b for b in text_bits if b.strip())
        if len(text) < 50:
            # Too short for reliable detection; let the importer use
            # its default. langdetect's behavior on very short text
            # is too noisy even with the seed pinned.
            return None
        try:
            candidates = detect_langs(text)
        except LangDetectException:
            return None
        if not candidates:
            return None
        top = candidates[0]
        if top.prob < _LANG_CONFIDENCE_THRESHOLD:
            return None
        return str(top.lang)

    def _extract_title(self, soup: BeautifulSoup) -> str:
        h1 = soup.find("h1", class_="p-name")
        return h1.get_text(strip=True) if isinstance(h1, Tag) else ""

    def _extract_subtitle(self, soup: BeautifulSoup) -> str:
        sub = soup.find("section", attrs={"data-field": "subtitle"})
        if isinstance(sub, Tag):
            return sub.get_text(strip=True)
        return ""

    def _extract_canonical(self, soup: BeautifulSoup) -> str:
        a = soup.find("a", class_="p-canonical")
        if isinstance(a, Tag):
            href = a.get("href")
            return href if isinstance(href, str) else ""
        return ""

    def _extract_date(self, soup: BeautifulSoup) -> str | None:
        time_tag = soup.find("time", class_="dt-published")
        if isinstance(time_tag, Tag):
            dt = time_tag.get("datetime")
            return dt if isinstance(dt, str) else None
        return None

    def _extract_author(self, soup: BeautifulSoup) -> str:
        a = soup.find("a", class_="p-author")
        return a.get_text(strip=True) if isinstance(a, Tag) else ""

    def _walk_body(self, soup: BeautifulSoup) -> dict[str, Any]:
        body = soup.find("section", attrs={"data-field": "body"})
        if not isinstance(body, Tag):
            self.warnings.append("body section not found")
            return {"type": "doc", "content": []}

        nodes: list[dict[str, Any]] = []
        # The body is split into one-or-more section.section--body
        # containers. Each holds a single ``section-content`` wrapper,
        # but that wrapper can contain MULTIPLE ``section-inner`` divs:
        # the first usually carries the duplicated ``graf--title``
        # heading, the second is often a full-width image lane, and
        # the third the actual body paragraphs. Using ``.find`` here
        # caught only the first inner and (after the title-skip
        # kicked in) silently dropped the rest of the post for every
        # Medium article that used the standard header-image layout.
        # 56% of the 209-post import was affected; 9 posts came in
        # with zero content. See lessons-learned.
        for section in body.find_all("section", class_="section--body", recursive=False):
            for inner in section.find_all("div", class_="section-inner"):
                if not isinstance(inner, Tag):
                    continue
                for child in inner.children:
                    if not isinstance(child, Tag):
                        continue
                    node = self._walk_block(child)
                    if node is not None:
                        nodes.append(node)

        return {"type": "doc", "content": nodes}

    def _walk_block(self, tag: Tag) -> dict[str, Any] | None:
        classes = tag.get("class") or []

        # Medium duplicates the page <h1> as the first graf--title
        # inside the body. Skip exactly one occurrence so the title
        # doesn't appear twice in the rendered article.
        if "graf--title" in classes and not self._title_skipped:
            self._title_skipped = True
            return None

        if tag.name == "p":
            return self._emit_paragraph(tag)
        if tag.name in _HEADING_LEVELS:
            return self._emit_heading(tag)
        if tag.name == "blockquote":
            return self._emit_blockquote(tag)
        if tag.name == "pre":
            return self._emit_code_block(tag)
        if tag.name in ("ul", "ol"):
            return self._emit_list(tag)
        if tag.name == "figure":
            return self._emit_figure(tag)
        # Section-divider <hr> (Medium emits one at the boundary of
        # every section.section--body). User-typed horizontal rules
        # would land outside this structural element; skip silently.
        if tag.name == "hr":
            return None
        if tag.name == "div" and "section-divider" in classes:
            return None

        # Unknown block: preserve text content as a paragraph and
        # warn so the user can spot it post-import.
        text = tag.get_text(strip=True)
        if text:
            self.warnings.append(f"unknown block element <{tag.name}> preserved as plain paragraph")
            return {"type": "paragraph", "content": [{"type": "text", "text": text}]}
        return None

    def _emit_paragraph(self, tag: Tag) -> dict[str, Any] | None:
        content = self._inline(tag)
        # An empty paragraph is permitted in TipTap (empty content
        # array). Drop ones with no text or marks; they're usually
        # Medium artifacts.
        if not content:
            return None
        return {"type": "paragraph", "content": content}

    def _emit_heading(self, tag: Tag) -> dict[str, Any]:
        level = _HEADING_LEVELS[tag.name]
        return {
            "type": "heading",
            "attrs": {"level": level},
            "content": self._inline(tag),
        }

    def _emit_blockquote(self, tag: Tag) -> dict[str, Any] | None:
        # Medium blockquotes hold inline content directly, not nested
        # paragraphs. TipTap blockquote contains paragraph nodes, so
        # wrap.
        inline = self._inline(tag)
        if not inline:
            return None
        return {
            "type": "blockquote",
            "content": [{"type": "paragraph", "content": inline}],
        }

    def _emit_code_block(self, tag: Tag) -> dict[str, Any]:
        lang_attr = tag.get("data-code-block-lang")
        language = lang_attr if isinstance(lang_attr, str) and lang_attr else None
        text = tag.get_text()
        content: list[dict[str, Any]] = []
        if text:
            content.append({"type": "text", "text": text})
        return {
            "type": "codeBlock",
            "attrs": {"language": language},
            "content": content,
        }

    def _emit_list(self, list_tag: Tag) -> dict[str, Any] | None:
        list_type = "bulletList" if list_tag.name == "ul" else "orderedList"
        items: list[dict[str, Any]] = []
        for li in list_tag.find_all("li", recursive=False):
            inline = self._inline(li)
            if not inline:
                continue
            items.append(
                {
                    "type": "listItem",
                    "content": [{"type": "paragraph", "content": inline}],
                }
            )
        if not items:
            return None
        return {"type": list_type, "content": items}

    def _emit_figure(self, figure: Tag) -> dict[str, Any] | None:
        img = figure.find("img")
        if not isinstance(img, Tag):
            return None
        src = img.get("src")
        if not isinstance(src, str) or not src:
            return None

        caption_el = figure.find("figcaption")
        caption = caption_el.get_text(strip=True) if isinstance(caption_el, Tag) else ""
        alt_attr = img.get("alt", "")
        alt = alt_attr if isinstance(alt_attr, str) else ""
        data_id = img.get("data-image-id", "")
        data_image_id = data_id if isinstance(data_id, str) else ""

        # Capture for the image-download phase. The downloader (next
        # commit) will replace src with the local served path before
        # the doc is persisted.
        self.images.append(
            ImageRef(
                src=src,
                alt=alt,
                caption=caption,
                data_image_id=data_image_id,
            )
        )

        attrs: dict[str, Any] = {"src": src}
        if alt:
            attrs["alt"] = alt
        if caption:
            attrs["title"] = caption
        # Bibliogon's editor uses @pentestpad/tiptap-extension-figure,
        # which registers its node as ``imageFigure`` (NOT ``image``).
        # No standard ``@tiptap/extension-image`` is loaded, so an
        # ``image``-typed node fails the schema and the whole doc
        # renders empty. See lessons-learned for the convention.
        return {"type": "imageFigure", "attrs": attrs}

    def _inline(self, parent: Tag) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        self._inline_walk(parent, [], out)
        return self._merge_adjacent_text(out)

    def _inline_walk(
        self,
        node: Tag,
        marks: list[dict[str, Any]],
        out: list[dict[str, Any]],
    ) -> None:
        for child in node.children:
            if isinstance(child, NavigableString):
                text = str(child)
                if not text:
                    continue
                item: dict[str, Any] = {"type": "text", "text": text}
                if marks:
                    item["marks"] = list(marks)
                out.append(item)
            elif isinstance(child, Tag):
                if child.name == "br":
                    out.append({"type": "hardBreak"})
                    continue
                added = self._marks_for(child)
                # Walk descendants under the accumulated marks; this
                # naturally handles nested cases like
                # <strong><em>bold-italic</em></strong>.
                self._inline_walk(child, marks + added, out)

    def _marks_for(self, tag: Tag) -> list[dict[str, Any]]:
        classes = tag.get("class") or []
        marks: list[dict[str, Any]] = []
        if tag.name == "strong" or "markup--strong" in classes:
            marks.append({"type": "bold"})
        if tag.name == "em" or "markup--em" in classes:
            marks.append({"type": "italic"})
        if tag.name == "code" or "markup--code" in classes:
            marks.append({"type": "code"})
        if tag.name == "a" or "markup--anchor" in classes:
            href = tag.get("href")
            if isinstance(href, str) and href:
                marks.append({"type": "link", "attrs": {"href": href}})
        return marks

    def _merge_adjacent_text(self, nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Concatenate adjacent text nodes carrying the same marks.

        BeautifulSoup splits text whenever it crosses a tag boundary
        (e.g. between an inline mark span and the surrounding text).
        The resulting TipTap doc is functionally identical with or
        without merging, but merging keeps the JSON closer to what a
        human-authored TipTap doc looks like and makes test
        assertions tractable.
        """
        merged: list[dict[str, Any]] = []
        for node in nodes:
            if (
                node.get("type") == "text"
                and merged
                and merged[-1].get("type") == "text"
                and _marks_signature(merged[-1].get("marks")) == _marks_signature(node.get("marks"))
            ):
                merged[-1]["text"] += node["text"]
            else:
                merged.append(node)
        return merged


def _marks_signature(marks: list[dict[str, Any]] | None) -> str:
    """Stable, order-insensitive signature of a marks list."""
    if not marks:
        return ""
    return json.dumps(marks, sort_keys=True)


def _classify_as_comment(content_doc: dict[str, Any]) -> bool:
    """Apply the MEDIUM-COMMENTS-IMPORT-01 detection heuristic.

    Returns True when the parsed post is a "comment-shaped"
    response: a short body (< 500 chars) AND zero structural
    TipTap nodes (heading / codeBlock / bulletList /
    orderedList / imageFigure).

    The original spec also required an empty ``data-field=
    "subtitle"`` section, but the pre-inspection audit on the
    209-file production export found that Medium auto-fills
    the subtitle from the second paragraph of the reply body
    when the author wrote no explicit subtitle. 2 of the 8
    candidates in the corpus had this auto-fill, so requiring
    empty subtitle would silently miss them, including the
    user's own reference case
    ("Thanks for pointing that out — you're right, the link
    was missing."). Dropping the criterion lifted detection
    from 6/209 to 8/209 with zero new false positives.

    Operates on the walker's parsed TipTap document rather
    than the raw soup so the same logic also works for
    future importers that emit TipTap directly.
    """
    text_bits: list[str] = []
    has_structural = False

    def _walk(node: object) -> None:
        nonlocal has_structural
        if not isinstance(node, dict):
            return
        node_type = node.get("type", "")
        if node_type in _COMMENT_STRUCTURAL_NODE_TYPES:
            has_structural = True
        if node_type == "text":
            text_bits.append(str(node.get("text", "")))
        for child in node.get("content", []) or []:
            _walk(child)

    _walk(content_doc)
    if has_structural:
        return False
    body_len = len(" ".join(b for b in text_bits if b.strip()))
    return body_len < _COMMENT_BODY_LEN_THRESHOLD
