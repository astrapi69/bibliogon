"""HTML -> Markdown converter used by the export pipeline.

Used when a chapter's content is already HTML (e.g. imported via the
write-book-template path) and needs to round-trip back to Markdown for
manuscripta/Pandoc. The TipTap-JSON path goes through ``tiptap_to_md``
instead.
"""

import re
from collections.abc import Callable
from html.parser import HTMLParser


_HEADING_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6")


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


def _close_figure(p: _HtmlToMdParser) -> None:
    fig = "\n<figure>\n" + "\n".join(p._figure_buf) + "\n</figure>\n"
    p.out.append(fig)
    p._in_figure = False


def _open_figcaption(p: _HtmlToMdParser, _a: dict[str, str | None]) -> None:
    p._in_figcaption = True
    p._figcaption_buf = []


def _close_figcaption(p: _HtmlToMdParser) -> None:
    caption = "".join(p._figcaption_buf).strip()
    if p._in_figure:
        p._figure_buf.append(f"  <figcaption>\n    {caption}\n  </figcaption>")
    p._in_figcaption = False


def _open_img(p: _HtmlToMdParser, a: dict[str, str | None]) -> None:
    src = a.get("src", "") or ""
    alt = a.get("alt", "") or ""
    img_html = f'  <img src="{src}" alt="{alt}" />'
    if p._in_figure:
        p._figure_buf.append(img_html)
    else:
        p._buf().append(f'\n<figure>\n{img_html}\n</figure>\n')


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
