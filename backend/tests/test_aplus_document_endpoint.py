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


def _with_defaults(modules: list[dict]) -> list[dict]:
    """Modules as stored: the #895 parts default to empty values."""
    return [
        {
            **module,
            "slots": [{"caption": "", "asin": "", **slot} for slot in module["slots"]],
            "fields": module.get("fields", {}),
            "rows": module.get("rows", []),
        }
        for module in modules
    ]


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
        for key in ("content_name", "short_description", "bullets"):
            assert body[key] == DOCUMENT[key]
        assert body["modules"] == _with_defaults(DOCUMENT["modules"])
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


class TestTemplateModules:
    """Modules of the full catalog (#895) carry fields, table rows and extra slot texts."""

    def test_fields_rows_caption_and_asin_round_trip(self, client: TestClient) -> None:
        book_id = _book_id(client)
        modules = [
            {
                "id": "s1",
                "template": "image_sidebar",
                "module_title": "Kopf",
                "slots": [
                    {
                        "title": "",
                        "text": "",
                        "image_prompt": "p",
                        "alt_text": "a",
                        "caption": "Unterschrift",
                    },
                    {"title": "T", "text": "x", "image_prompt": "q", "alt_text": "b"},
                ],
                "fields": {"description_body": "Beschreibung", "bullets": "eins\nzwei"},
            },
            {
                "id": "c1",
                "template": "comparison_chart",
                "module_title": "",
                "slots": [{"title": "Band 1", "asin": "B0FR1X1MVX"}],
                "rows": [{"label": "Genre", "values": ["Krimi"]}],
            },
        ]
        client.put(_url(book_id), json={**DOCUMENT, "modules": modules})
        stored = client.get(_url(book_id)).json()["modules"]
        assert stored[0]["fields"] == {"description_body": "Beschreibung", "bullets": "eins\nzwei"}
        assert stored[0]["slots"][0]["caption"] == "Unterschrift"
        assert stored[1]["slots"][0]["asin"] == "B0FR1X1MVX"
        assert stored[1]["rows"] == [{"label": "Genre", "values": ["Krimi"]}]

    def test_documents_without_the_new_parts_read_back_with_defaults(
        self, client: TestClient
    ) -> None:
        book_id = _book_id(client)
        client.put(_url(book_id), json=DOCUMENT)
        module = client.get(_url(book_id)).json()["modules"][0]
        assert module["fields"] == {}
        assert module["rows"] == []
        assert module["slots"][0]["caption"] == ""

    def test_too_many_rows_are_rejected(self, client: TestClient) -> None:
        book_id = _book_id(client)
        module = {**DOCUMENT["modules"][0], "rows": [{"label": "x", "values": []}] * 21}
        response = client.put(_url(book_id), json={**DOCUMENT, "modules": [module]})
        assert response.status_code == 422


class TestDocumentList:
    def test_lists_every_language_of_the_book(self, client: TestClient) -> None:
        book_id = _book_id(client)
        other_book = _book_id(client)
        client.put(_url(book_id, "es"), json=DOCUMENT)
        client.put(_url(book_id, "de"), json={**DOCUMENT, "content_name": "Deutsch"})
        client.put(_url(other_book, "es"), json=DOCUMENT)
        response = client.get(f"/api/aplus/{book_id}/documents")
        assert response.status_code == 200, response.text
        body = response.json()
        assert sorted(d["language"] for d in body) == ["de", "es"]
        assert all(d["book_id"] == book_id for d in body)

    def test_empty_list_when_none_exist(self, client: TestClient) -> None:
        book_id = _book_id(client)
        assert client.get(f"/api/aplus/{book_id}/documents").json() == []

    def test_unknown_book_is_404(self, client: TestClient) -> None:
        assert client.get("/api/aplus/does-not-exist/documents").status_code == 404


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
