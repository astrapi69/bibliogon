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
