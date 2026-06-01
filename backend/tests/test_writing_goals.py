"""Coverage for writing goals (WRITING-GOALS-PROGRESS-TRACKING-01):
per-chapter target_words, per-book word_target + deadline, and the
per-day writing-session delta recording.

Per the "behavior tests, not kwarg-passthrough" rule each field flips
to a non-default and asserts an observable difference at the response /
DB layer.
"""

from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from app.services.writing_stats import count_words

client = TestClient(app)


def _book() -> str:
    r = client.post("/api/books", json={"title": "Goals Book", "author": "Aster"})
    assert r.status_code == 201
    return r.json()["id"]


def _chapter(book_id: str, **kw) -> dict:
    payload = {"title": "Chapter 1"}
    payload.update(kw)
    r = client.post(f"/api/books/{book_id}/chapters", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


class TestCountWords:
    def test_plain_text(self):
        assert count_words("one two three") == 3

    def test_empty(self):
        assert count_words("") == 0
        assert count_words(None) == 0

    def test_tiptap_json(self):
        doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"alpha beta gamma"}]}]}'
        assert count_words(doc) == 3


class TestChapterTarget:
    def test_default_null_and_roundtrip(self):
        book_id = _book()
        ch = _chapter(book_id)
        assert ch["target_words"] is None
        r = client.patch(
            f"/api/books/{book_id}/chapters/{ch['id']}",
            json={"version": ch["version"], "target_words": 2000},
        )
        assert r.status_code == 200, r.text
        assert r.json()["target_words"] == 2000
        client.delete(f"/api/books/{book_id}")

    def test_negative_target_rejected(self):
        book_id = _book()
        ch = _chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{ch['id']}",
            json={"version": ch["version"], "target_words": -5},
        )
        assert r.status_code == 422
        client.delete(f"/api/books/{book_id}")


class TestBookTarget:
    def test_word_target_and_deadline_roundtrip(self):
        book_id = _book()
        r = client.patch(
            f"/api/books/{book_id}",
            json={"word_target": 80000, "word_target_deadline": "2026-12-31"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["word_target"] == 80000
        assert body["word_target_deadline"] == "2026-12-31"
        client.delete(f"/api/books/{book_id}")


class TestWritingSessions:
    def test_content_patch_records_daily_delta(self):
        book_id = _book()
        ch = _chapter(book_id, content="one two")  # 2 words, not counted at create
        # Grow the content by 2 words via PATCH -> records a +2 delta.
        r = client.patch(
            f"/api/books/{book_id}/chapters/{ch['id']}",
            json={"version": ch["version"], "content": "one two three four"},
        )
        assert r.status_code == 200, r.text
        sessions = client.get("/api/writing-sessions").json()
        today = date.today().isoformat()
        today_rows = [s for s in sessions if s["day"] == today]
        assert today_rows, "today's writing session should exist"
        assert today_rows[0]["words_written"] >= 2
        client.delete(f"/api/books/{book_id}")

    def test_non_content_patch_records_nothing_new(self):
        # A title-only PATCH must not create a writing session for the
        # delta path (only content changes count).
        book_id = _book()
        ch = _chapter(book_id, content="alpha beta")
        before = client.get("/api/writing-sessions").json()
        before_today = next(
            (s["words_written"] for s in before if s["day"] == date.today().isoformat()),
            0,
        )
        r = client.patch(
            f"/api/books/{book_id}/chapters/{ch['id']}",
            json={"version": ch["version"], "title": "Renamed only"},
        )
        assert r.status_code == 200, r.text
        after = client.get("/api/writing-sessions").json()
        after_today = next(
            (s["words_written"] for s in after if s["day"] == date.today().isoformat()),
            0,
        )
        assert after_today == before_today
        client.delete(f"/api/books/{book_id}")
