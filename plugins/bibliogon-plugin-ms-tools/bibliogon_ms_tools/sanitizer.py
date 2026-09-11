"""Text sanitizer: fixes common formatting issues in manuscript text.

Handles invisible characters, typographic cleanup, whitespace, and
HTML/Word artifacts that sneak in via copy-paste from external sources.
"""

import re
from html.parser import HTMLParser

# Quote pairs per language: (opening, closing)
QUOTE_STYLES: dict[str, tuple[str, str, str, str]] = {
    # outer_open, outer_close, inner_open, inner_close
    "de": ("\u201e", "\u201c", "\u201a", "\u2018"),  # ... ...
    "en": ("\u201c", "\u201d", "\u2018", "\u2019"),  # "..." '...'
    "fr": ("\u00ab\u202f", "\u202f\u00bb", "\u201c", "\u201d"),  # << ... >> "..."
    "es": ("\u00ab", "\u00bb", "\u201c", "\u201d"),  # <<...>> "..."
    "el": ("\u00ab", "\u00bb", "\u201c", "\u201d"),  # <<...>> "..."
}


def fix_invisible_chars(text: str) -> tuple[str, int]:
    """Remove invisible Unicode characters that cause problems in exports.

    Handles: non-breaking spaces (U+00A0), zero-width spaces (U+200B),
    byte order marks (U+FEFF), soft hyphens (U+00AD), zero-width
    joiners/non-joiners (U+200C/U+200D), word joiners (U+2060).

    Returns (fixed_text, number_of_replacements).
    """
    count = 0

    # Non-breaking space -> normal space
    fixed, n = re.subn("\u00a0", " ", text)
    count += n

    # Zero-width characters -> remove entirely
    for char in ("\u200b", "\u200c", "\u200d", "\u2060", "\ufeff", "\u00ad"):
        fixed, n = re.subn(char, "", fixed)
        count += n

    return fixed, count


def fix_quotes(text: str, language: str = "de") -> tuple[str, int]:
    """Replace straight quotes with typographic quotes for the given language.

    Returns (fixed_text, number_of_replacements).
    """
    style = QUOTE_STYLES.get(language, QUOTE_STYLES["en"])
    outer_open, outer_close, inner_open, inner_close = style

    count = 0
    result: list[str] = []
    in_quote = False
    i = 0

    while i < len(text):
        ch = text[i]

        if ch == '"':
            if not in_quote:
                result.append(outer_open)
                in_quote = True
            else:
                result.append(outer_close)
                in_quote = False
            count += 1
            i += 1
        elif ch == "'":
            prev_is_word = i > 0 and text[i - 1].isalpha()
            next_is_word = i + 1 < len(text) and text[i + 1].isalpha()
            if prev_is_word and next_is_word:
                result.append("\u2019")
                count += 1
            elif not prev_is_word and next_is_word:
                result.append(inner_open)
                count += 1
            elif prev_is_word and not next_is_word:
                result.append(inner_close)
                count += 1
            else:
                result.append(ch)
            i += 1
        else:
            result.append(ch)
            i += 1

    return "".join(result), count


def fix_whitespace(text: str) -> tuple[str, int]:
    """Fix whitespace issues: multiple spaces, trailing, excessive blank lines.

    Returns (fixed_text, number_of_replacements).
    """
    count = 0

    # Multiple spaces to single space
    fixed, n = re.subn(r"  +", " ", text)
    count += n

    # Space before punctuation (.,;:!?)
    fixed, n = re.subn(r" +([.,;:!?])", r"\1", fixed)
    count += n

    # Missing space after punctuation (except in numbers like 3.14)
    fixed, n = re.subn(r"([.,;:!?])([A-Za-z\u00c0-\u024f])", r"\1 \2", fixed)
    count += n

    # Trim trailing whitespace per line
    lines = fixed.split("\n")
    trimmed_lines = []
    for line in lines:
        stripped = line.rstrip()
        if stripped != line:
            count += 1
        trimmed_lines.append(stripped)
    fixed = "\n".join(trimmed_lines)

    # Collapse more than 2 consecutive blank lines to 2
    fixed, n = re.subn(r"\n{4,}", "\n\n\n", fixed)
    count += n

    return fixed, count


def fix_dashes(text: str) -> tuple[str, int]:
    """Convert double/triple hyphens to proper dashes.

    Returns (fixed_text, number_of_replacements).
    """
    count = 0
    fixed, n = re.subn(r"---", "\u2014", text)
    count += n
    fixed, n = re.subn(r"(?<!\-)--(?!\-)", "\u2013", fixed)
    count += n
    return fixed, count


def fix_ellipsis(text: str) -> tuple[str, int]:
    """Replace three dots with proper ellipsis character.

    Returns (fixed_text, number_of_replacements).
    """
    fixed, n = re.subn(r"\.{3}", "\u2026", text)
    return fixed, n


def fix_html_artifacts(text: str) -> tuple[str, int]:
    """Remove HTML and Word artifacts from copy-pasted content.

    Strips empty tags, style attributes, Word-specific XML comments,
    and common Word metadata tags.

    Returns (fixed_text, number_of_replacements).
    """
    count = 0

    # Empty HTML tags: <span></span>, <div></div>, <p></p>, etc.
    fixed, n = re.subn(r"<(\w+)(\s[^>]*)?>(\s*)</\1>", r"\3", text)
    count += n

    # Style attributes inside tags
    fixed, n = re.subn(r'\s+style="[^"]*"', "", fixed)
    count += n
    fixed, n = re.subn(r"\s+style='[^']*'", "", fixed)
    count += n

    # Class attributes from Word
    fixed, n = re.subn(r'\s+class="[^"]*"', "", fixed)
    count += n

    # Word-specific XML comments: <!--[if ...]> ... <![endif]-->
    fixed, n = re.subn(r"<!--\[if[^>]*>.*?<!\[endif\]-->", "", fixed, flags=re.DOTALL)
    count += n

    # Generic HTML comments
    fixed, n = re.subn(r"<!--.*?-->", "", fixed, flags=re.DOTALL)
    count += n

    # Word namespace tags: <o:p>, </o:p>, <w:...>, etc.
    fixed, n = re.subn(r"</?[owm]:[^>]*>", "", fixed)
    count += n

    # <span> and <div> tags themselves (after emptying their attributes)
    fixed, n = re.subn(r"</?span[^>]*>", "", fixed)
    count += n
    fixed, n = re.subn(r"</?div[^>]*>", "", fixed)
    count += n

    return fixed, count


class _TextNodeTransformer(HTMLParser):
    """Applies ``transform`` to every text node, re-emitting every tag
    byte-for-byte unchanged (#805).

    fix_quotes and fix_whitespace originally walked the raw content
    string with no concept of markup, so an imported chapter's own
    ``<img>``/``<table>``/etc tags were mangled exactly like the prose:
    an ASCII quote inside an attribute value became a typographic
    quote, and the missing-space-after-punctuation rule inserted a
    space right after the dot in a file extension. This walker is the
    fix - it is the ONLY thing in this module that understands HTML
    structure; ``fix_quotes``/``fix_whitespace`` themselves stay pure
    string transforms so they still work standalone on genuine
    non-HTML text (the ``/sanitize`` endpoint's normal case).

    A quote opened in one text node and closed after an intervening
    inline tag (``"Hello <em>world</em>"``) is not paired across the
    tag boundary - each text node starts ``fix_quotes`` fresh. This is
    a narrow, honest limitation, not a silent one: real manuscript
    quotes essentially always close within the same text run.
    """

    def __init__(self, transform):
        super().__init__(convert_charrefs=False)
        self._transform = transform
        self.chunks: list[str] = []
        self.count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.chunks.append(self.get_starttag_text() or "")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.chunks.append(self.get_starttag_text() or "")

    def handle_endtag(self, tag: str) -> None:
        self.chunks.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        fixed, n = self._transform(data)
        self.chunks.append(fixed)
        self.count += n

    def handle_entityref(self, name: str) -> None:
        self.chunks.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.chunks.append(f"&#{name};")

    def handle_comment(self, data: str) -> None:
        self.chunks.append(f"<!--{data}-->")

    def handle_decl(self, decl: str) -> None:
        self.chunks.append(f"<!{decl}>")


_HTML_TAG_RE = re.compile(r"<[a-zA-Z/][^>]*>")


def _looks_like_html(text: str) -> bool:
    """Whether ``text`` contains HTML markup anywhere, not just at the
    start.

    Content reaching the sanitizer at import time is Markdown that can
    freely embed RAW HTML mid-document - a write-book-template chapter
    is typically prose with an occasional ``<img>`` or ``<table>`` tag
    inline, not a document that itself starts with ``<`` (that stricter
    check is right for ``scaffolder._content_to_markdown`` /
    ``bibliogon_learnset.routes._chapter_markdown``, which classify a
    WHOLE chapter's stored content, not a markdown source file with
    embedded fragments). A tag search, not a startswith check, is what
    catches those fragments so they route through the text-node-only
    walker instead of the raw-string path (#805).
    """
    return bool(_HTML_TAG_RE.search(text))


def _apply_html_aware(text: str, transform) -> tuple[str, int]:
    """Run ``transform`` over every text node of ``text`` if it looks
    like HTML, else over the whole string.

    ``transform`` is a ``(text) -> (fixed_text, count)`` function -
    exactly the shape ``fix_quotes``/``fix_whitespace`` already have.
    """
    if not _looks_like_html(text):
        return transform(text)
    parser = _TextNodeTransformer(transform)
    parser.feed(text)
    parser.close()
    return "".join(parser.chunks), parser.count


def sanitize(
    text: str,
    language: str = "de",
    fix_invisible: bool = True,
    fix_quote_marks: bool = True,
    fix_spaces: bool = True,
    fix_dash_marks: bool = True,
    fix_ellipses: bool = True,
    fix_html: bool = True,
) -> dict:
    """Apply all sanitization fixes to text.

    Returns dict with fixed text, total replacements, and per-fix counts.
    """
    result = text
    fixes: dict[str, int] = {}

    if fix_invisible:
        result, n = fix_invisible_chars(result)
        fixes["invisible_chars"] = n

    if fix_quote_marks:
        result, n = _apply_html_aware(result, lambda t: fix_quotes(t, language))
        fixes["quotes"] = n

    if fix_spaces:
        result, n = _apply_html_aware(result, fix_whitespace)
        fixes["whitespace"] = n

    if fix_dash_marks:
        result, n = fix_dashes(result)
        fixes["dashes"] = n

    if fix_ellipses:
        result, n = fix_ellipsis(result)
        fixes["ellipsis"] = n

    if fix_html:
        result, n = fix_html_artifacts(result)
        fixes["html_artifacts"] = n

    total = sum(fixes.values())

    return {
        "original": text,
        "sanitized": result,
        "total_fixes": total,
        "fixes": fixes,
        "changed": result != text,
    }
