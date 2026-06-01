"""Round-trip coverage for the 4 Chapter storyboard columns
(STORY-BIBLE-STORYBOARD-INTEGRATION-01 C3).

Mirrors ``test_pages_routes.py::TestStoryboardFields``. Per the
lessons-learned rule "End-to-end behavior tests are not 'kwarg passes
through' tests": each new field gets at least one case that flips it to
a non-default value and asserts an observable difference in the
response shape. Covers create-path + patch-path + persistence +
validation rejection.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_book() -> str:
    r = client.post("/api/books", json={"title": "Prose Storyboard", "author": "Aster"})
    assert r.status_code == 201
    return r.json()["id"]


def _create_chapter(book_id: str, **kwargs) -> dict:
    payload = {"title": "Chapter 1"}
    payload.update(kwargs)
    r = client.post(f"/api/books/{book_id}/chapters", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


class TestChapterStoryboardFields:
    def test_default_storyboard_fields_are_null(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        assert chapter["notes"] is None
        assert chapter["story_beat"] is None
        assert chapter["mood_color"] is None
        assert chapter["act_group"] is None
        client.delete(f"/api/books/{book_id}")

    def test_create_chapter_with_all_storyboard_fields_roundtrips(self):
        book_id = _create_book()
        chapter = _create_chapter(
            book_id,
            notes="This chapter drags; tighten the middle.",
            story_beat="climax",
            mood_color="#FF6B35",
            act_group="Act III",
        )
        assert chapter["notes"] == "This chapter drags; tighten the middle."
        assert chapter["story_beat"] == "climax"
        assert chapter["mood_color"] == "#FF6B35"
        assert chapter["act_group"] == "Act III"
        # Persistence: re-read confirms.
        r = client.get(f"/api/books/{book_id}/chapters/{chapter['id']}")
        persisted = r.json()
        assert persisted["notes"] == "This chapter drags; tighten the middle."
        assert persisted["story_beat"] == "climax"
        assert persisted["mood_color"] == "#FF6B35"
        assert persisted["act_group"] == "Act III"
        client.delete(f"/api/books/{book_id}")

    def test_patch_notes_roundtrips(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "notes": "Author memo: needs revision."},
        )
        assert r.status_code == 200
        assert r.json()["notes"] == "Author memo: needs revision."
        client.delete(f"/api/books/{book_id}")

    @pytest.mark.parametrize(
        "beat",
        ["setup", "inciting", "rising", "climax", "falling", "resolution"],
    )
    def test_patch_story_beat_accepts_all_six_values(self, beat):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "story_beat": beat},
        )
        assert r.status_code == 200
        assert r.json()["story_beat"] == beat
        client.delete(f"/api/books/{book_id}")

    def test_invalid_story_beat_rejected(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "story_beat": "not_a_beat"},
        )
        assert r.status_code == 422
        client.delete(f"/api/books/{book_id}")

    def test_invalid_mood_color_rejected(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "mood_color": "red"},
        )
        assert r.status_code == 422
        client.delete(f"/api/books/{book_id}")

    def test_patch_mood_color_and_act_group_roundtrip(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": 1, "mood_color": "#1A2B3C", "act_group": "Setup"},
        )
        assert r.status_code == 200
        assert r.json()["mood_color"] == "#1A2B3C"
        assert r.json()["act_group"] == "Setup"
        client.delete(f"/api/books/{book_id}")
