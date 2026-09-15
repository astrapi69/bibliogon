"""Strip HTML down to readable plain text (#818).

Used wherever a consumer wants what a listener or a word-counter
would perceive, not the source markup: TTS narration
(plugin-audiobook), style/word-count metrics (plugin-ms-tools, via
plugin-audiobook's shared extractor), entity name-matching
(plugin-story-bible), and machine-translation source text
(plugin-translation). Those four plugins independently parsed
``json.loads(content)`` and fell through to the raw HTML string on
failure - reading markup aloud, counting tag names as words, silently
producing zero entity matches, feeding raw tags to a translation
provider (#806).

Lives in ``app.services`` rather than a plugin: no plugin may import
from another plugin's package (see ``backend/tests/
test_plugin_isolation.py``), and this utility is needed by four
different plugins with no natural "owner" plugin among them.
"""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser

_BLOCK_TAGS = frozenset(
    {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "br", "tr"}
)
_SKIPPED_CONTENT_TAGS = frozenset({"script", "style"})


class _HtmlToTextParser(HTMLParser):
    """Strips markup, keeping only the readable prose.

    One newline per block-level element close, everything else joined
    with a single space.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIPPED_CONTENT_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIPPED_CONTENT_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif tag in _BLOCK_TAGS:
            self.chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        self.chunks.append(data)


def html_to_plain_text(html: str) -> str:
    """Strip HTML down to readable prose - no Markdown, no tags.

    Args:
        html: Raw HTML, as stored in an imported chapter's content.

    Returns:
        Plain text with entities decoded, one blank-collapsed line per
        block element, internal whitespace collapsed to single spaces.
        Empty/whitespace input returns "".

    Example:
        >>> html_to_plain_text("<p>Hello <strong>world</strong>.</p>")
        'Hello world.'
    """
    if not html or not html.strip():
        return ""
    parser = _HtmlToTextParser()
    parser.feed(html)
    parser.close()
    lines = [
        "".join(chunk for chunk in group).strip() for group in _split_on_newlines(parser.chunks)
    ]
    collapsed = [re.sub(r"\s+", " ", line).strip() for line in lines]
    return "\n".join(line for line in collapsed if line)


def _split_on_newlines(chunks: list[str]) -> list[list[str]]:
    """Group parser chunks into lines at each explicit newline marker."""
    groups: list[list[str]] = [[]]
    for chunk in chunks:
        if chunk == "\n":
            groups.append([])
        else:
            groups[-1].append(chunk)
    return groups


def _walk_tiptap_nodes(node: dict | list, texts: list[str]) -> None:
    """Recursively collect text leaves from a TipTap node tree."""
    if isinstance(node, list):
        for item in node:
            _walk_tiptap_nodes(item, texts)
        return

    if not isinstance(node, dict):
        return

    node_type = node.get("type", "")

    if node_type == "text":
        text = node.get("text", "")
        if text:
            texts.append(text)
    elif "content" in node:
        for child in node["content"]:
            _walk_tiptap_nodes(child, texts)
        # Break after block elements so words don't run together.
        if node_type in ("paragraph", "heading", "blockquote", "listItem"):
            texts.append("")


def content_to_plain_text(content: object) -> str:
    """Extract readable prose from a chapter body in ANY stored shape.

    ``Chapter.content`` is documented as TipTap JSON, but four shapes
    reach consumers in practice: a parsed dict, a JSON string, HTML (an
    imported chapter stays HTML until someone opens and saves it in the
    editor, #787), and legacy plain text. Measured on the dev library:
    779 of 834 chapters are HTML and none are TipTap JSON, so the HTML
    branch is the common case, not the edge case.

    This is the plain-text counterpart to
    ``bibliogon_export.scaffolder.content_to_markdown``. It lives in
    ``app.services`` for the same reason ``html_to_plain_text`` does
    (#820): no plugin may import another plugin's package, and this is
    needed by several plugins with no natural owner among them. It was
    lifted here from ``bibliogon_audiobook.generator.extract_plain_text``
    (#835), which ms-tools had been cross-importing without declaring
    the dependency.

    ``bibliogon_audiobook.generator.extract_plain_text`` deliberately
    keeps its own copy of this logic rather than delegating here: that
    module must stay importable with no ``app`` package present (its
    isolated plugin venv runs its whole test suite that way), so it can
    only reach into ``app.services`` lazily, on the HTML branch. Any
    consumer that already depends on ``app`` - core code, and plugin
    handlers that query ``app.models`` - should call THIS function.

    Args:
        content: A TipTap doc dict, a JSON string, an HTML string, or
            plain text. None/empty yields "".

    Returns:
        Plain text. Never raises.

    Example:
        >>> content_to_plain_text("<p>Hello <strong>world</strong>.</p>")
        'Hello world.'
    """
    if not content:
        return ""

    if isinstance(content, dict):
        doc: object = content
    elif isinstance(content, str):
        stripped = content.strip()
        if not stripped:
            return ""
        try:
            doc = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            # Reading raw markup aloud (or counting tags as words) is
            # worse than reading nothing, so strip it to prose rather
            # than returning it unchanged (#806). Genuine plain text
            # has no markup to strip and passes through.
            if stripped.startswith("<"):
                return html_to_plain_text(content)
            return content
    else:
        return ""

    if not isinstance(doc, dict):
        return ""

    texts: list[str] = []
    _walk_tiptap_nodes(doc, texts)
    return "\n".join(texts).strip()
