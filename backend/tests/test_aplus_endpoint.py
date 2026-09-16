"""End-to-end tests for the A+ Content plugin's HTTP surface (#825).

plugin-aplus is enabled in config/app.yaml, so the TestClient lifespan
mounts its router. The AI client is patched at
``bibliogon_aplus.routes._get_client`` throughout - no network calls.
"""

from __future__ import annotations

import json
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


class TestImageStyleInTheResponse:
    """#865: the ruleset's ``image_style`` block has to reach the
    package that the endpoints return - not just the builder module's
    own unit tests. Every value below is asserted against the live
    ruleset AND against the literal the ruleset carries today, so a
    silent ruleset edit and a silent wiring regression both fail."""

    def _generate(self, client: TestClient, **book_overrides) -> tuple[dict, dict]:
        book = _create_book(client)
        if book_overrides:
            client.patch(f"/api/books/{book['id']}", json=book_overrides)
        with patch("bibliogon_aplus.routes._get_client", return_value=_FakeClient()):
            response = client.post(f"/api/aplus/{book['id']}/generate")
        assert response.status_code == 200, response.text
        return book, response.json()

    def test_header_image_carries_the_97_60_ratio_and_970x600_size(
        self, client: TestClient
    ) -> None:
        from bibliogon_aplus.rules import get_ruleset

        _, body = self._generate(client)
        image = body["module_header"]["image"]
        assert image["prompt"] == "cinematic, warm lighting"
        assert image["aspect_ratio"] == "97:60"
        assert image["size"] == "970x600"
        style = get_ruleset().image_style
        assert image["aspect_ratio"] == style.aspect_ratios["module_header"]
        assert image["size"] == style.target_pixel_sizes["module_header"]

    def test_every_tile_image_carries_the_1_1_ratio_and_300x300_size(
        self, client: TestClient
    ) -> None:
        _, body = self._generate(client)
        tiles = body["module_three_images"]
        assert len(tiles) == 3
        for tile in tiles:
            assert tile["image"]["prompt"] == "minimalist, flat colors"
            assert tile["image"]["aspect_ratio"] == "1:1"
            assert tile["image"]["size"] == "300x300"

    def test_a_non_fiction_book_gets_the_default_style_flags(self, client: TestClient) -> None:
        from bibliogon_aplus.rules import get_ruleset

        _, body = self._generate(client, genre="Sachbuch")
        flags = body["module_header"]["image"]["style_flags"]
        assert flags == list(get_ruleset().image_style.default_style_flags)
        assert "photorealistic" in flags
        assert "friendly illustration" not in flags

    def test_a_kinderbuch_gets_the_illustration_style_flags(self, client: TestClient) -> None:
        """The genre detection has to change the IMAGES, not only the
        text tone and the validator - the whole point of #830/#839/#854
        for the picture modules."""
        _, body = self._generate(client, genre="Kinderbuch")
        header_flags = body["module_header"]["image"]["style_flags"]
        assert "friendly illustration" in header_flags
        assert "warm colors" in header_flags
        assert "photorealistic" not in header_flags
        for tile in body["module_three_images"]:
            assert "friendly illustration" in tile["image"]["style_flags"]

    def test_rendered_prompt_is_the_fields_joined_in_the_approved_form(
        self, client: TestClient
    ) -> None:
        _, body = self._generate(client, genre="Kinderbuch")
        images = [body["module_header"]["image"]] + [
            tile["image"] for tile in body["module_three_images"]
        ]
        for image in images:
            expected = (
                f"{image['prompt']} --ar {image['aspect_ratio']} {' '.join(image['style_flags'])}"
            )
            assert image["rendered"] == expected
        assert body["module_header"]["image"]["rendered"] == (
            "cinematic, warm lighting --ar 97:60 friendly illustration warm colors "
            "children's book art style no text overlay"
        )

    def test_rendered_is_derived_on_every_response_and_never_stored(
        self, client: TestClient
    ) -> None:
        """A frozen string would go stale the moment the ruleset's
        flags change; only the parts are persisted."""
        from app.models import AplusContent

        book, body = self._generate(client)
        assert "rendered" in body["module_header"]["image"]
        with SessionLocal() as db:
            row = db.query(AplusContent).filter(AplusContent.book_id == book["id"]).one()
            assert '"rendered"' not in row.content_json
            assert '"aspect_ratio"' in row.content_json

        fake = _FakeClient()
        with patch("bibliogon_aplus.routes._get_client", return_value=fake):
            cached = client.post(f"/api/aplus/{book['id']}/generate").json()
        assert fake.call_count == 0, "second call must be served from the cache"
        assert (
            cached["module_header"]["image"]["rendered"]
            == body["module_header"]["image"]["rendered"]
        )
        fetched = client.get(f"/api/aplus/{book['id']}").json()
        assert (
            fetched["module_header"]["image"]["rendered"]
            == body["module_header"]["image"]["rendered"]
        )
        for tile in fetched["module_three_images"]:
            assert tile["image"]["rendered"].startswith("minimalist, flat colors --ar 1:1 ")

    def test_a_package_stored_before_the_image_block_existed_is_still_served(
        self, client: TestClient
    ) -> None:
        """Rows cached under ruleset version 2 have no ``image`` key.
        GET returns them as stored (plus nothing), instead of crashing
        on the missing key; the next POST regenerates because the
        ruleset version no longer matches."""
        from app.models import AplusContent

        book, _ = self._generate(client)
        with SessionLocal() as db:
            row = db.query(AplusContent).filter(AplusContent.book_id == book["id"]).one()
            row.content_json = json.dumps(
                {
                    "short_description": "old",
                    "bullets": [],
                    "module_header": {"title": "", "text": "", "image_prompt": "x", "alt_text": ""},
                    "module_three_images": [],
                    "validation": [],
                    "meta": {
                        "book_id": book["id"],
                        "language": "en",
                        "model": "",
                        "ruleset_version": "2",
                        "generated_at": "",
                    },
                }
            )
            row.ruleset_version = "2"
            db.commit()
        fetched = client.get(f"/api/aplus/{book['id']}")
        assert fetched.status_code == 200, fetched.text
        assert "image" not in fetched.json()["module_header"]
        fake = _FakeClient()
        with patch("bibliogon_aplus.routes._get_client", return_value=fake):
            regenerated = client.post(f"/api/aplus/{book['id']}/generate").json()
        assert fake.call_count == 1
        assert regenerated["module_header"]["image"]["aspect_ratio"] == "97:60"
