"""HTML -> Markdown converter used by the export pipeline.

Used when a chapter's content is already HTML (e.g. imported via the
write-book-template path) and needs to round-trip back to Markdown for
manuscripta/Pandoc. The TipTap-JSON path goes through ``tiptap_to_md``
instead.
"""

import logging
import re
from collections.abc import Callable
from html.parser import HTMLParser

logger = logging.getLogger(__name__)

_HEADING_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6")


_BLOCK_TAGS = frozenset(
    {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "br", "tr"}
)
_SKIPPED_CONTENT_TAGS = frozenset({"script", "style"})


class _HtmlToTextParser(HTMLParser):
    """Strips markup, keeping only the readable prose.

    One newline per block-level element close, everything else joined
    with a single space. Not shared with ``_HtmlToMdParser`` above -
    that one is tuned for emitting Markdown syntax (headings, links,
    image references), which is exactly the noise a TTS engine or a
    word-counter must not see.
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

    Used wherever a consumer wants what a listener or a word-counter
    would perceive, not the source markup: TTS narration
    (plugin-audiobook), style/word-count metrics (plugin-ms-tools),
    entity name-matching (plugin-story-bible), and machine-translation
    source text (plugin-translation). Those four plugins independently
    parsed ``json.loads(content)`` and fell through to the raw HTML
    string on failure - reading markup aloud, counting tag names as
    words, silently producing zero entity matches (#806).

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


def html_to_markdown(html: str) -> str:
    """Convert an HTML fragment to Markdown using an element-based parser."""
    parser = _HtmlToMdParser()
    parser.feed(html)
    text = "".join(parser.out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class _HtmlToMdParser(HTMLParser):
    """Stateful HTML -> Markdown converter.

    Tracks list nesting depth, the current ``<li>`` text buffer, the open
    tag stack, and figure/figcaption state. Each handler stays small;
    per-element work lives in dedicated ``_open_*`` / ``_close_*`` helpers.
    """

    def __init__(self) -> None:
        super().__init__()
        self.out: list[str] = []
        self.list_depth = 0
        self.li_text: list[str] = []
        self.li_flushed = False
        self.tag_stack: list[str] = []
        self._href: str = ""
        self._in_figure: bool = False
        self._in_figcaption: bool = False
        self._figure_buf: list[str] = []
        self._figcaption_buf: list[str] = []
        # Structured tracking so _close_figure can decide between native
        # Markdown image syntax (renderable in PDF/DOCX) and raw-HTML
        # fallback (PDF/DOCX silently drops raw HTML).
        self._figure_imgs: list[dict[str, str]] = []
        self._figure_caption: str = ""
        self._figure_has_extra_content: bool = False

    # --- HTMLParser hooks ---

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tag_stack.append(tag)
        a = dict(attrs)
        opener = _START_HANDLERS.get(tag)
        if opener:
            opener(self, a)
        elif tag in _HEADING_TAGS:
            self.out.append(f"\n{'#' * int(tag[1])} ")

    def handle_endtag(self, tag: str) -> None:
        if self.tag_stack and self.tag_stack[-1] == tag:
            self.tag_stack.pop()
        closer = _END_HANDLERS.get(tag)
        if closer:
            closer(self)
        elif tag in _HEADING_TAGS:
            self.out.append("\n")

    def handle_data(self, data: str) -> None:
        if self._in_figcaption:
            self._figcaption_buf.append(data)
            return
        if self._in_figure and data.strip():
            # Text inside <figure> but outside <figcaption> means the
            # figure is more complex than the native-Markdown image
            # syntax can express; force the raw-HTML fallback.
            self._figure_has_extra_content = True
        buf = self._buf()
        if "strong" in self.tag_stack:
            buf.append(f"**{data}**")
        elif "em" in self.tag_stack:
            buf.append(f"*{data}*")
        elif "blockquote" in self.tag_stack and "p" in self.tag_stack:
            buf.append(f"> {data}")
        elif "code" in self.tag_stack:
            buf.append(f"`{data}`")
        else:
            buf.append(data)

    # --- Internal helpers ---

    def _buf(self) -> list[str]:
        """Return current write buffer: ``li_text`` if inside ``<li>``, else ``out``."""
        return self.li_text if "li" in self.tag_stack else self.out

    def _flush_li(self) -> None:
        """Flush the current ``<li>`` text before a nested list starts."""
        if self.li_flushed or not self.li_text:
            return
        indent = "  " * max(0, self.list_depth - 1)
        text = "".join(self.li_text).strip()
        if text:
            self.out.append(f"{indent}- {text}\n")
        self.li_text = []
        self.li_flushed = True


# --- Per-tag open/close handlers ---


def _open_list(p: _HtmlToMdParser, _a: dict[str, str | None]) -> None:
    if p.list_depth > 0:
        p._flush_li()
    p.list_depth += 1


def _close_list(p: _HtmlToMdParser) -> None:
    p.list_depth -= 1


def _open_li(p: _HtmlToMdParser, _a: dict[str, str | None]) -> None:
    p.li_text = []
    p.li_flushed = False


def _close_li(p: _HtmlToMdParser) -> None:
    if not p.li_flushed:
        p._flush_li()
    p.li_text = []
    p.li_flushed = False


def _open_a(p: _HtmlToMdParser, a: dict[str, str | None]) -> None:
    p._buf().append("[")
    p._href = a.get("href", "") or ""


def _close_a(p: _HtmlToMdParser) -> None:
    p._buf().append(f"]({p._href})")


def _open_figure(p: _HtmlToMdParser, _a: dict[str, str | None]) -> None:
    p._in_figure = True
    p._figure_buf = []
    p._figure_imgs = []
    p._figure_caption = ""
    p._figure_has_extra_content = False


def _close_figure(p: _HtmlToMdParser) -> None:
    # Native Markdown image syntax survives all Pandoc writers (PDF/LaTeX,
    # DOCX, EPUB, HTML); raw HTML is silently dropped by the LaTeX and
    # DOCX writers. Emit native syntax whenever the figure shape is
    # simple enough to round-trip.
    simple = len(p._figure_imgs) == 1 and not p._figure_has_extra_content
    if simple:
        p.out.append(_native_figure_markdown(p._figure_imgs[0], p._figure_caption))
    else:
        logger.warning(
            "html_to_markdown: complex <figure> preserved as raw HTML "
            "(imgs=%d, has_extra_content=%s); may not appear in PDF/DOCX",
            len(p._figure_imgs),
            p._figure_has_extra_content,
        )
        p.out.append(_raw_figure_html(p._figure_buf))
    p._in_figure = False
    p._figure_imgs = []
    p._figure_caption = ""
    p._figure_buf = []
    p._figure_has_extra_content = False


def _native_figure_markdown(img: dict[str, str], caption: str) -> str:
    """Emit ``![caption](src "alt")`` so Pandoc's implicit_figures fires."""
    src = img.get("src", "")
    alt = img.get("alt", "")
    label = caption or alt
    if caption and alt:
        title = alt.replace('"', "'")
        return f'\n![{label}]({src} "{title}")\n'
    return f"\n![{label}]({src})\n"


def _raw_figure_html(buf: list[str]) -> str:
    return "\n<figure>\n" + "\n".join(buf) + "\n</figure>\n"


def _open_figcaption(p: _HtmlToMdParser, _a: dict[str, str | None]) -> None:
    p._in_figcaption = True
    p._figcaption_buf = []


def _close_figcaption(p: _HtmlToMdParser) -> None:
    caption = "".join(p._figcaption_buf).strip()
    if p._in_figure:
        p._figure_caption = caption
        p._figure_buf.append(f"  <figcaption>\n    {caption}\n  </figcaption>")
    p._in_figcaption = False


def _open_img(p: _HtmlToMdParser, a: dict[str, str | None]) -> None:
    src = a.get("src", "") or ""
    alt = a.get("alt", "") or ""
    if p._in_figure:
        p._figure_imgs.append({"src": src, "alt": alt})
        p._figure_buf.append(f'  <img src="{src}" alt="{alt}" />')
    else:
        # Bare <img> outside <figure>: native Markdown so it survives
        # PDF/DOCX. Pandoc's implicit_figures promotes a paragraph
        # containing only one image into a proper figure block.
        p._buf().append(f"\n![{alt}]({src})\n")


def _open_br(p: _HtmlToMdParser, _a: dict[str, str | None]) -> None:
    p._buf().append("  \n")


def _open_hr(p: _HtmlToMdParser, _a: dict[str, str | None]) -> None:
    p.out.append("\n***\n")


def _close_p(p: _HtmlToMdParser) -> None:
    if "li" not in p.tag_stack:
        p.out.append("\n")


_StartHandler = Callable[[_HtmlToMdParser, dict[str, str | None]], None]
_EndHandler = Callable[[_HtmlToMdParser], None]

_START_HANDLERS: dict[str, _StartHandler] = {
    "ul": _open_list,
    "ol": _open_list,
    "li": _open_li,
    "a": _open_a,
    "figure": _open_figure,
    "figcaption": _open_figcaption,
    "img": _open_img,
    "br": _open_br,
    "hr": _open_hr,
}

_END_HANDLERS: dict[str, _EndHandler] = {
    "ul": _close_list,
    "ol": _close_list,
    "li": _close_li,
    "a": _close_a,
    "figure": _close_figure,
    "figcaption": _close_figcaption,
    "p": _close_p,
}
