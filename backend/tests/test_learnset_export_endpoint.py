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
