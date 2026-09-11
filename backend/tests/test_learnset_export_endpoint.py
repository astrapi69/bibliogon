"""End-to-end tests for GET /api/learnset/{book_id}/export (#763).

Real path per the Coverage-Illusion rule: TestClient boots the
lifespan (plugin-learnset activates via its entry point), a book with
chapters is created through the API, and the downloaded ZIP is
opened + schema-checked - not a mocked router.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def _make_book_with_chapters(client: TestClient) -> str:
    book_response = client.post(
        "/api/books",
        json={"title": "Lernset Buch", "author": "Test Autor", "language": "de"},
    )
    assert book_response.status_code in (200, 201), book_response.text
    book_id = book_response.json()["id"]

    def tiptap(text: str) -> str:
        return json.dumps(
            {
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
            }
        )

    for title, chapter_type, text in [
        ("Einleitung", "introduction", "Der Einstieg in das Thema."),
        ("Die Schere", "chapter", "CRISPR erklaert in einem Absatz."),
        ("Impressum", "imprint", "Verlagsangaben."),
    ]:
        chapter_response = client.post(
            f"/api/books/{book_id}/chapters",
            json={"title": title, "content": tiptap(text), "chapter_type": chapter_type},
        )
        assert chapter_response.status_code in (200, 201), chapter_response.text
    return book_id


def test_export_streams_schema_valid_alc_zip(client: TestClient) -> None:
    book_id = _make_book_with_chapters(client)

    response = client.get(f"/api/learnset/{book_id}/export")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert "lernset-buch-learnset.zip" in response.headers["content-disposition"]

    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = sorted(archive.namelist())
    base = "sets/de/lernset-buch"
    assert f"{base}/manifest.yaml" in names
    assert f"{base}/lessons/01-einleitung.json" in names
    assert f"{base}/lessons/02-die-schere.json" in names
    assert not any("impressum" in name for name in names)

    lesson = json.loads(archive.read(f"{base}/lessons/02-die-schere.json"))
    assert lesson["steps"][0]["type"] == "theory"
    assert "CRISPR" in lesson["steps"][0]["body"]

    from bibliogon_learnset.validation import validate_lesson

    assert validate_lesson(lesson) == []


def test_export_unknown_book_returns_404(client: TestClient) -> None:
    response = client.get("/api/learnset/does-not-exist/export")
    assert response.status_code == 404


class TestImportedChapterContentShapes:
    """#787: the write-book-template importer stores HTML in
    ``Chapter.content`` (the editor parses it via ``setContent`` and
    writes JSON back on first save), so a bare ``json.loads`` in the
    export crashed with "Expecting value: line 1 column 1 (char 0)" for
    every imported book - which was all of them.
    """

    def _export(self, client: TestClient, content: str | None) -> bytes:
        book_id = client.post(
            "/api/books",
            json={"title": "Shape Probe", "author": "Test Autor", "language": "de"},
        ).json()["id"]
        created = client.post(
            f"/api/books/{book_id}/chapters",
            json={"title": "Kapitel", "content": content, "chapter_type": "chapter"},
        )
        assert created.status_code in (200, 201), created.text
        response = client.get(f"/api/learnset/{book_id}/export")
        assert response.status_code == 200, response.text
        return response.content

    def _lesson_bodies(self, payload: bytes) -> str:
        archive = zipfile.ZipFile(io.BytesIO(payload))
        lessons = [name for name in archive.namelist() if name.endswith(".json")]
        return " ".join(archive.read(name).decode("utf-8") for name in lessons)

    def test_html_content_exports_instead_of_raising(self, client: TestClient) -> None:
        payload = self._export(client, "<h1>Vorwort</h1>\n<p>Ein ganzer Satz.</p>")
        assert "Ein ganzer Satz." in self._lesson_bodies(payload)

    def test_tiptap_json_content_still_exports(self, client: TestClient) -> None:
        doc = json.dumps(
            {
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "Aus JSON."}]}
                ],
            }
        )
        assert "Aus JSON." in self._lesson_bodies(self._export(client, doc))

    def test_plain_text_content_still_exports(self, client: TestClient) -> None:
        assert "Nur Text." in self._lesson_bodies(self._export(client, "Nur Text."))

    def test_whitespace_only_content_does_not_raise(self, client: TestClient) -> None:
        """``json.loads(" ")`` raises the same message as on an empty
        string, so the old emptiness guard let it through."""
        self._export(client, "   ")

    def test_empty_content_does_not_raise(self, client: TestClient) -> None:
        self._export(client, "")
