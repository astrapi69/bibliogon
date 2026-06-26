"""Round-trip coverage for the per-chapter Inspector notes
(CHAPTER-SYNOPSIS-NOTES-01 additive enhancement).

``Chapter.inspector_notes`` is the author's chapter-local working note,
distinct from the Storyboard ``notes`` sticky and from project-wide
``Book.notes``. Per the lessons-learned rule "End-to-end behavior tests
are not 'kwarg passes through' tests", each path flips the field to a
non-default value and asserts the observable response + a re-read for
persistence, plus the exclude_unset PATCH semantics, the length-validation
reject, and a serializer (.bgb) round-trip.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.models import Chapter
from app.services.backup.serializer import restore_row, serialize_row

client = TestClient(app)


def _create_book() -> str:
    r = client.post("/api/books", json={"title": "Inspector Book", "author": "Aster"})
    assert r.status_code == 201
    return r.json()["id"]


def _create_chapter(book_id: str, **kwargs) -> dict:
    payload = {"title": "Chapter 1"}
    payload.update(kwargs)
    r = client.post(f"/api/books/{book_id}/chapters", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


class TestChapterInspectorNotes:
    def test_inspector_notes_defaults_null(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        assert chapter["inspector_notes"] is None
        client.delete(f"/api/books/{book_id}")

    def test_create_with_inspector_notes_roundtrips(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id, inspector_notes="Add a flashback here.")
        assert chapter["inspector_notes"] == "Add a flashback here."
        persisted = client.get(f"/api/books/{book_id}/chapters/{chapter['id']}").json()
        assert persisted["inspector_notes"] == "Add a flashback here."
        client.delete(f"/api/books/{book_id}")

    def test_patch_inspector_notes_roundtrips(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "inspector_notes": "Check the timeline."},
        )
        assert r.status_code == 200, r.text
        assert r.json()["inspector_notes"] == "Check the timeline."
        client.delete(f"/api/books/{book_id}")

    def test_patch_without_inspector_notes_preserves_existing(self):
        """exclude_unset: a PATCH that omits inspector_notes must not null it."""
        book_id = _create_book()
        chapter = _create_chapter(book_id, inspector_notes="Keep me.")
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "title": "Renamed"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["inspector_notes"] == "Keep me."
        client.delete(f"/api/books/{book_id}")

    def test_inspector_notes_independent_of_storyboard_notes(self):
        """The two are distinct columns: setting one must not touch the other."""
        book_id = _create_book()
        chapter = _create_chapter(
            book_id, notes="Storyboard sticky.", inspector_notes="Inspector note."
        )
        assert chapter["notes"] == "Storyboard sticky."
        assert chapter["inspector_notes"] == "Inspector note."
        client.delete(f"/api/books/{book_id}")

    def test_inspector_notes_over_length_rejected(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "inspector_notes": "x" * 20001},
        )
        assert r.status_code == 422
        client.delete(f"/api/books/{book_id}")


def test_inspector_notes_bgb_serializer_roundtrip():
    """.bgb backup carries inspector_notes (introspective serialize_row)."""
    now = datetime(2026, 6, 23, 12, 0, 0, tzinfo=UTC)
    chapter = Chapter(
        id="ch1",
        book_id="bk1",
        title="Chapter 1",
        content="",
        position=0,
        inspector_notes="Survive the backup.",
        created_at=now,
        updated_at=now,
    )
    data = serialize_row(chapter)
    assert data["inspector_notes"] == "Survive the backup."
    restored = restore_row(Chapter, data)
    assert restored.inspector_notes == "Survive the backup."
