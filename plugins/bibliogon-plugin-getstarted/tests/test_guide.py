"""Tests for get-started guide content."""

from bibliogon_getstarted.guide import get_guide_steps, get_sample_book_data


SAMPLE_CONFIG = {
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


class TestGetGuideSteps:

    def test_german(self) -> None:
        steps = get_guide_steps(SAMPLE_CONFIG, "de")
        assert len(steps) == 2
        assert steps[0]["id"] == "create-book"
        assert steps[0]["title"] == "Buch erstellen"
        assert steps[0]["icon"] == "book-plus"

    def test_english(self) -> None:
        steps = get_guide_steps(SAMPLE_CONFIG, "en")
        assert steps[0]["title"] == "Create a Book"

    def test_empty_config(self) -> None:
        assert get_guide_steps({}) == []


class TestGetSampleBookData:

    def test_german(self) -> None:
        data = get_sample_book_data(SAMPLE_CONFIG, "de")
        assert data["title"] == "Mein erstes Buch"
        assert data["author"] == "Bibliogon"
        assert len(data["chapters"]) == 2
        assert data["chapters"][0]["title"] == "Willkommen"
        assert data["chapters"][0]["content"] == "Hallo Welt!"

    def test_english(self) -> None:
        data = get_sample_book_data(SAMPLE_CONFIG, "en")
        assert data["title"] == "My First Book"
        assert data["chapters"][0]["content"] == "Hello World!"

    def test_empty_config(self) -> None:
        data = get_sample_book_data({})
        assert data["title"] == "My First Book"
        assert data["chapters"] == []
