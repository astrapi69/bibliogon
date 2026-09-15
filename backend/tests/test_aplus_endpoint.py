"""End-to-end tests for the A+ Content plugin's HTTP surface (#825).

plugin-aplus is enabled in config/app.yaml, so the TestClient lifespan
mounts its router. The AI client is patched at
``bibliogon_aplus.routes._get_client`` throughout - no network calls.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.ai.llm_client import LLMError
from app.database import SessionLocal
from app.main import app
from app.models import Book

GOOD_YAML = """
short_description: A quiet story about memory and choice.
bullets:
  - heading: Clear structure
    body: Chapters build on each other.
  - heading: Real examples
    body: Every idea comes with a concrete case.
  - heading: Practical takeaways
    body: Readers leave with something usable.
module_header:
  title: Overview
  text: An inviting overview of the book's premise.
  image_prompt: cinematic, warm lighting
  alt_text: A reader immersed in the story
module_three_images:
  - title: Concept one
    text: A supporting idea.
    image_prompt: minimalist, flat colors
    alt_text: Icon representing concept one
  - title: Concept two
    text: Another supporting idea.
    image_prompt: minimalist, flat colors
    alt_text: Icon representing concept two
  - title: Concept three
    text: A final supporting idea.
    image_prompt: minimalist, flat colors
    alt_text: Icon representing concept three
"""


class _FakeClient:
    def __init__(self, content: str = GOOD_YAML, model: str = "fake-model-1") -> None:
        self.content = content
        self.model = model
        self.call_count = 0

    async def chat(self, messages, temperature=None):
        self.call_count += 1
        return {"content": self.content, "model": self.model, "usage": {}}


class _RaisingClient:
    async def chat(self, messages, temperature=None):
        raise LLMError("AI-Server nicht erreichbar (timeout).")


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def enable_ai():
    with patch("bibliogon_aplus.routes._is_ai_enabled", return_value=True):
        yield


def _create_book(client: TestClient, **overrides) -> dict:
    payload = {
        "title": "The Formable Eternity",
        "author": "Aster Raptis",
        "language": "en",
        "description": "A quiet meditation on consciousness and time.",
    }
    payload.update(overrides)
    resp = client.post("/api/books", json=payload)
    assert resp.status_code in (200, 201), resp.text
    book_id = resp.json()["id"]
    # description is create-time; author may need a PATCH depending on
    # the book schema's narrow create surface (mirrors #797's finding).
    patch_fields = {k: v for k, v in overrides.items() if k not in payload or k == "description"}
    if patch_fields or "description" in payload:
        client.patch(f"/api/books/{book_id}", json={"description": payload["description"]})
    return client.get(f"/api/books/{book_id}").json()


class TestUnknownBook:
    def test_generate_on_an_unknown_book_is_404(self, client: TestClient) -> None:
        with patch("bibliogon_aplus.routes._get_client", return_value=_FakeClient()):
            response = client.post("/api/aplus/does-not-exist/generate")
        assert response.status_code == 404

    def test_get_on_an_unknown_book_is_404(self, client: TestClient) -> None:
        response = client.get("/api/aplus/does-not-exist")
        assert response.status_code == 404


class TestMissingFieldsShortCircuit:
    def test_missing_author_returns_a_structured_list_not_a_generic_error(
        self, client: TestClient
    ) -> None:
        book = _create_book(client)
        # The book API guards author=None at the presentation layer
        # (settings toggle "allow books without author"); the DB
        # column is nullable, so this simulates an existing legacy
        # row rather than exercising the create-time guard.
        with SessionLocal() as db:
            row = db.query(Book).filter(Book.id == book["id"]).one()
            row.author = None
            db.commit()
        with patch("bibliogon_aplus.routes._get_client") as mocked:
            response = client.post(f"/api/aplus/{book['id']}/generate")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["book_id"] == book["id"]
        assert any(m["field"] == "author" for m in body["missing_fields"])
        mocked.assert_not_called()

    def test_missing_every_description_source_is_reported(self, client: TestClient) -> None:
        book_id = client.post("/api/books", json={"title": "No Description", "author": "A"}).json()[
            "id"
        ]
        with patch("bibliogon_aplus.routes._get_client") as mocked:
            response = client.post(f"/api/aplus/{book_id}/generate")
        assert response.status_code == 200
        assert any(m["field"] == "description" for m in response.json()["missing_fields"])
        mocked.assert_not_called()


class TestHappyPath:
    def test_generate_returns_a_full_package(self, client: TestClient) -> None:
        book = _create_book(client)
        fake = _FakeClient()
        with patch("bibliogon_aplus.routes._get_client", return_value=fake):
            response = client.post(f"/api/aplus/{book['id']}/generate")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["short_description"].startswith("A quiet story")
        assert len(body["bullets"]) == 3
        assert len(body["module_three_images"]) == 3
        assert body["meta"]["book_id"] == book["id"]
        assert not any(f["severity"] == "error" for f in body["validation"])

    def test_get_returns_the_last_generated_package(self, client: TestClient) -> None:
        book = _create_book(client)
        with patch("bibliogon_aplus.routes._get_client", return_value=_FakeClient()):
            client.post(f"/api/aplus/{book['id']}/generate")
        response = client.get(f"/api/aplus/{book['id']}")
        assert response.status_code == 200
        assert response.json()["short_description"].startswith("A quiet story")

    def test_get_before_any_generation_is_404(self, client: TestClient) -> None:
        book = _create_book(client)
        response = client.get(f"/api/aplus/{book['id']}")
        assert response.status_code == 404


class TestCaching:
    def test_a_second_generate_call_without_force_uses_the_cache(self, client: TestClient) -> None:
        book = _create_book(client)
        fake = _FakeClient()
        with patch("bibliogon_aplus.routes._get_client", return_value=fake):
            client.post(f"/api/aplus/{book['id']}/generate")
            client.post(f"/api/aplus/{book['id']}/generate")
        assert fake.call_count == 1

    def test_force_true_bypasses_the_cache(self, client: TestClient) -> None:
        book = _create_book(client)
        fake = _FakeClient()
        with patch("bibliogon_aplus.routes._get_client", return_value=fake):
            client.post(f"/api/aplus/{book['id']}/generate")
            client.post(f"/api/aplus/{book['id']}/generate?force=true")
        assert fake.call_count == 2

    def test_a_changed_description_invalidates_the_cache(self, client: TestClient) -> None:
        book = _create_book(client)
        fake = _FakeClient()
        with patch("bibliogon_aplus.routes._get_client", return_value=fake):
            client.post(f"/api/aplus/{book['id']}/generate")
            client.patch(f"/api/books/{book['id']}", json={"description": "A brand new premise."})
            client.post(f"/api/aplus/{book['id']}/generate")
        assert fake.call_count == 2


class TestErrorHandling:
    def test_ai_unreachable_names_the_cause_not_just_a_generic_failure(
        self, client: TestClient
    ) -> None:
        book = _create_book(client)
        with patch("bibliogon_aplus.routes._get_client", return_value=_RaisingClient()):
            response = client.post(f"/api/aplus/{book['id']}/generate")
        assert response.status_code == 502
        assert "nicht erreichbar" in response.json()["detail"]

    def test_ai_disabled_is_reported_not_a_500(self, client: TestClient) -> None:
        book = _create_book(client)
        with patch("bibliogon_aplus.routes._is_ai_enabled", return_value=False):
            response = client.post(f"/api/aplus/{book['id']}/generate")
        assert response.status_code == 400

    def test_unsupported_language_is_a_400(self, client: TestClient) -> None:
        book = _create_book(client)
        with patch("bibliogon_aplus.routes._get_client", return_value=_FakeClient()):
            response = client.post(f"/api/aplus/{book['id']}/generate?language=ja")
        assert response.status_code == 400


class TestHtmlImportedBookFixture:
    """Fixture rule (#806): at least one HTML-imported-book-shaped
    input, since real imported books carry HTML in html_description,
    not plain text."""

    def test_html_description_with_an_embedded_image_tag_still_generates(
        self, client: TestClient
    ) -> None:
        book_id = client.post(
            "/api/books", json={"title": "Imported Book", "author": "Someone"}
        ).json()["id"]
        client.patch(
            f"/api/books/{book_id}",
            json={
                "html_description": (
                    "<p>Ein Buch über Bewusstsein und Zeit.</p>"
                    '<img src="assets/figures/cover.png" alt="Cover" />'
                )
            },
        )
        with patch("bibliogon_aplus.routes._get_client", return_value=_FakeClient()):
            response = client.post(f"/api/aplus/{book_id}/generate")
        assert response.status_code == 200, response.text
        assert response.json()["short_description"]
