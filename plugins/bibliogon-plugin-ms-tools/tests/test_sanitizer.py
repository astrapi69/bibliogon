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
        # fix_html stays ON: this suite now exercises the real default.
        # It was disabled while the class rule removed EVERY class
        # attribute, which would have destroyed these fixtures' structural
        # markup for reasons unrelated to #805's quote/whitespace bug;
        # #818 made that rule per-token, so the two no longer collide.
        return sanitize(html, language)["sanitized"]

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


# --- Uppercase tags (#934) ---
#
# Word emits uppercase tags, which is the input fix_html_artifacts exists
# for, and it did nothing against them: its rules were case-sensitive. The
# walker made it worse than a no-op - it re-emitted start tags verbatim but
# rebuilt end tags from HTMLParser's lower-cased name, so `<SPAN>a</SPAN>`
# became `<SPAN>a</span>`, the span rule then matched the closing half only,
# and unbalanced markup was written back into the chapter.


class TestUppercaseTags:
    def test_uppercase_div_is_stripped_at_both_ends(self):
        fixed, count = fix_html_artifacts("<DIV>Uppercase</DIV>")
        assert fixed == "Uppercase"
        assert count == 2

    def test_mixed_case_pair_is_stripped(self):
        fixed, _ = fix_html_artifacts("<DIV>Mixed</div>")
        assert fixed == "Mixed"

    def test_uppercase_empty_tag_is_removed(self):
        fixed, count = fix_html_artifacts("Hallo <SPAN></SPAN>Welt")
        assert fixed == "Hallo Welt"
        assert count >= 1

    def test_uppercase_style_and_class_attributes_are_stripped(self):
        fixed, _ = fix_html_artifacts('<P STYLE="color:red" CLASS="MsoNormal">Text</P>')
        assert "STYLE=" not in fixed
        assert "CLASS=" not in fixed
        assert "<P>Text</P>" == fixed

    def test_uppercase_word_namespace_tags_are_stripped(self):
        fixed, _ = fix_html_artifacts("Hallo <O:P></O:P> Welt")
        assert "O:P" not in fixed

    def test_sanitize_leaves_no_unbalanced_tag_behind(self):
        """The regression that made this worse than a no-op: one half of a
        tag pair stripped, the other half written back into the chapter."""
        result = sanitize('<SPAN style="x">a</SPAN>')["sanitized"]
        assert "<SPAN>" not in result
        assert "</SPAN>" not in result
        assert result == "a"

    def test_sanitize_preserves_end_tag_casing_of_tags_it_keeps(self):
        """The walker's own docstring promises every tag comes back
        byte-for-byte; it lower-cased end tags, which is what let the
        case-sensitive rules half-match."""
        result = sanitize("<P>Ein Satz.</P>")["sanitized"]
        assert result == "<P>Ein Satz.</P>"

    def test_uppercase_markup_stays_html_aware(self):
        """Uppercase attributes must not be touched by the text fixes."""
        result = sanitize('<P TITLE="a \'b\'">Er sagte "hallo"...</P>', "de")["sanitized"]
        assert "TITLE=\"a 'b'\"" in result
        assert "Er sagte „hallo“…" in result


# --- Fragment boundaries (#939) ---
#
# fix_whitespace ends with a per-line trailing trim. On a whole document
# that is right. Since #805 it runs once per TEXT NODE, and a text node's
# last line is usually not a line end at all - it is the middle of a
# sentence, cut where the next tag begins. rstrip() then removed a space
# that was carrying meaning, gluing the word before an inline tag onto
# whatever the tag rendered.


class TestFragmentBoundaries:
    def _sanitized(self, text: str, language: str = "de") -> str:
        return sanitize(text, language)["sanitized"]

    def test_space_before_an_inline_tag_survives(self):
        result = self._sanitized("<p>Ein <em>Satz</em> mit <strong>Markup</strong>.</p>")
        assert result == "<p>Ein <em>Satz</em> mit <strong>Markup</strong>.</p>"

    def test_space_before_an_embedded_image_survives(self):
        """The shape the walker was built for: markdown prose with one
        raw <img> in it routes the WHOLE chapter through the walker."""
        markdown = 'Ein Satz mit einem Bild <img src="assets/figures/a.png" alt="Bild" /> im Text.'
        assert self._sanitized(markdown) == markdown

    def test_space_after_an_end_tag_survives(self):
        result = self._sanitized("<p><em>Kursiv</em> danach.</p>")
        assert "</em> danach." in result

    def test_a_real_line_end_inside_a_text_node_is_still_trimmed(self):
        """Only the LAST line of a fragment is a boundary the fragment
        does not own. Earlier lines end where they say they end."""
        result = self._sanitized("<p>Erste Zeile   \nZweite Zeile</p>")
        assert "Zeile   \n" not in result
        assert "Erste Zeile\nZweite Zeile" in result

    def test_plain_text_keeps_the_per_line_trim(self):
        """No markup means the raw-string branch, where the trim is
        correct and must stay."""
        assert self._sanitized("Zeile eins   \nZeile zwei   ") == "Zeile eins\nZeile zwei"

    def test_double_spaces_are_still_collapsed_inside_a_fragment(self):
        result = self._sanitized("<p>Zu    viele Leerzeichen <em>hier</em>.</p>")
        assert "Zu viele Leerzeichen <em>hier</em>." in result

    def test_a_document_ending_in_whitespace_after_a_tag_keeps_one_space(self):
        """Accepted trade-off. The final text node is a fragment like any
        other, and the walker cannot tell mid-stream that it is the last
        one, so its trailing whitespace is kept. A single space at the very
        end of a document is cosmetic; eating a space in the middle of a
        sentence was not. The client port behaves identically."""
        assert self._sanitized("<p>Ende.</p>   ") == "<p>Ende.</p> "

    def test_sanitizing_html_twice_is_still_idempotent(self):
        html = '<p>Ein <em>Satz</em> mit "Zitat" <img src="a.png" alt="B" /> Ende.</p>'
        once = self._sanitized(html)
        assert self._sanitized(once) == once


# --- Structural classes (#818) ---
#
# The class rule removed EVERY `class="..."`, Word-originated or not. Its
# docstring framed it as Word-paste cleanup, but the regex could not tell
# `MsoNormal` from the structural classes the project's own exporter
# writes (`<div class="dedication">`, `epigraph`, `part`, …) or from
# anything a book's `custom_css` targets. A damage scan on the production
# library counted 156 `class="..."` occurrences on section/figure/p/img
# tags across imported chapters, all of which the default `fix_html`
# would delete.
#
# The rule is now per-token and conservative: a token is removed only
# when it MATCHES a known paste-cruft shape. Anything unrecognised is
# presumed intentional and kept, so a class shape nobody has catalogued
# yet survives rather than being destroyed.


class TestStructuralClasses:
    def test_a_word_class_is_still_removed(self):
        fixed, count = fix_html_artifacts('<p class="MsoNormal">Text</p>')
        assert fixed == "<p>Text</p>"
        assert count == 1

    def test_a_structural_class_survives(self):
        html = '<section class="dedication">Fuer Mira</section>'
        assert fix_html_artifacts(html)[0] == html

    def test_a_mixed_attribute_keeps_only_the_structural_token(self):
        """The case the all-or-nothing regex could not express."""
        fixed, _ = fix_html_artifacts('<p class="MsoNormal dedication">Text</p>')
        assert fixed == '<p class="dedication">Text</p>'

    def test_google_docs_classes_are_removed(self):
        fixed, _ = fix_html_artifacts('<p class="c1 c12">Text</p>')
        assert fixed == "<p>Text</p>"

    def test_a_kix_class_is_removed(self):
        fixed, _ = fix_html_artifacts('<span class="kix-wrapper">x</span>')
        assert "kix-" not in fixed

    def test_a_word_section_wrapper_is_removed(self):
        fixed, _ = fix_html_artifacts('<section class="WordSection1">Text</section>')
        assert fixed == "<section>Text</section>"

    def test_an_unknown_class_is_kept_rather_than_guessed_at(self):
        """Conservative by construction: not recognised means not touched."""
        html = '<section class="chapter-intro layout-wide">Text</section>'
        assert fix_html_artifacts(html)[0] == html

    def test_an_empty_class_attribute_is_removed(self):
        fixed, _ = fix_html_artifacts('<p class="">Text</p>')
        assert fixed == "<p>Text</p>"

    def test_the_exporter_s_own_chapter_wrapper_names_all_survive(self):
        """`scaffolder.py` writes these around front/back-matter chapters,
        and a book's custom_css styles them.

        Asserted on `<section>`: the wrappers themselves are `<div>`, and
        the separate div rule deletes every div whatever its class - a
        wider instance of this same over-broad-removal class, filed on its
        own rather than widened into here.
        """
        for name in ("dedication", "epigraph", "imprint", "part", "also-by-author"):
            html = f'<section class="{name}">Text</section>'
            assert fix_html_artifacts(html)[0] == html, name

    def test_counts_one_replacement_per_changed_attribute(self):
        _, count = fix_html_artifacts(
            '<p class="MsoNormal">A</p><p class="dedication">B</p><p class="c1">C</p>'
        )
        assert count == 2


class TestClassRuleScalesLinearly:
    """#949/CodeQL: the class rule backtracked quadratically (`py/polynomial-redos`).

    ``(\\s+)class="..."`` lets a run of k spaces start a match attempt at
    every one of its k positions, so a chapter carrying a long whitespace
    run that no class attribute follows costs O(n^2). Measured on the
    pre-fix rule: 2k spaces 0.018s, 4k 0.072s, 8k 0.283s, 16k 1.02s - a
    clean fourfold per doubling. Imported chapter HTML is user-provided,
    which is what makes it a finding rather than a nit.
    """

    def test_a_long_whitespace_run_does_not_blow_up(self):
        """On the rule itself, not on ``fix_html_artifacts``.

        The two ``\\s+style="..."`` rules in that function have the same
        shape and are worse still - 23s and 25s on this payload - but
        they predate this change and are reported separately rather than
        folded in here, so pinning the whole function would pin their
        cost instead of this fix.

        The bound is deliberately loose: the fixed rule needs about a
        millisecond, the broken one 17 seconds, so a slow or contended
        runner cannot flip it either way.
        """
        import time

        from bibliogon_ms_tools.sanitizer import _strip_paste_classes

        payload = "<p" + " " * 64_000 + "x>"
        start = time.perf_counter()
        _strip_paste_classes(payload)
        assert time.perf_counter() - start < 5.0

    def test_the_whitespace_run_is_still_consumed_and_preserved(self):
        """The guard against fixing the cost by changing the behaviour."""
        assert fix_html_artifacts('<p\n\tclass="MsoNormal">x</p>')[0] == "<p>x</p>"
        assert fix_html_artifacts('<p  class="MsoNormal dedication">x</p>')[0] == (
            '<p  class="dedication">x</p>'
        )

    def test_a_second_attribute_right_after_the_first_still_matches(self):
        """The scan must not consume the separator the next attribute needs.

        On ``<section>`` rather than ``<div>`` for the reason the
        structural-class test above gives: the div rule would delete the
        tag before its attributes mattered (#948).
        """
        fixed, count = fix_html_artifacts('<section class="MsoNormal" class="c1">x</section>')
        assert fixed == "<section>x</section>"
        assert count == 2
