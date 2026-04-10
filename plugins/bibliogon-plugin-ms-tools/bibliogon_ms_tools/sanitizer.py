"""Text sanitizer: fixes common formatting issues in manuscript text.

Handles invisible characters, typographic cleanup, whitespace, and
HTML/Word artifacts that sneak in via copy-paste from external sources.
"""

import re

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
        result, n = fix_quotes(result, language)
        fixes["quotes"] = n

    if fix_spaces:
        result, n = fix_whitespace(result)
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
