"""Editable A+ document endpoints (#891).

The A+ document is what the author fills in, by hand or with AI help:
content name, short description, bullets, and an ordered list of
modules built from templates. It is stored per book and language,
independent of the AI generation cache (``aplus_content``). These tests
exercise the real router + DB through the TestClient lifespan.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import AplusDocument

DOCUMENT = {
    "content_name": "El caballo que se reía - A+Content",
    "short_description": (
        "Filimón es un caballo con un talento especial: sabe reír. ¿Quién limpiará el baño?"
    ),
    "bullets": [
        {"heading": "Filimón y la sopa de alubias", "body": "Una aventura llena de humor."},
        {"heading": "Caos en el baño", "body": "De un pequeño incidente nace una gran fiesta."},
        {"heading": "Una fiesta familiar griega", "body": "Olivares y Super-Yiayia."},
    ],
    "modules": [
        {
            "id": "m1",
            "template": "image_header_text",
            "module_title": "El caballo que se reía",
            "slots": [
                {
                    "title": "Filimón, el caballo que se reía",
                    "text": "Filimón vive con el abuelo Jannis y la abuela Yiayia.",
                    "image_prompt": "cheerful Greek farm at sunrise --ar 97:60 --v 6.1",
                    "alt_text": "Granja griega alegre al amanecer.",
                }
            ],
        },
        {
            "id": "m2",
            "template": "three_images_text",
            "module_title": "La cultura griega se encuentra con el humor infantil",
            "slots": [
                {"title": "Uno", "text": "a", "image_prompt": "p1 --ar 1:1", "alt_text": "x"},
                {"title": "Dos", "text": "b", "image_prompt": "p2 --ar 1:1", "alt_text": "y"},
                {"title": "Tres", "text": "c", "image_prompt": "p3 --ar 1:1", "alt_text": "z"},
            ],
        },
    ],
}


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _book_id(client: TestClient, language: str = "es") -> str:
    response = client.post(
        "/api/books", json={"title": "El caballo que se reía", "author": "A", "language": language}
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


def _url(book_id: str, language: str = "es") -> str:
    return f"/api/aplus/{book_id}/document?language={language}"


class TestDocumentRoundTrip:
    def test_no_document_yet_is_404(self, client: TestClient) -> None:
        book_id = _book_id(client)
        assert client.get(_url(book_id)).status_code == 404

    def test_put_then_get_round_trips_every_field(self, client: TestClient) -> None:
        book_id = _book_id(client)
        saved = client.put(_url(book_id), json=DOCUMENT)
        assert saved.status_code == 200, saved.text
        body = client.get(_url(book_id)).json()
        for key in ("content_name", "short_description", "bullets", "modules"):
            assert body[key] == DOCUMENT[key]
        assert body["book_id"] == book_id
        assert body["language"] == "es"
        assert body["updated_at"]

    def test_second_put_replaces_the_document_in_place(self, client: TestClient) -> None:
        book_id = _book_id(client)
        client.put(_url(book_id), json=DOCUMENT)
        changed = {**DOCUMENT, "content_name": "Neuer Name", "modules": []}
        client.put(_url(book_id), json=changed)
        body = client.get(_url(book_id)).json()
        assert body["content_name"] == "Neuer Name"
        assert body["modules"] == []
        with SessionLocal() as db:
            rows = db.query(AplusDocument).filter(AplusDocument.book_id == book_id).all()
        assert len(rows) == 1

    def test_languages_are_separate_documents(self, client: TestClient) -> None:
        book_id = _book_id(client)
        client.put(_url(book_id, "es"), json=DOCUMENT)
        client.put(_url(book_id, "de"), json={**DOCUMENT, "content_name": "Deutsch"})
        assert client.get(_url(book_id, "es")).json()["content_name"] == DOCUMENT["content_name"]
        assert client.get(_url(book_id, "de")).json()["content_name"] == "Deutsch"

    def test_delete_removes_only_that_language(self, client: TestClient) -> None:
        book_id = _book_id(client)
        client.put(_url(book_id, "es"), json=DOCUMENT)
        client.put(_url(book_id, "de"), json=DOCUMENT)
        assert client.delete(_url(book_id, "es")).status_code == 204
        assert client.get(_url(book_id, "es")).status_code == 404
        assert client.get(_url(book_id, "de")).status_code == 200

    def test_partial_document_fills_defaults(self, client: TestClient) -> None:
        book_id = _book_id(client)
        client.put(_url(book_id), json={"content_name": "Nur ein Name"})
        body = client.get(_url(book_id)).json()
        assert body["short_description"] == ""
        assert body["bullets"] == []
        assert body["modules"] == []


class TestDocumentGuards:
    def test_unknown_book_is_404(self, client: TestClient) -> None:
        assert client.get(_url("does-not-exist")).status_code == 404
        assert client.put(_url("does-not-exist"), json=DOCUMENT).status_code == 404

    def test_language_defaults_to_the_book_language(self, client: TestClient) -> None:
        book_id = _book_id(client, language="es")
        client.put(f"/api/aplus/{book_id}/document", json=DOCUMENT)
        assert client.get(_url(book_id, "es")).status_code == 200

    @pytest.mark.parametrize("language", ["", "x", "toolonglanguage", "de_DE", "../x"])
    def test_malformed_language_is_rejected(self, client: TestClient, language: str) -> None:
        book_id = _book_id(client)
        response = client.put(
            f"/api/aplus/{book_id}/document", params={"language": language}, json=DOCUMENT
        )
        assert response.status_code in (400, 422), response.text

    @pytest.mark.parametrize("template", ["", "Has Space", "x" * 41])
    def test_malformed_template_is_rejected(self, client: TestClient, template: str) -> None:
        book_id = _book_id(client)
        module = {**DOCUMENT["modules"][0], "template": template}
        response = client.put(_url(book_id), json={**DOCUMENT, "modules": [module]})
        assert response.status_code == 422

    def test_too_many_modules_is_rejected(self, client: TestClient) -> None:
        book_id = _book_id(client)
        modules = [{**DOCUMENT["modules"][0], "id": f"m{i}"} for i in range(21)]
        response = client.put(_url(book_id), json={**DOCUMENT, "modules": modules})
        assert response.status_code == 422
