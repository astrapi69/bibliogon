"""Coverage for per-chapter status + per-book chapter labels
(CHAPTER-STATUS-LABELS-01).

Per the lessons-learned rule "End-to-end behavior tests are not 'kwarg
passes through' tests": each new field/endpoint flips a value to a
non-default and asserts an observable difference at the response /
persistence layer. Covers chapter status + label_id round-trip, the
label CRUD endpoints, the delete-nulls-assignment behavior, and
validation rejection.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_book() -> str:
    r = client.post("/api/books", json={"title": "Labels Book", "author": "Aster"})
    assert r.status_code == 201
    return r.json()["id"]


def _create_chapter(book_id: str, **kwargs) -> dict:
    payload = {"title": "Chapter 1"}
    payload.update(kwargs)
    r = client.post(f"/api/books/{book_id}/chapters", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def _create_label(book_id: str, name="Needs work", color="#FF6B6B") -> dict:
    r = client.post(
        f"/api/books/{book_id}/chapter-labels",
        json={"name": name, "color": color},
    )
    assert r.status_code == 201, r.text
    return r.json()


class TestChapterStatusAndLabelId:
    def test_defaults_are_null(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        assert chapter["status"] is None
        assert chapter["label_id"] is None
        client.delete(f"/api/books/{book_id}")

    def test_create_with_status_roundtrips(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id, status="first_draft")
        assert chapter["status"] == "first_draft"
        persisted = client.get(
            f"/api/books/{book_id}/chapters/{chapter['id']}"
        ).json()
        assert persisted["status"] == "first_draft"
        client.delete(f"/api/books/{book_id}")

    def test_patch_sets_status_and_label_id(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        label = _create_label(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": chapter["version"], "status": "revised", "label_id": label["id"]},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "revised"
        assert body["label_id"] == label["id"]
        client.delete(f"/api/books/{book_id}")

    def test_invalid_status_rejected(self):
        book_id = _create_book()
        r = client.post(
            f"/api/books/{book_id}/chapters",
            json={"title": "Bad", "status": "done"},
        )
        assert r.status_code == 422
        client.delete(f"/api/books/{book_id}")


class TestChapterLabelCrud:
    def test_create_list_labels(self):
        book_id = _create_book()
        a = _create_label(book_id, name="Draft", color="#FFC857")
        b = _create_label(book_id, name="Final", color="#7FB069")
        labels = client.get(f"/api/books/{book_id}/chapter-labels").json()
        names = [lbl["name"] for lbl in labels]
        assert names == ["Draft", "Final"]  # position order
        # positions are assigned incrementally
        assert labels[0]["position"] == 0
        assert labels[1]["position"] == 1
        assert {a["id"], b["id"]} == {lbl["id"] for lbl in labels}
        client.delete(f"/api/books/{book_id}")

    def test_patch_label(self):
        book_id = _create_book()
        label = _create_label(book_id)
        r = client.patch(
            f"/api/books/{book_id}/chapter-labels/{label['id']}",
            json={"name": "Renamed", "color": "#4ECDC4"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "Renamed"
        assert body["color"] == "#4ECDC4"
        client.delete(f"/api/books/{book_id}")

    def test_invalid_color_rejected(self):
        book_id = _create_book()
        r = client.post(
            f"/api/books/{book_id}/chapter-labels",
            json={"name": "X", "color": "red"},
        )
        assert r.status_code == 422
        client.delete(f"/api/books/{book_id}")

    def test_delete_label_nulls_chapter_assignment(self):
        book_id = _create_book()
        chapter = _create_chapter(book_id)
        label = _create_label(book_id)
        # Assign the label to the chapter.
        r = client.patch(
            f"/api/books/{book_id}/chapters/{chapter['id']}",
            json={"version": chapter["version"], "label_id": label["id"]},
        )
        assert r.json()["label_id"] == label["id"]
        # Delete the label.
        r = client.delete(f"/api/books/{book_id}/chapter-labels/{label['id']}")
        assert r.status_code == 204
        # The chapter's label_id is cleared, not dangling.
        persisted = client.get(
            f"/api/books/{book_id}/chapters/{chapter['id']}"
        ).json()
        assert persisted["label_id"] is None
        # And the label list is empty.
        assert client.get(f"/api/books/{book_id}/chapter-labels").json() == []
        client.delete(f"/api/books/{book_id}")

    def test_label_404s(self):
        book_id = _create_book()
        assert (
            client.get("/api/books/nonexistent/chapter-labels").status_code == 404
        )
        assert (
            client.patch(
                f"/api/books/{book_id}/chapter-labels/nope", json={"name": "x"}
            ).status_code
            == 404
        )
        assert (
            client.delete(
                f"/api/books/{book_id}/chapter-labels/nope"
            ).status_code
            == 404
        )
        client.delete(f"/api/books/{book_id}")
