"""Tests for BookContext assembly + missing-required-field detection
(#825).

``book`` is duck-typed (a SimpleNamespace here, an ``app.models.Book``
ORM row in production) so ``bibliogon_aplus.book_context`` stays free
of SQLAlchemy, matching the existing ``app.ai.template_factories``
convention - but the module DOES import ``app.services.html_text``
for HTML-safe description extraction, so (like
``test_promotion_portfolio.py`` / ``test_kdp_package.py``) this test
lives in backend/tests/ rather than the plugin's own isolated venv,
which has no ``app`` package on its path.
"""

from __future__ import annotations

from types import SimpleNamespace

from bibliogon_aplus.book_context import build_book_context, find_missing_fields


def _book(**overrides) -> SimpleNamespace:
    defaults = dict(
        id="b1",
        title="The Formable Eternity",
        subtitle="A philosophical journey",
        author="Aster Raptis",
        language="en",
        genre=None,
        book_type="prose",
        description="A quiet meditation on consciousness and time.",
        html_description=None,
        backpage_description=None,
        bisac_codes='["FIC022020"]',
        categories='["Fiction > Fantasy"]',
        keywords='["philosophy", "consciousness"]',
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class TestBuildBookContext:
    def test_reads_the_plain_description_when_present(self) -> None:
        context = build_book_context(_book())
        assert "quiet meditation" in context.description_text

    def test_falls_back_to_html_description_when_description_is_empty(self) -> None:
        book = _book(
            description=None,
            html_description="<p>An imported book's <strong>Amazon</strong> blurb.</p>",
        )
        context = build_book_context(book)
        assert "imported book's Amazon blurb" in context.description_text
        assert "<p>" not in context.description_text
        assert "<strong>" not in context.description_text

    def test_falls_back_to_backpage_description_last(self) -> None:
        book = _book(description=None, html_description=None, backpage_description="Backpage text.")
        context = build_book_context(book)
        assert context.description_text == "Backpage text."

    def test_html_with_typographic_quotes_around_an_image_tag_does_not_break_extraction(
        self,
    ) -> None:
        """The exact #789 shape: an imported chapter's HTML can carry
        broken markup elsewhere in the document, but description
        extraction must still recover the readable prose."""
        book = _book(
            description=None,
            html_description=(
                "<p>Ein Buch über Bewusstsein.</p>"
                '<img src="assets/figures/cover.png" alt="Cover" />'
            ),
        )
        context = build_book_context(book)
        assert "Bewusstsein" in context.description_text

    def test_genre_key_is_lowercased(self) -> None:
        context = build_book_context(_book(genre="Kinderbuch"))
        assert context.genre_key == "kinderbuch"

    def test_genre_key_falls_back_to_juvenile_bisac_prefix(self) -> None:
        book = _book(genre=None, bisac_codes='["JUV002000"]')
        context = build_book_context(book)
        assert context.genre_key == "kinderbuch"

    def test_genre_key_is_none_when_neither_signal_is_present(self) -> None:
        context = build_book_context(_book(genre=None, bisac_codes=None))
        assert context.genre_key is None

    def test_genre_key_falls_back_to_picture_book_type(self) -> None:
        """#828: 0/44 live books carry a BISAC code; book_type is a
        far more common explicit signal for a children's title."""
        book = _book(genre=None, bisac_codes=None, book_type="picture_book")
        context = build_book_context(book)
        assert context.genre_key == "kinderbuch"

    def test_genre_key_falls_back_to_a_juvenile_text_marker_in_the_description(self) -> None:
        """#828: the real 'Die Abenteuer von Fips' catalog book has no
        genre, no BISAC, and book_type='prose' - the only signal left
        is the free-text description mentioning 'Kinderbuchserie'."""
        book = _book(
            title="Die Abenteuer von Fips",
            genre=None,
            bisac_codes=None,
            book_type="prose",
            description=("Kinderbuchserie über Fips, den kleinen Fuchs, und seine Freunde."),
        )
        context = build_book_context(book)
        assert context.genre_key == "kinderbuch"

    def test_genre_key_text_marker_is_also_checked_in_the_title(self) -> None:
        book = _book(
            title="My Favorite Picture Book",
            genre=None,
            bisac_codes=None,
            book_type="prose",
            description="A story for young readers.",
        )
        context = build_book_context(book)
        assert context.genre_key == "kinderbuch"

    def test_genre_key_text_marker_does_not_false_positive_on_unrelated_prose(self) -> None:
        context = build_book_context(_book(genre=None, bisac_codes=None))
        assert context.genre_key is None

    def test_explicit_genre_field_wins_over_the_picture_book_type_fallback(self) -> None:
        book = _book(genre="scifi", bisac_codes=None, book_type="picture_book")
        context = build_book_context(book)
        assert context.genre_key == "scifi"

    def test_bisac_and_categories_are_decoded_from_json_text(self) -> None:
        context = build_book_context(_book())
        assert context.bisac_codes == ["FIC022020"]
        assert context.categories == ["Fiction > Fantasy"]

    def test_malformed_json_column_decodes_to_an_empty_list(self) -> None:
        context = build_book_context(_book(bisac_codes="not json"))
        assert context.bisac_codes == []


class TestFindMissingFields:
    def test_a_complete_book_has_no_missing_fields(self) -> None:
        assert find_missing_fields(_book()) == []

    def test_missing_author_is_reported(self) -> None:
        missing = find_missing_fields(_book(author=None))
        assert any(m.field == "author" for m in missing)

    def test_blank_author_is_reported(self) -> None:
        missing = find_missing_fields(_book(author="   "))
        assert any(m.field == "author" for m in missing)

    def test_missing_every_description_source_is_reported(self) -> None:
        missing = find_missing_fields(
            _book(description=None, html_description=None, backpage_description=None)
        )
        assert any(m.field == "description" for m in missing)

    def test_any_one_description_source_present_is_enough(self) -> None:
        missing = find_missing_fields(_book(description=None, html_description="<p>Ok.</p>"))
        assert not any(m.field == "description" for m in missing)
