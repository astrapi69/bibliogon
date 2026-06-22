"""Round-trip coverage for CHAPTER-SYNOPSIS-NOTES-01.

Per the lessons-learned rule "End-to-end behavior tests are not 'kwarg
passes through' tests": each new field is flipped to a non-default value
with an observable assertion on the response + a re-read for persistence,
plus the exclude_unset PATCH semantics and the length-validation reject.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_book() -> str:
    r = client.post("/api/books", json={"title": "Synopsis Book", "author": "Aster"})
    assert r.status_code == 201
    return r.json()["id"]


def _create_chapter(book_id: str, **kwargs) -> dict:
    payload = {"title": "Chapter 1"}
    payload.update(kwargs)
    r = client.post(f"/api/books/{book_id}/chapters", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


class TestChapterSynopsis:
    def test_synopsis_defaults_null(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        assert chapter["synopsis"] is None
        client.delete(f"/api/books/{book_id}")

    def test_create_with_synopsis_roundtrips(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id, synopsis="The hero leaves home.")
        assert chapter["synopsis"] == "The hero leaves home."
        persisted = client.get(f"/api/books/{book_id}/chapters/{chapter['id']}").json()
        assert persisted["synopsis"] == "The hero leaves home."
        client.delete(f"/api/books/{book_id}")

    def test_patch_synopsis_roundtrips(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "synopsis": "A betrayal upends the plan."},
        )
        assert r.status_code == 200, r.text
        assert r.json()["synopsis"] == "A betrayal upends the plan."
        client.delete(f"/api/books/{book_id}")

    def test_patch_without_synopsis_preserves_existing(self):
        """exclude_unset: a PATCH that omits synopsis must not null it."""
        book_id = _create_book()
        chapter = _create_chapter(book_id, synopsis="Keep me.")
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "title": "Renamed"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["synopsis"] == "Keep me."
        client.delete(f"/api/books/{book_id}")

    def test_synopsis_over_length_rejected(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "synopsis": "x" * 2001},
        )
        assert r.status_code == 422
        client.delete(f"/api/books/{book_id}")


class TestBookNotes:
    def test_notes_defaults_null(self):
        book_id = _create_book()
        book = client.get(f"/api/books/{book_id}").json()
        assert book["notes"] is None
        client.delete(f"/api/books/{book_id}")

    def test_patch_notes_roundtrips(self):
        book_id = _create_book()
        r = client.patch(f"/api/books/{book_id}", json={"notes": "Outline act 2 next."})
        assert r.status_code == 200, r.text
        assert r.json()["notes"] == "Outline act 2 next."
        persisted = client.get(f"/api/books/{book_id}").json()
        assert persisted["notes"] == "Outline act 2 next."
        client.delete(f"/api/books/{book_id}")
