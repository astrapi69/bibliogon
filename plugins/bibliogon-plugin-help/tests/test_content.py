"""Tests for help content provider."""

from bibliogon_help.content import get_about, get_faq, get_shortcuts


SAMPLE_CONFIG = {
    "shortcuts": [
        {"keys": "Ctrl+B", "action": {"de": "Fett", "en": "Bold"}},
        {"keys": "Ctrl+I", "action": {"de": "Kursiv", "en": "Italic"}},
    ],
    "faq": [
        {
            "question": {"de": "Wie exportiere ich?", "en": "How to export?"},
            "answer": {"de": "Via Sidebar.", "en": "Via sidebar."},
        },
    ],
}


class TestGetShortcuts:

    def test_german(self) -> None:
        result = get_shortcuts(SAMPLE_CONFIG, "de")
        assert len(result) == 2
        assert result[0]["keys"] == "Ctrl+B"
        assert result[0]["action"] == "Fett"

    def test_english(self) -> None:
        result = get_shortcuts(SAMPLE_CONFIG, "en")
        assert result[0]["action"] == "Bold"

    def test_empty_config(self) -> None:
        assert get_shortcuts({}) == []


class TestGetFaq:

    def test_german(self) -> None:
        result = get_faq(SAMPLE_CONFIG, "de")
        assert len(result) == 1
        assert result[0]["question"] == "Wie exportiere ich?"
        assert result[0]["answer"] == "Via Sidebar."

    def test_english(self) -> None:
        result = get_faq(SAMPLE_CONFIG, "en")
        assert result[0]["question"] == "How to export?"

    def test_empty_config(self) -> None:
        assert get_faq({}) == []


class TestGetAbout:

    def test_returns_info(self) -> None:
        info = get_about()
        assert info["name"] == "Bibliogon"
        assert "github" in info["website"]
