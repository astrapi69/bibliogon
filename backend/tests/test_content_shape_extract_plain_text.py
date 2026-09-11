"""Regression tests for extract_plain_text's HTML branch (#806).

Chapter.content is HTML until someone opens and saves a chapter in the
editor (#787). extract_plain_text (plugin-audiobook, cross-imported by
plugin-ms-tools) fell through to returning the raw HTML string on a
JSONDecodeError: TTS would read markup aloud, and the style checker's
word/sentence counts would include tag names as words. Both consumers
are covered here because they share the exact same function.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


class TestExtractPlainTextDirect:
    """Exercises the fixed function directly - this is the shared
    surface both plugin-audiobook's TTS and plugin-ms-tools' metrics
    endpoint delegate to."""

    def test_html_content_is_stripped_not_returned_raw(self) -> None:
        from bibliogon_audiobook.generator import extract_plain_text

        result = extract_plain_text("<p>Ein ganzer <strong>Satz</strong>.</p>")
        assert result == "Ein ganzer Satz."
        assert "<" not in result

    def test_tiptap_json_dict_content_still_works(self) -> None:
        from bibliogon_audiobook.generator import extract_plain_text

        doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Aus JSON."}]}],
        }
        assert extract_plain_text(doc) == "Aus JSON."

    def test_tiptap_json_string_content_still_works(self) -> None:
        from bibliogon_audiobook.generator import extract_plain_text

        doc_json = (
            '{"type":"doc","content":[{"type":"paragraph",'
            '"content":[{"type":"text","text":"Aus JSON-String."}]}]}'
        )
        assert extract_plain_text(doc_json) == "Aus JSON-String."

    def test_genuine_plain_text_passes_through_unchanged(self) -> None:
        from bibliogon_audiobook.generator import extract_plain_text

        assert extract_plain_text("Nur Text, kein Markup.") == "Nur Text, kein Markup."

    def test_empty_and_whitespace_content_return_empty_string(self) -> None:
        from bibliogon_audiobook.generator import extract_plain_text

        assert extract_plain_text("") == ""
        assert extract_plain_text("   ") == ""
        assert extract_plain_text(None) == ""


class TestMsToolsMetricsExportOnImportedContent:
    """The real path: ms-tools cross-imports extract_plain_text at
    routes.py:236. A word count that includes literal tag names is not
    a metrics bug someone would think to report - it just quietly
    produces wrong numbers forever."""

    def test_html_chapter_word_count_excludes_markup(self, client: TestClient) -> None:
        book = client.post(
            "/api/books", json={"title": "Metrics Probe", "author": "A", "language": "de"}
        ).json()
        client.post(
            f"/api/books/{book['id']}/chapters",
            json={
                "title": "K1",
                "content": "<p>Ein zwei drei vier fuenf sechs sieben acht.</p>",
            },
        )

        response = client.post(
            "/api/ms-tools/metrics/export", json={"book_id": book["id"], "format": "json"}
        )
        assert response.status_code == 200, response.text
        rows = response.json()["chapters"]
        chapter_row = next(row for row in rows if row.get("chapter") == "K1")
        # Eight real words. If markup leaked through as literal words
        # ("p", "strong", ...) the count would be higher and wrong.
        assert chapter_row["word_count"] == 8
