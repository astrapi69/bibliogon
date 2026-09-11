"""Tests for sanitizer module."""

from bibliogon_ms_tools.sanitizer import (
    fix_dashes,
    fix_ellipsis,
    fix_quotes,
    fix_whitespace,
    sanitize,
)

# --- Quote Fixing ---


def test_fix_quotes_german():
    text = 'Er sagte "Hallo" zu ihr.'
    fixed, count = fix_quotes(text, "de")
    assert "\u201e" in fixed  # opening „
    assert "\u201c" in fixed  # closing "
    assert count == 2


def test_fix_quotes_english():
    text = 'She said "Hello" to him.'
    fixed, count = fix_quotes(text, "en")
    assert "\u201c" in fixed  # opening "
    assert "\u201d" in fixed  # closing "
    assert count == 2


def test_fix_quotes_preserves_apostrophes():
    text = "It's a beautiful day, isn't it?"
    fixed, count = fix_quotes(text, "en")
    # Apostrophes inside words should become right single quote
    assert "\u2019" in fixed
    assert "It" in fixed
    assert "isn" in fixed


def test_fix_quotes_no_quotes():
    text = "No quotes here."
    fixed, count = fix_quotes(text, "de")
    assert fixed == text
    assert count == 0


# --- Whitespace Fixing ---


def test_fix_double_spaces():
    text = "Hello  world   here."
    fixed, count = fix_whitespace(text)
    assert "  " not in fixed
    assert count >= 2


def test_fix_space_before_punctuation():
    text = "Hello , world . How are you ?"
    fixed, count = fix_whitespace(text)
    assert "Hello, world. How are you?" == fixed.strip()


def test_fix_missing_space_after_punctuation():
    text = "Hello.World,here"
    fixed, count = fix_whitespace(text)
    assert "Hello. World, here" == fixed


def test_fix_trailing_whitespace():
    text = "Line one   \nLine two  "
    fixed, count = fix_whitespace(text)
    assert not fixed.endswith(" ")
    lines = fixed.split("\n")
    assert all(line == line.rstrip() for line in lines)


# --- Dash Fixing ---


def test_fix_triple_hyphen_to_em_dash():
    text = "He said---and I quote---nothing."
    fixed, count = fix_dashes(text)
    assert "\u2014" in fixed
    assert count == 2


def test_fix_double_hyphen_to_en_dash():
    text = "Pages 10--20 are missing."
    fixed, count = fix_dashes(text)
    assert "\u2013" in fixed
    assert count == 1


def test_fix_dashes_no_change():
    text = "A single - hyphen is fine."
    fixed, count = fix_dashes(text)
    assert fixed == text
    assert count == 0


# --- Ellipsis Fixing ---


def test_fix_three_dots_to_ellipsis():
    text = "And then... silence."
    fixed, count = fix_ellipsis(text)
    assert "\u2026" in fixed
    assert count == 1


def test_fix_ellipsis_no_change():
    text = "Just one dot. And two dots.."
    fixed, count = fix_ellipsis(text)
    assert count == 0


# --- Full Sanitize ---


def test_sanitize_combines_all_fixes():
    text = 'Er sagte "Hallo"  und dann...'
    result = sanitize(text, language="de")
    assert result["changed"] is True
    assert result["total_fixes"] > 0
    assert "quotes" in result["fixes"]
    assert "whitespace" in result["fixes"]
    assert "ellipsis" in result["fixes"]


def test_sanitize_clean_text():
    text = "Perfekt formatierter Text."
    result = sanitize(text, language="de")
    assert result["total_fixes"] == 0
    assert result["changed"] is False
    assert result["sanitized"] == text


def test_sanitize_selective_fixes():
    text = 'He said "hello"  and then...'
    result = sanitize(text, language="en", fix_quote_marks=False, fix_ellipses=False)
    # Only whitespace and dashes should be fixed
    assert result["fixes"].get("quotes", 0) == 0
    assert result["fixes"].get("ellipsis", 0) == 0


def test_sanitize_returns_original_and_sanitized():
    text = 'Test  "text"'
    result = sanitize(text, language="de")
    assert result["original"] == text
    assert result["sanitized"] != text
    assert "original" in result
    assert "sanitized" in result


# --- Invisible Characters ---

from bibliogon_ms_tools.sanitizer import fix_html_artifacts, fix_invisible_chars


def test_fix_nbsp():
    text = "Hello\u00a0World"
    fixed, count = fix_invisible_chars(text)
    assert fixed == "Hello World"
    assert count == 1


def test_fix_zero_width_space():
    text = "Hello\u200bWorld"
    fixed, count = fix_invisible_chars(text)
    assert fixed == "HelloWorld"
    assert count == 1


def test_fix_bom():
    text = "\ufeffHello"
    fixed, count = fix_invisible_chars(text)
    assert fixed == "Hello"
    assert count == 1


def test_fix_soft_hyphen():
    text = "Buch\u00adstabe"
    fixed, count = fix_invisible_chars(text)
    assert fixed == "Buchstabe"
    assert count == 1


def test_fix_multiple_invisible():
    text = "\ufeffHello\u00a0\u200bWorld\u00ad"
    fixed, count = fix_invisible_chars(text)
    assert fixed == "Hello World"
    assert count == 4


# --- HTML Artifacts ---


def test_fix_empty_span():
    text = "Hello <span></span>World"
    fixed, count = fix_html_artifacts(text)
    assert "<span>" not in fixed
    assert count >= 1


def test_fix_style_attribute():
    text = '<p style="color:red">Text</p>'
    fixed, count = fix_html_artifacts(text)
    assert "style=" not in fixed


def test_fix_word_namespace_tags():
    text = "Hello <o:p></o:p> World"
    fixed, count = fix_html_artifacts(text)
    assert "<o:p>" not in fixed


def test_fix_html_comments():
    text = "Hello <!-- comment --> World"
    fixed, count = fix_html_artifacts(text)
    assert "<!--" not in fixed


def test_sanitize_includes_new_fixes():
    from bibliogon_ms_tools.sanitizer import sanitize

    text = "Hello\u00a0World <span></span>"
    result = sanitize(text, "en")
    assert result["changed"]
    assert "invisible_chars" in result["fixes"]
    assert "html_artifacts" in result["fixes"]


# --- HTML-aware quote/whitespace fixing (#805) ---
#
# fix_quotes and fix_whitespace originally walked the raw string with no
# concept of HTML markup, so an imported chapter's own <img>/<table>/etc
# tags got mangled the same way the prose did: an ASCII " inside an
# attribute value became a typographic quote, and the "missing space
# after punctuation" rule inserted a space right after the dot in a file
# extension (foo.png -> foo. png). Confirmed on the production library:
# 353 chapters across 30 books, not limited to <img> - also class, scope
# and lang attributes on section/figure/p/th/table.


class TestSanitizeIsHtmlAware:
    def _sanitized(self, html: str, language: str = "de") -> str:
        # fix_html=False: fix_html_artifacts strips class/style/span/div
        # UNCONDITIONALLY by design (it targets Word-paste cruft) - a
        # separate, scope-bearing concern from #805's fix_quotes/
        # fix_whitespace markup-corruption bug. Isolating it here keeps
        # this suite testing exactly what this fix touches. Tracked as
        # its own issue (#818).
        return sanitize(html, language, fix_html=False)["sanitized"]

    def test_prose_quotes_in_text_nodes_are_still_fixed_per_language(self):
        cases = {
            "de": ('<p>Er sagte "Hallo".</p>', "„", "“"),
            "en": ('<p>She said "Hello".</p>', "“", "”"),
            "fr": ('<p>Il a dit "Bonjour".</p>', "«", "»"),
            "es": ('<p>Ella dijo "Hola".</p>', "«", "»"),
        }
        for language, (html, open_mark, close_mark) in cases.items():
            result = self._sanitized(html, language)
            assert open_mark in result, f"{language}: missing opening mark in {result!r}"
            assert close_mark in result, f"{language}: missing closing mark in {result!r}"
            assert '"' not in result, f"{language}: ASCII quote survived in {result!r}"

    def test_img_src_is_never_touched(self):
        html = '<p>Sie sagte "Hallo".</p><img src="assets/figures/foo.png" alt="Bild" />'
        result = self._sanitized(html)
        assert 'src="assets/figures/foo.png"' in result

    def test_href_is_never_touched(self):
        html = '<p>Er las "das Buch".</p><a href="https://example.com/foo">Link</a>'
        result = self._sanitized(html)
        assert 'href="https://example.com/foo"' in result

    def test_class_attribute_is_never_touched(self):
        html = '<section class="chapter-intro">Text "mit Zitat".</section>'
        result = self._sanitized(html)
        assert 'class="chapter-intro"' in result

    def test_data_attribute_is_never_touched(self):
        html = '<p data-note="quelle \'x\'">Text "hier".</p>'
        result = self._sanitized(html)
        assert "data-note=\"quelle 'x'\"" in result

    def test_a_mixed_paragraph_with_image_and_quote_fixes_only_the_prose(self):
        html = (
            '<p>Wie sie "sagte": <img src="assets/figures/bild.png" alt="Illustration" />'
            " war es schoen.</p>"
        )
        result = self._sanitized(html)
        assert 'src="assets/figures/bild.png"' in result
        assert 'alt="Illustration"' in result
        assert "„" in result and "“" in result

    def test_filename_extension_never_gets_a_space_inserted(self):
        """fix_whitespace's missing-space-after-punctuation rule is the
        other half of the same corruption class - a dot followed by a
        letter inside an attribute value is a file extension, not a
        sentence boundary."""
        html = '<img src="assets/figures/bild.png" alt="Bild" />'
        result = self._sanitized(html)
        assert "bild.png" in result
        assert "bild. png" not in result

    def test_sanitizing_html_twice_is_idempotent(self):
        html = '<p>Er sagte "Hallo".</p><img src="assets/figures/foo.png" alt="Bild" />'
        once = self._sanitized(html)
        twice = self._sanitized(once)
        assert once == twice

    def test_plain_text_with_no_markup_still_works_exactly_as_before(self):
        """Non-HTML input (the /sanitize endpoint's normal case) must
        not be affected by the HTML-detection branch."""
        result = self._sanitized('Er sagte "Hallo" zu ihr.')
        assert "„" in result and "“" in result
