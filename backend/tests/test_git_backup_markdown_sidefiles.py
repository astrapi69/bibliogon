"""The git-backup Markdown side-file is written, never deleted on a failed render.

``book_serializer`` writes each chapter as canonical JSON plus an advisory
``NN-slug.md``. It used to render that Markdown only when the content was a
TipTap doc, returned None otherwise, and treated None as "drop the stale
file" - so every imported chapter (HTML until opened and saved, #787) had
its ``.md`` removed rather than written. On the dev library that is all
779 non-empty chapters.

The rule these tests pin: a failed or empty extraction from real content
NEVER triggers a destructive action. It aborts, naming the chapter, before
any file is touched.
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
    '{"type":"doc","content":[{"type":"paragraph",'
    '"content":[{"type":"text","text":"Im Editor gespeichert."}]}]}'
)
IMPORTED_HTML = "<p>Ein Buch über <strong>Bewusstsein</strong> und Zeit.</p>"


@pytest.fixture(autouse=True)
def _isolate_uploads(tmp_path, monkeypatch):
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(git_credentials, "GIT_CRED_DIR", tmp_path / "git_credentials")
    monkeypatch.setenv("BIBLIOGON_CREDENTIALS_SECRET", "test-secret-for-git-backup")
    yield


def _create_book() -> str:
    resp = client.post(
        "/api/books", json={"title": "Sidefile Buch", "author": "Aster", "language": "de"}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _add_chapter(book_id: str, title: str, content: str) -> dict:
    resp = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": title, "chapter_type": "chapter", "content": content},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _set_content(book_id: str, chapter: dict, content: str) -> None:
    resp = client.patch(
        f"/api/books/{book_id}/chapters/{chapter['id']}",
        json={"version": chapter["version"], "content": content},
    )
    assert resp.status_code == 200, resp.text


def _md_files(book_id: str) -> list:
    return sorted((git_backup.repo_path(book_id) / "manuscript").rglob("*.md"))


def _json_files(book_id: str) -> list:
    return sorted((git_backup.repo_path(book_id) / "manuscript").rglob("*.json"))


class TestHtmlChaptersAreWritten:
    def test_an_imported_html_chapter_is_written_as_markdown(self) -> None:
        book_id = _create_book()
        _add_chapter(book_id, "Importiert", IMPORTED_HTML)

        assert client.post(f"/api/books/{book_id}/git/init").status_code == 200

        md_files = _md_files(book_id)
        assert len(md_files) == 1
        text = md_files[0].read_text("utf-8")
        assert "Bewusstsein" in text
        assert "<p>" not in text
        assert "<strong>" not in text

    def test_a_chapter_that_becomes_html_keeps_its_markdown_file(self) -> None:
        """The deletion itself, reproduced: an .md exists, the chapter's
        content is now a non-TipTap shape, and the next commit used to
        unlink the file instead of rewriting it."""
        book_id = _create_book()
        chapter = _add_chapter(book_id, "Kapitel", TIPTAP_DOC)
        client.post(f"/api/books/{book_id}/git/init")
        assert len(_md_files(book_id)) == 1

        _set_content(book_id, chapter, IMPORTED_HTML)
        resp = client.post(f"/api/books/{book_id}/git/commit", json={"message": "html"})

        assert resp.status_code == 200, resp.text
        md_files = _md_files(book_id)
        assert len(md_files) == 1
        assert "Bewusstsein" in md_files[0].read_text("utf-8")


class TestFailedExtractionNeverDestroys:
    @staticmethod
    def _break_converter(monkeypatch, *, result: str | None = None) -> None:
        import bibliogon_export.scaffolder as scaffolder

        def broken(content):
            if result is None:
                raise RuntimeError("converter exploded")
            return result

        monkeypatch.setattr(scaffolder, "content_to_markdown", broken)

    def test_an_empty_result_from_real_content_aborts_and_names_the_chapter(
        self, monkeypatch
    ) -> None:
        book_id = _create_book()
        chapter = _add_chapter(book_id, "Das betroffene Kapitel", TIPTAP_DOC)
        client.post(f"/api/books/{book_id}/git/init")
        md_before = {p: p.read_bytes() for p in _md_files(book_id)}
        json_before = {p: p.read_bytes() for p in _json_files(book_id)}
        head_before = git.Repo(git_backup.repo_path(book_id)).head.commit.hexsha

        _set_content(book_id, chapter, IMPORTED_HTML)
        self._break_converter(monkeypatch, result="   ")
        resp = client.post(f"/api/books/{book_id}/git/commit", json={"message": "x"})

        assert resp.status_code == 500, resp.text
        assert "Das betroffene Kapitel" in resp.json()["detail"]
        assert {p: p.read_bytes() for p in _md_files(book_id)} == md_before
        assert {p: p.read_bytes() for p in _json_files(book_id)} == json_before
        assert git.Repo(git_backup.repo_path(book_id)).head.commit.hexsha == head_before

    def test_a_converter_exception_aborts_and_deletes_nothing(self, monkeypatch) -> None:
        book_id = _create_book()
        chapter = _add_chapter(book_id, "Explodiert", TIPTAP_DOC)
        client.post(f"/api/books/{book_id}/git/init")
        md_before = {p: p.read_bytes() for p in _md_files(book_id)}

        _set_content(book_id, chapter, IMPORTED_HTML)
        self._break_converter(monkeypatch)
        resp = client.post(f"/api/books/{book_id}/git/commit", json={"message": "x"})

        assert resp.status_code == 500, resp.text
        assert "Explodiert" in resp.json()["detail"]
        assert {p: p.read_bytes() for p in _md_files(book_id)} == md_before

    def test_a_failure_on_a_later_chapter_touches_no_earlier_file(self, monkeypatch) -> None:
        """Rendering happens for every chapter before any file is written,
        so a failure on chapter 2 cannot leave chapter 1 half-updated."""
        book_id = _create_book()
        first = _add_chapter(book_id, "Erstes", TIPTAP_DOC)
        second = _add_chapter(book_id, "Zweites", TIPTAP_DOC)
        client.post(f"/api/books/{book_id}/git/init")
        snapshot = {p: p.read_bytes() for p in _md_files(book_id) + _json_files(book_id)}

        _set_content(book_id, first, "<p>Neuer Text im ersten Kapitel.</p>")
        _set_content(book_id, second, IMPORTED_HTML)

        import bibliogon_export.scaffolder as scaffolder

        real = scaffolder.content_to_markdown

        def fail_on_second(content):
            if "Bewusstsein" in str(content):
                raise RuntimeError("second chapter fails")
            return real(content)

        monkeypatch.setattr(scaffolder, "content_to_markdown", fail_on_second)
        resp = client.post(f"/api/books/{book_id}/git/commit", json={"message": "x"})

        assert resp.status_code == 500, resp.text
        assert "Zweites" in resp.json()["detail"]
        after = {p: p.read_bytes() for p in _md_files(book_id) + _json_files(book_id)}
        assert after == snapshot


class TestNotFailures:
    def test_a_genuinely_empty_chapter_is_written_not_aborted(self) -> None:
        """55 chapters on the dev library have no content at all. An empty
        SOURCE is not a failed extraction; aborting on it would block
        commits for every book containing one."""
        book_id = _create_book()
        _add_chapter(book_id, "Leer", "")

        assert client.post(f"/api/books/{book_id}/git/init").status_code == 200

        md_files = _md_files(book_id)
        assert len(md_files) == 1
        assert "# Leer" in md_files[0].read_text("utf-8")

    def test_a_new_blank_editor_chapter_is_written_not_aborted(self) -> None:
        """What the editor stores for a chapter nobody has typed in yet: a
        non-empty string with no text. A first draft of this fix judged
        emptiness on the raw string and aborted here - which would have
        blocked commits for any book with a freshly created chapter."""
        book_id = _create_book()
        _add_chapter(book_id, "Neu", '{"type":"doc","content":[{"type":"paragraph"}]}')

        assert client.post(f"/api/books/{book_id}/git/init").status_code == 200

        md_files = _md_files(book_id)
        assert len(md_files) == 1
        assert "# Neu" in md_files[0].read_text("utf-8")

    def test_an_image_only_chapter_keeps_its_image(self) -> None:
        """No text, but a real Markdown body. Emptiness is judged on the
        rendered result, so the image is not dropped."""
        book_id = _create_book()
        _add_chapter(book_id, "Bild", '<p><img src="assets/figures/cover.png" alt="Cover"></p>')

        assert client.post(f"/api/books/{book_id}/git/init").status_code == 200

        text = _md_files(book_id)[0].read_text("utf-8")
        assert "cover.png" in text

    def test_serialization_is_idempotent(self) -> None:
        book_id = _create_book()
        _add_chapter(book_id, "Eins", IMPORTED_HTML)
        _add_chapter(book_id, "Zwei", TIPTAP_DOC)
        client.post(f"/api/books/{book_id}/git/init")
        first = {p: p.read_bytes() for p in _md_files(book_id) + _json_files(book_id)}

        resp = client.post(f"/api/books/{book_id}/git/commit", json={"message": "again"})

        assert resp.status_code == 409, resp.text
        assert resp.json()["detail"]["code"] == "nothing_to_commit"
        second = {p: p.read_bytes() for p in _md_files(book_id) + _json_files(book_id)}
        assert second == first
