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


def fix_whitespace(text: str, trim_last_line: bool = True) -> tuple[str, int]:
    """Fix whitespace issues: multiple spaces, trailing, excessive blank lines.

    ``trim_last_line=False`` leaves the final line's trailing whitespace
    alone. Callers pass it when ``text`` is a FRAGMENT rather than a whole
    document - a text node between two tags, where the last line does not
    end at a line break but at the next tag, so its trailing space is
    carrying meaning rather than being noise (#939). Every earlier line in
    the fragment does end where it says it ends and is trimmed as usual.

    Accepted trade-off: the walker cannot tell mid-stream which text node
    is the document's last, so a document ending in whitespace after a tag
    keeps one space. Cosmetic, where eating a space mid-sentence was not.

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
    last = len(lines) - 1
    trimmed_lines = []
    for index, line in enumerate(lines):
        if index == last and not trim_last_line:
            trimmed_lines.append(line)
            continue
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


# Class tokens a paste leaves behind, by the shape their producer gives
# them. Deliberately narrow: a token is dropped only when it MATCHES one
# of these, so a class nobody has catalogued survives rather than being
# destroyed (#818).
#
#   Mso…            Word (MsoNormal, MsoListParagraph, MsoBodyText, …)
#   WordSection1    Word's page-section wrapper
#   c1, c12         Google Docs
#   kix-…           Google Docs' editor internals
_PASTE_CLASS_RES = (
    re.compile(r"^mso", re.IGNORECASE),
    re.compile(r"^wordsection\d+$", re.IGNORECASE),
    re.compile(r"^c\d+$"),
    re.compile(r"^kix-", re.IGNORECASE),
)

#: The OPENING of the attribute only, with the whitespace before it and the
#: value after it both walked in code. ``(\s+)class="([^"]*)"`` reads better
#: and was the first shape here, but it lets a run of k spaces start a match
#: attempt at each of its k positions: a chapter carrying a long whitespace
#: run that no class attribute follows then costs O(n^2) - 1.0s at 16k
#: spaces, 17s at 64k, on content a user imported (``py/polynomial-redos``,
#: CodeQL on #949). Anchoring it with ``(?<!\s)`` removed the cost but not
#: the ambiguity the query reports, so the repetition is gone from the
#: pattern instead. A literal has nothing to backtrack over.
_CLASS_OPEN_RE = re.compile(r'class="', re.IGNORECASE)

#: One character at a time, so the whitespace walk agrees with ``\s+``
#: exactly rather than approximately - ``str.isspace()`` is a different set.
_WS_RE = re.compile(r"\s")


def _is_paste_class(token: str) -> bool:
    return any(pattern.match(token) for pattern in _PASTE_CLASS_RES)


def _strip_paste_classes(text: str) -> tuple[str, int]:
    """Remove paste-cruft class tokens, keeping every other one.

    The rule used to delete the whole attribute, which cannot tell
    ``MsoNormal`` from the structural classes the project's own exporter
    writes (``<div class="dedication">``, ``epigraph``, ``part``, …) or
    from anything a book's ``custom_css`` targets. A damage scan on the
    production library counted 156 such attributes across imported
    chapters (#818).

    An attribute whose tokens are all cruft is removed entirely, as is an
    empty ``class=""``; one with survivors is rewritten with them. Each
    changed attribute counts once, as the all-or-nothing rule did.

    Reproduces what the regular expression it replaced accepted, which is
    load-bearing in two places a quick reading misses. An occurrence with
    no whitespace in front of it is not an attribute of the tag being
    read, so it is skipped by its OPENING rather than by its whole span -
    skipping the span would swallow a real attribute nested inside the
    value, as ``class="\nclass=""`` does. And the value ends at the next
    quote, because ``[^"]*`` could not cross one either; with no next
    quote there is no match here and none later, since any later opening
    would itself contain one.
    """
    out: list[str] = []
    count = 0
    cursor = 0
    pos = 0

    while (opening := _CLASS_OPEN_RE.search(text, pos)) is not None:
        start, after_quote = opening.start(), opening.end()
        run = start
        while run > cursor and _WS_RE.match(text, run - 1):
            run -= 1
        if run == start:
            pos = after_quote
            continue

        closing = text.find('"', after_quote)
        if closing == -1:
            break

        tokens = text[after_quote:closing].split()
        kept = [token for token in tokens if not _is_paste_class(token)]
        out.append(text[cursor:run])
        if kept and kept == tokens:
            out.append(text[run : closing + 1])
        else:
            count += 1
            if kept:
                out.append(f'{text[run:start]}class="{" ".join(kept)}"')
        cursor = pos = closing + 1

    out.append(text[cursor:])
    return "".join(out), count


def fix_html_artifacts(text: str) -> tuple[str, int]:
    """Remove HTML and Word artifacts from copy-pasted content.

    Strips empty tags, style attributes, Word-specific XML comments,
    and common Word metadata tags.

    Every rule is case-insensitive (#934). Word emits UPPERCASE tags and
    attributes, which is the input this function exists for, and the
    case-sensitive rules simply skipped them. ``IGNORECASE`` also makes the
    empty-tag backreference match across cases, so ``<DIV>x</div>`` is
    recognised as a pair.

    Returns (fixed_text, number_of_replacements).
    """
    count = 0

    # Empty HTML tags: <span></span>, <div></div>, <p></p>, etc.
    fixed, n = re.subn(r"<(\w+)(\s[^>]*)?>(\s*)</\1>", r"\3", text, flags=re.IGNORECASE)
    count += n

    # Style attributes inside tags
    fixed, n = re.subn(r'\s+style="[^"]*"', "", fixed, flags=re.IGNORECASE)
    count += n
    fixed, n = re.subn(r"\s+style='[^']*'", "", fixed, flags=re.IGNORECASE)
    count += n

    # Class attributes from Word / Google Docs, per token (#818)
    fixed, n = _strip_paste_classes(fixed)
    count += n

    # Word-specific XML comments: <!--[if ...]> ... <![endif]-->
    fixed, n = re.subn(
        r"<!--\[if[^>]*>.*?<!\[endif\]-->", "", fixed, flags=re.DOTALL | re.IGNORECASE
    )
    count += n

    # Generic HTML comments
    fixed, n = re.subn(r"<!--.*?-->", "", fixed, flags=re.DOTALL)
    count += n

    # Word namespace tags: <o:p>, </o:p>, <w:...>, etc.
    fixed, n = re.subn(r"</?[owm]:[^>]*>", "", fixed, flags=re.IGNORECASE)
    count += n

    # <span> and <div> tags themselves (after emptying their attributes)
    fixed, n = re.subn(r"</?span[^>]*>", "", fixed, flags=re.IGNORECASE)
    count += n
    fixed, n = re.subn(r"</?div[^>]*>", "", fixed, flags=re.IGNORECASE)
    count += n

    return fixed, count


_END_TAG_RE = re.compile(r"</\s*([a-zA-Z][^\s>]*)[^>]*>")


class _TextNodeTransformer(HTMLParser):
    """Applies ``transform`` to every text node, re-emitting every tag
    byte-for-byte unchanged (#805) - including its casing (#934).

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

    def __init__(self, transform, source: str = ""):
        super().__init__(convert_charrefs=False)
        self._transform = transform
        self.chunks: list[str] = []
        self.count = 0
        self._end_tags = [(m.group(1).lower(), m.group(0)) for m in _END_TAG_RE.finditer(source)]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.chunks.append(self.get_starttag_text() or "")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.chunks.append(self.get_starttag_text() or "")

    def handle_endtag(self, tag: str) -> None:
        """Re-emit the end tag exactly as the source wrote it.

        ``HTMLParser`` hands ``tag`` down-cased and offers no
        ``get_endtag_text()`` counterpart to ``get_starttag_text()``, so
        rebuilding from ``tag`` silently lower-cased every end tag - which
        broke this class's own byte-for-byte promise and, combined with the
        then case-sensitive ``fix_html_artifacts`` rules, turned
        ``<SPAN>a</SPAN>`` into the unbalanced ``<SPAN>a`` (#934).

        The source's end tags are collected up front, in document order.
        Matching by name rather than popping blindly keeps the list aligned
        when the parser synthesises an end tag the source never wrote; if
        nothing matches, the rebuilt form is still a correct tag, just
        lower-cased.
        """
        for index, (name, raw) in enumerate(self._end_tags):
            if name == tag:
                del self._end_tags[: index + 1]
                self.chunks.append(raw)
                return
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


def _apply_html_aware(text: str, transform, fragment_transform=None) -> tuple[str, int]:
    """Run ``transform`` over every text node of ``text`` if it looks
    like HTML, else over the whole string.

    ``transform`` is a ``(text) -> (fixed_text, count)`` function -
    exactly the shape ``fix_quotes``/``fix_whitespace`` already have.

    ``fragment_transform`` is the variant used on the text-node path, for
    a fix whose behaviour differs between a whole document and a fragment
    (``fix_whitespace``'s per-line trailing trim; see #939). It defaults to
    ``transform``, so a fix that does not care passes one callable.
    """
    if not _looks_like_html(text):
        return transform(text)
    parser = _TextNodeTransformer(fragment_transform or transform, text)
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
        result, n = _apply_html_aware(
            result, fix_whitespace, lambda t: fix_whitespace(t, trim_last_line=False)
        )
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
