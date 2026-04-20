"""Unit tests for the AI review filesystem store + cascade delete."""

from app.ai.review_store import (
    delete_reviews_for_chapter,
    find_report,
    new_review_id,
    report_filename,
    reviews_dir,
    slugify,
    write_report,
)


def test_slugify_lowercases_and_hyphenates():
    assert slugify("Hello World") == "hello-world"


def test_slugify_collapses_punctuation():
    assert slugify("Chapter 1: The Beginning!") == "chapter-1-the-beginning"


def test_slugify_empty_string_falls_back():
    assert slugify("") == "untitled"


def test_slugify_only_punctuation_falls_back():
    assert slugify("!!!---") == "untitled"


def test_slugify_length_cap():
    long = "a" * 200
    assert len(slugify(long)) <= 60


def test_new_review_id_format():
    rid = new_review_id()
    assert len(rid) == 12
    assert all(c in "0123456789abcdef" for c in rid)


def test_report_filename_shape():
    name = report_filename("abc123def456", "my-chapter")
    assert name.startswith("abc123def456-my-chapter-")
    assert name.endswith(".md")


def test_reviews_dir_path(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert reviews_dir("bookid").name == "reviews"
    assert reviews_dir("bookid").parent.name == "bookid"


def test_write_report_creates_parents(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    path = write_report("book1", "rev1rev1rev1", "chap-slug", "# Content\n")
    assert path.exists()
    assert path.read_text() == "# Content\n"


def test_find_report_roundtrip(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    write_report("book2", "rev2rev2rev2", "chap-slug", "# Hi\n")
    found = find_report("book2", "rev2rev2rev2")
    assert found is not None
    assert found.read_text() == "# Hi\n"


def test_find_report_missing_returns_none(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert find_report("nobook", "noid") is None


def test_cascade_delete_removes_matching_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    write_report("book3", "aaaa11112222", "my-chapter", "# A")
    write_report("book3", "bbbb33334444", "my-chapter", "# B")
    write_report("book3", "cccc55556666", "other-chapter", "# C")

    deleted = delete_reviews_for_chapter("book3", "my-chapter")
    assert deleted == 2

    # Only the "other-chapter" file remains.
    remaining = list(reviews_dir("book3").iterdir())
    assert len(remaining) == 1
    assert "other-chapter" in remaining[0].name


def test_cascade_delete_safe_when_dir_missing(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert delete_reviews_for_chapter("nobody", "nothing") == 0


def test_cascade_delete_does_not_match_partial_slug(tmp_path, monkeypatch):
    """'chap' must NOT match 'chapter' - slug boundaries matter."""
    monkeypatch.chdir(tmp_path)
    write_report("book4", "aaaa11112222", "chapter", "# Chapter file")

    deleted = delete_reviews_for_chapter("book4", "chap")
    assert deleted == 0


def test_delete_chapter_route_cascades_review_files(tmp_path, monkeypatch):
    """DELETE /api/books/{bid}/chapters/{cid} wipes matching review files."""
    import yaml
    from unittest.mock import patch
    from fastapi.testclient import TestClient

    monkeypatch.chdir(tmp_path)
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / "app.yaml").write_text(yaml.dump({"ai": {"enabled": True}}))

    from app.main import app

    with patch("app.ai.routes._get_ai_config", return_value={"enabled": True}):
        client = TestClient(app)

        book_resp = client.post(
            "/api/books", json={"title": "Cascade Test", "author": "A"}
        )
        book_id = book_resp.json()["id"]
        chap_resp = client.post(
            f"/api/books/{book_id}/chapters",
            json={"title": "My Chapter", "content": ""},
        )
        chapter_id = chap_resp.json()["id"]

        # Manually seed a review file for this chapter.
        write_report(book_id, "rev1rev1rev1", slugify("My Chapter"), "# review")
        assert find_report(book_id, "rev1rev1rev1") is not None

        # Delete the chapter - review file must vanish.
        del_resp = client.delete(
            f"/api/books/{book_id}/chapters/{chapter_id}"
        )
        assert del_resp.status_code == 204
        assert find_report(book_id, "rev1rev1rev1") is None
