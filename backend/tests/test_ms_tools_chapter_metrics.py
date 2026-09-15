"""Coverage for ms-tools' two chapter-content-reading handlers
(#824 class fix, extended in #835).

``chapter_metrics`` used to route chapter content through a hand-rolled
duplicate of the shared TipTap-text extractor (``_extract_text``) that
had no HTML fallback: an imported, never-opened chapter (#787) is HTML,
so the JSON parse failed and the raw markup was fed into readability
and style analysis unchanged. The #806 audit's own docstring on
``app.services.html_text`` claimed ms-tools was fully covered via
plugin-audiobook's shared extractor - true for the ``analyze_and_export``
handler, but ``chapter_metrics`` used a second, separate walker in the
same file that the audit missed.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _create_book(client: TestClient) -> str:
    r = client.post("/api/books", json={"title": "Metrics Book", "author": "Aster"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _create_chapter(client: TestClient, book_id: str, content: str) -> None:
    r = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": "Imported Chapter", "content": content},
    )
    assert r.status_code == 201, r.text


def _cleanup(client: TestClient, book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def test_html_imported_chapter_gets_real_readability_metrics_not_zero() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            _create_chapter(
                client,
                book_id,
                '<p class="intro">Ein Buch über Bewusstsein und Zeit, '
                "geschrieben mit <strong>viel</strong> Sorgfalt.</p>",
            )
            r = client.get(f"/api/ms-tools/metrics/{book_id}")
            assert r.status_code == 200, r.text
            rows = r.json()["chapters"]
            assert len(rows) == 1
            row = rows[0]
            assert row.get("empty") is not True

            # ``long_sentences`` carries the analysed text verbatim, so
            # it is the one field that proves WHICH text the metrics
            # were computed from. Pre-fix this contained the raw markup
            # (tag names and the class attribute counted as words);
            # post-fix it is the stripped prose.
            analysed = " ".join(s["text"] for s in row["long_sentences"])
            assert "Bewusstsein" in analysed
            assert "<p" not in analysed
            assert "<strong>" not in analysed
            assert "class=" not in analysed
            assert "intro" not in analysed
        finally:
            _cleanup(client, book_id)


def test_real_tiptap_json_chapter_still_works() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            content = (
                '{"type":"doc","content":[{"type":"paragraph",'
                '"content":[{"type":"text","text":'
                '"Dieser Satz ist bereits im Editor gespeichert worden."}]}]}'
            )
            _create_chapter(client, book_id, content)
            r = client.get(f"/api/ms-tools/metrics/{book_id}")
            assert r.status_code == 200, r.text
            row = r.json()["chapters"][0]
            assert row["word_count"] > 0
        finally:
            _cleanup(client, book_id)


class TestMetricsExportHandler:
    """The second content-reading handler in the same file (#835).

    ``chapter_metrics`` above and ``export_metrics`` here are the two
    places ms-tools turns chapter content into plain text. Only the
    first had coverage, which is how the cross-plugin import in this
    one stayed invisible.
    """

    def test_html_imported_chapter_is_analysed_as_prose_not_markup(self) -> None:
        with TestClient(app) as client:
            book_id = _create_book(client)
            try:
                _create_chapter(
                    client,
                    book_id,
                    '<p class="intro">Ein Buch über Bewusstsein und Zeit, '
                    "geschrieben mit <strong>viel</strong> Sorgfalt.</p>",
                )
                r = client.post(
                    "/api/ms-tools/metrics/export",
                    json={"book_id": book_id, "format": "json"},
                )
                assert r.status_code == 200, r.text
                rows = r.json()["chapters"]
                assert len(rows) == 1
                # NOT a regression pin: this handler was already correct
                # before #835 (it used plugin-audiobook's extractor,
                # fixed in #806). It simply had no test, which is how
                # the undeclared cross-plugin import here stayed
                # invisible. The word count is the observable this
                # handler exposes - stripped prose is 10 words, the raw
                # markup would tokenise to 16.
                assert rows[0]["word_count"] == 10
            finally:
                _cleanup(client, book_id)

    def test_csv_export_of_an_html_chapter_succeeds(self) -> None:
        with TestClient(app) as client:
            book_id = _create_book(client)
            try:
                _create_chapter(client, book_id, "<p>Ein kurzer Satz über Bewusstsein.</p>")
                r = client.post(
                    "/api/ms-tools/metrics/export",
                    json={"book_id": book_id, "format": "csv"},
                )
                assert r.status_code == 200, r.text
                body = r.text
                assert "Imported Chapter" in body
                assert "<p>" not in body
            finally:
                _cleanup(client, book_id)
