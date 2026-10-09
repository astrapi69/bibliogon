"""Removing a chapter must remove both files git-backup wrote for it (#844).

``book_serializer`` pre-cleans each manuscript section before writing so a
removed chapter drops out of the backup repo. It only cleared ``*.json``, so
the chapter's advisory ``NN-slug.md`` stayed in the working tree and stayed
tracked - and because stems are position-based, removing an early chapter
renumbers the rest and leaves the old Markdown under names that now belong
to nothing, or collide with another chapter's new stem.

The blanket fix is unsafe: a repo whose working tree holds author-written
Markdown (an adopted upstream history, #841) would lose the manuscript to a
``*.md`` glob. So the rule pinned here is ownership - a ``.md`` is removed
only when the sibling ``.json`` git-backup itself wrote is there to prove it
is ours.
"""

from __future__ import annotations

import git
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.git import backup as git_backup
from app.services.git import credentials as git_credentials

client = TestClient(app)

TIPTAP_DOC = (
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Inhalt."}]}]}'
)


@pytest.fixture(autouse=True)
def _isolate_uploads(tmp_path, monkeypatch):
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(git_credentials, "GIT_CRED_DIR", tmp_path / "git_credentials")
    monkeypatch.setenv("BIBLIOGON_CREDENTIALS_SECRET", "test-secret-for-git-backup")
    yield


def _create_book() -> str:
    resp = client.post(
        "/api/books", json={"title": "Cleanup Buch", "author": "Aster", "language": "de"}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _add_chapter(book_id: str, title: str) -> dict:
    resp = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": title, "chapter_type": "chapter", "content": TIPTAP_DOC},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _delete_chapter(book_id: str, chapter_id: str) -> None:
    resp = client.delete(f"/api/books/{book_id}/chapters/{chapter_id}")
    assert resp.status_code in (200, 204), resp.text


def _names(book_id: str, suffix: str) -> set[str]:
    root = git_backup.repo_path(book_id) / "manuscript"
    return {path.name for path in root.rglob(f"*{suffix}")}


def _tracked(book_id: str) -> set[str]:
    repo = git.Repo(git_backup.repo_path(book_id))
    return {entry.path for entry in repo.commit("HEAD").tree.traverse() if entry.type == "blob"}


class TestRemovedChapterCleanup:
    def test_a_removed_chapters_markdown_leaves_the_working_tree(self) -> None:
        book_id = _create_book()
        _add_chapter(book_id, "Erstes")
        second = _add_chapter(book_id, "Zweites")
        assert client.post(f"/api/books/{book_id}/git/init").status_code == 200
        assert _names(book_id, ".md") == {"01-erstes.md", "02-zweites.md"}

        _delete_chapter(book_id, second["id"])
        resp = client.post(f"/api/books/{book_id}/git/commit", json={"message": "drop"})
        assert resp.status_code == 200, resp.text

        assert _names(book_id, ".json") == {"01-erstes.json"}
        assert _names(book_id, ".md") == {"01-erstes.md"}

    def test_a_removed_chapters_markdown_leaves_git_too(self) -> None:
        book_id = _create_book()
        _add_chapter(book_id, "Erstes")
        second = _add_chapter(book_id, "Zweites")
        client.post(f"/api/books/{book_id}/git/init")

        _delete_chapter(book_id, second["id"])
        client.post(f"/api/books/{book_id}/git/commit", json={"message": "drop"})

        tracked = _tracked(book_id)
        assert not [path for path in tracked if path.endswith("02-zweites.md")]
        assert not [path for path in tracked if path.endswith("02-zweites.json")]

    def test_removing_the_first_chapter_leaves_no_stale_renumbered_markdown(self) -> None:
        """Stems are position-based, so dropping 01 renumbers everything
        after it. The old names must not survive beside the new ones."""
        book_id = _create_book()
        first = _add_chapter(book_id, "Erstes")
        _add_chapter(book_id, "Zweites")
        _add_chapter(book_id, "Drittes")
        client.post(f"/api/books/{book_id}/git/init")

        _delete_chapter(book_id, first["id"])
        client.post(f"/api/books/{book_id}/git/commit", json={"message": "drop first"})

        assert _names(book_id, ".md") == {"01-zweites.md", "02-drittes.md"}

    def test_author_markdown_without_a_paired_json_survives(self) -> None:
        """The reason the blanket glob was refused: a file git-backup did
        not write has no sibling JSON and must be left alone."""
        book_id = _create_book()
        _add_chapter(book_id, "Erstes")
        client.post(f"/api/books/{book_id}/git/init")

        authored = git_backup.repo_path(book_id) / "manuscript" / "back-matter"
        authored.mkdir(parents=True, exist_ok=True)
        (authored / "about-the-author.md").write_text("Von Hand geschrieben.\n", encoding="utf-8")

        resp = client.post(f"/api/books/{book_id}/git/commit", json={"message": "author file"})
        assert resp.status_code == 200, resp.text

        assert "about-the-author.md" in _names(book_id, ".md")
        assert (authored / "about-the-author.md").read_text("utf-8").startswith("Von Hand")
