"""Chapter-snapshot flattening + diffing (#847).

``snapshot_plain_text`` handled two content shapes - TipTap JSON and
legacy plain text - and had no HTML branch. An imported, never-opened
chapter is HTML (#787), so the version-history diff showed raw markup:
every tag counted as diff content, and a snapshot taken before an edit
diffed against tags rather than prose.

Its sibling ``writing_stats.count_words`` got exactly that branch in
#824; this module was missed because it delegates the node walk to
``_flatten_tiptap`` and so never looked like a hand-rolled walker.

The module had no tests at all, which is why nothing caught it.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app
from app.services.chapter_snapshots import line_diff, snapshot_plain_text

client = TestClient(app)

IMPORTED_HTML = "<p>Ein Buch über <strong>Bewusstsein</strong> und Zeit.</p>"


def _tiptap(*paragraphs: str) -> str:
    return json.dumps(
        {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in paragraphs
            ],
        }
    )


class TestSnapshotPlainText:
    def test_html_is_flattened_to_prose_not_markup(self) -> None:
        result = snapshot_plain_text(IMPORTED_HTML)
        assert result == "Ein Buch über Bewusstsein und Zeit."
        assert "<p>" not in result
        assert "<strong>" not in result

    def test_html_block_elements_become_separate_lines(self) -> None:
        result = snapshot_plain_text("<h1>Titel</h1><p>Erster Absatz.</p><p>Zweiter.</p>")
        assert result.split("\n") == ["Titel", "Erster Absatz.", "Zweiter."]

    def test_tiptap_json_still_flattens(self) -> None:
        result = snapshot_plain_text(_tiptap("Erste Zeile.", "Zweite Zeile."))
        assert result.split("\n") == ["Erste Zeile.", "Zweite Zeile."]

    def test_legacy_plain_text_passes_through(self) -> None:
        assert snapshot_plain_text("Nur Text, kein Markup.") == "Nur Text, kein Markup."

    def test_empty_shapes_yield_empty_string(self) -> None:
        assert snapshot_plain_text(None) == ""
        assert snapshot_plain_text("") == ""
        assert snapshot_plain_text("   ") == ""

    def test_malformed_json_object_falls_back_to_the_raw_string(self) -> None:
        """A string that starts with '{' but is not JSON is not HTML
        either - passing it through beats emptying it."""
        assert snapshot_plain_text('{"type": broken') == '{"type": broken'


class TestDiffOfAnImportedChapter:
    def test_identical_html_and_tiptap_content_diffs_as_unchanged(self) -> None:
        """The payoff: a chapter imported as HTML and then opened and
        saved (so it becomes TipTap JSON) has the SAME prose. Before the
        fix one side was markup and the other prose, so every line
        showed as changed."""
        html_side = snapshot_plain_text("<p>Erste Zeile.</p><p>Zweite Zeile.</p>")
        json_side = snapshot_plain_text(_tiptap("Erste Zeile.", "Zweite Zeile."))

        assert html_side == json_side
        assert [entry["type"] for entry in line_diff(html_side, json_side)] == [
            "unchanged",
            "unchanged",
        ]

    def test_a_real_edit_still_shows_up(self) -> None:
        before = snapshot_plain_text("<p>Erste Zeile.</p>")
        after = snapshot_plain_text(_tiptap("Erste Zeile.", "Neue Zeile."))
        types = [entry["type"] for entry in line_diff(before, after)]
        assert "added" in types


class TestDiffEndpointWithImportedContent:
    def test_the_diff_endpoint_reports_no_markup_lines(self) -> None:
        book_id = client.post(
            "/api/books", json={"title": "Snapshot Buch", "author": "Aster"}
        ).json()["id"]
        try:
            chapter = client.post(
                f"/api/books/{book_id}/chapters",
                json={"title": "Importiert", "content": IMPORTED_HTML},
            ).json()
            snapshot = client.post(
                f"/api/books/{book_id}/chapters/{chapter['id']}/snapshots",
                json={"name": "vor der Bearbeitung"},
            )
            assert snapshot.status_code in (200, 201), snapshot.text

            resp = client.get(
                f"/api/books/{book_id}/chapters/{chapter['id']}"
                f"/versions/{snapshot.json()['id']}/diff"
            )
            assert resp.status_code == 200, resp.text
            text = " ".join(entry["text"] for entry in resp.json()["lines"])
            assert "Bewusstsein" in text
            assert "<p>" not in text
            assert "<strong>" not in text
        finally:
            client.delete(f"/api/books/{book_id}")
            client.delete(f"/api/books/trash/{book_id}")
