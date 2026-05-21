"""Tests for get-started guide content."""

from bibliogon_getstarted.guide import get_guide_steps, get_sample_book_data


# Legacy fixture (singular ``sample_book``) — preserved to pin the
# backward-compat code path in guide.py. Pre-MULTIBOOK-TYPES configs
# + user-overlays with the old key continue to work for the
# prose-default case.
LEGACY_CONFIG = {
    "guide": {
        "steps": [
            {
                "id": "create-book",
                "title": {"de": "Buch erstellen", "en": "Create a Book"},
                "description": {"de": "Klicke auf Neues Buch.", "en": "Click New Book."},
                "icon": "book-plus",
            },
            {
                "id": "write",
                "title": {"de": "Schreiben", "en": "Write"},
                "description": {"de": "Nutze den Editor.", "en": "Use the editor."},
                "icon": "pen-tool",
            },
        ],
    },
    "sample_book": {
        "title": {"de": "Mein erstes Buch", "en": "My First Book"},
        "author": "Bibliogon",
        "language": "de",
        "description": {"de": "Ein Beispielbuch", "en": "A sample book"},
        "chapters": [
            {
                "title": {"de": "Willkommen", "en": "Welcome"},
                "content": {"de": "Hallo Welt!", "en": "Hello World!"},
            },
            {
                "title": {"de": "Zweites Kapitel", "en": "Second Chapter"},
                "content": {"de": "Mehr Inhalt.", "en": "More content."},
            },
        ],
    },
}


# Canonical fixture (``sample_books`` dict keyed by book_type) —
# matches the live ``getstarted.yaml`` shape shipped in
# GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C1.
MULTI_BOOK_CONFIG = {
    "guide": {
        "steps": [
            {
                "id": "choose-book-type",
                "title": {"de": "Buchtyp wählen", "en": "Choose Book Type"},
                "description": {"de": "Wähle den Typ.", "en": "Pick the type."},
                "icon": "book-open",
            },
            {
                "id": "create-book",
                "title": {"de": "Buch erstellen", "en": "Create a Book"},
                "description": {"de": "Klicke auf Neues Buch.", "en": "Click New Book."},
                "icon": "book-plus",
            },
        ],
    },
    "sample_books": {
        "prose": {
            "title": {"de": "Mein erstes Buch", "en": "My First Book"},
            "author": "Bibliogon",
            "language": "de",
            "book_type": "prose",
            "description": {"de": "Ein Beispielbuch", "en": "A sample book"},
            "chapters": [
                {
                    "title": {"de": "Willkommen", "en": "Welcome"},
                    "content": {"de": "Hallo!", "en": "Hello!"},
                },
            ],
        },
        "picture_book": {
            "title": {"de": "Mein erstes Bilderbuch", "en": "My First Picture Book"},
            "author": "Bibliogon",
            "language": "de",
            "book_type": "picture_book",
            "description": {"de": "Bilderbuch-Demo", "en": "Picture book demo"},
            "pages": [
                {
                    "layout": "image_top_text_bottom",
                    "text_content": {"de": "Willkommen!", "en": "Welcome!"},
                },
                {
                    "layout": "text_only",
                    "text_content": {"de": "Reine Textseite.", "en": "Text-only page."},
                },
            ],
        },
        "comic_book": {
            "title": {"de": "Mein erstes Comicbuch", "en": "My First Comic Book"},
            "author": "Bibliogon",
            "language": "de",
            "book_type": "comic_book",
            "description": {"de": "Comicbuch-Demo", "en": "Comic book demo"},
            "pages": [
                {
                    "layout": "comic_panel_grid",
                    "layout_config": {"comic_grid_template": "single_panel"},
                },
            ],
        },
    },
}


class TestGetGuideSteps:

    def test_german(self) -> None:
        steps = get_guide_steps(LEGACY_CONFIG, "de")
        assert len(steps) == 2
        assert steps[0]["id"] == "create-book"
        assert steps[0]["title"] == "Buch erstellen"
        assert steps[0]["icon"] == "book-plus"

    def test_english(self) -> None:
        steps = get_guide_steps(LEGACY_CONFIG, "en")
        assert steps[0]["title"] == "Create a Book"

    def test_empty_config(self) -> None:
        assert get_guide_steps({}) == []


class TestGetSampleBookData:

    # --- Legacy backward-compat ---

    def test_legacy_german(self) -> None:
        """Pre-MULTIBOOK configs with singular ``sample_book`` still work
        when the caller asks for prose."""
        data = get_sample_book_data(LEGACY_CONFIG, "de")
        assert data["title"] == "Mein erstes Buch"
        assert data["author"] == "Bibliogon"
        assert data["book_type"] == "prose"
        assert len(data["chapters"]) == 2
        assert data["chapters"][0]["title"] == "Willkommen"
        assert data["chapters"][0]["content"] == "Hallo Welt!"

    def test_legacy_english(self) -> None:
        data = get_sample_book_data(LEGACY_CONFIG, "en")
        assert data["title"] == "My First Book"
        assert data["chapters"][0]["content"] == "Hello World!"

    def test_legacy_config_ignored_for_non_prose(self) -> None:
        """Legacy singular ``sample_book`` is prose-only by definition;
        non-prose requests against a legacy config fall through to empty
        defaults (no chapters AND no pages bleed-through)."""
        data = get_sample_book_data(LEGACY_CONFIG, "de", book_type="picture_book")
        # Empty fallback: title stays the empty-defaults sentinel,
        # pages list is empty, no chapters key at all.
        assert data["title"] == "My First Book"
        assert data["book_type"] == "picture_book"
        assert data["pages"] == []
        assert "chapters" not in data

    def test_empty_config(self) -> None:
        data = get_sample_book_data({})
        assert data["title"] == "My First Book"
        assert data["chapters"] == []

    # --- New sample_books dict ---

    def test_prose_from_dict(self) -> None:
        data = get_sample_book_data(MULTI_BOOK_CONFIG, "de", book_type="prose")
        assert data["title"] == "Mein erstes Buch"
        assert data["book_type"] == "prose"
        assert len(data["chapters"]) == 1
        assert data["chapters"][0]["content"] == "Hallo!"

    def test_picture_book(self) -> None:
        data = get_sample_book_data(MULTI_BOOK_CONFIG, "de", book_type="picture_book")
        assert data["title"] == "Mein erstes Bilderbuch"
        assert data["book_type"] == "picture_book"
        assert "chapters" not in data
        assert len(data["pages"]) == 2
        assert data["pages"][0]["layout"] == "image_top_text_bottom"
        assert data["pages"][0]["text_content"] == "Willkommen!"
        assert data["pages"][1]["layout"] == "text_only"

    def test_picture_book_english(self) -> None:
        data = get_sample_book_data(MULTI_BOOK_CONFIG, "en", book_type="picture_book")
        assert data["title"] == "My First Picture Book"
        assert data["pages"][0]["text_content"] == "Welcome!"

    def test_comic_book(self) -> None:
        data = get_sample_book_data(MULTI_BOOK_CONFIG, "de", book_type="comic_book")
        assert data["title"] == "Mein erstes Comicbuch"
        assert data["book_type"] == "comic_book"
        assert "chapters" not in data
        assert len(data["pages"]) == 1
        page = data["pages"][0]
        assert page["layout"] == "comic_panel_grid"
        # ``layout_config`` is pass-through (not localized) — its
        # ``comic_grid_template`` key is consumed downstream by the
        # comic-book editor.
        assert page["layout_config"] == {"comic_grid_template": "single_panel"}

    def test_unknown_book_type_falls_back_to_prose(self) -> None:
        """Unknown values normalise to prose (the BOOK_TYPES gate in
        get_sample_book_data). Prevents 422/500s from typo'd query
        params."""
        data = get_sample_book_data(MULTI_BOOK_CONFIG, "de", book_type="manga")
        # Normalised to prose -> prose dict from MULTI_BOOK_CONFIG.
        assert data["book_type"] == "prose"
        assert "chapters" in data

    def test_dict_takes_precedence_over_legacy_singular(self) -> None:
        """If both ``sample_books`` (new) and ``sample_book`` (legacy)
        are present, the new dict wins."""
        config = {
            **MULTI_BOOK_CONFIG,
            "sample_book": {  # legacy with different title
                "title": {"de": "LEGACY", "en": "LEGACY"},
                "chapters": [],
            },
        }
        data = get_sample_book_data(config, "de", book_type="prose")
        assert data["title"] == "Mein erstes Buch"  # from new dict, not LEGACY
