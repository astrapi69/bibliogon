"""Integration tests for dynamically mounted plugin routes (Kinderbuch, KDP, Comics).

These plugins are registered during the FastAPI lifespan, so the TestClient
MUST be used as a context manager to trigger lifespan events.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    """Provide a TestClient with lifespan so plugin routes are mounted."""
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Kinderbuch plugin routes
# ---------------------------------------------------------------------------


class TestKinderbuchTemplates:
    """Tests for GET /api/kinderbuch/templates."""

    def test_kinderbuch_templates_returns_list(self, client: TestClient) -> None:
        """GET /api/kinderbuch/templates returns 200 with exactly 4 templates."""
        resp = client.get("/api/kinderbuch/templates")
        assert resp.status_code == 200
        templates = resp.json()
        assert isinstance(templates, list)
        assert len(templates) == 4

    def test_kinderbuch_templates_have_required_fields(self, client: TestClient) -> None:
        """Each template entry contains id, label, description, and layout."""
        resp = client.get("/api/kinderbuch/templates")
        templates = resp.json()
        required_fields = {"id", "label", "description", "layout"}
        for template in templates:
            assert required_fields.issubset(template.keys()), (
                f"Template {template.get('id', '?')} missing fields: "
                f"{required_fields - template.keys()}"
            )

    def test_kinderbuch_template_ids_are_unique(self, client: TestClient) -> None:
        """All template IDs are distinct."""
        resp = client.get("/api/kinderbuch/templates")
        templates = resp.json()
        ids = [t["id"] for t in templates]
        assert len(ids) == len(set(ids))


class TestKinderbuchPreview:
    """Tests for POST /api/kinderbuch/preview."""

    def test_kinderbuch_preview_returns_html(self, client: TestClient) -> None:
        """POST /api/kinderbuch/preview with valid body returns HTML content."""
        body = {
            "text": "Once upon a time...",
            "image": None,
            "layout": "image-top-text-bottom",
        }
        resp = client.post("/api/kinderbuch/preview", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert "html" in data
        assert "<" in data["html"], "Response should contain HTML markup"

    def test_kinderbuch_preview_text_only_layout(self, client: TestClient) -> None:
        """Preview with text-only layout returns HTML without an image element."""
        body = {"text": "A story without pictures.", "layout": "text-only"}
        resp = client.post("/api/kinderbuch/preview", json=body)
        assert resp.status_code == 200
        html = resp.json()["html"]
        assert "A story without pictures." in html


# ---------------------------------------------------------------------------
# KDP plugin routes
# ---------------------------------------------------------------------------


class TestKdpCategories:
    """Tests for GET /api/kdp/categories."""

    def test_kdp_categories_returns_list(self, client: TestClient) -> None:
        """GET /api/kdp/categories returns 200 with a non-empty list of strings."""
        resp = client.get("/api/kdp/categories")
        assert resp.status_code == 200
        categories = resp.json()
        assert isinstance(categories, list)
        assert len(categories) > 0
        assert all(isinstance(cat, str) for cat in categories)


class TestKdpCheckMetadata:
    """Tests for POST /api/kdp/check-metadata."""

    def test_kdp_check_metadata_missing_fields(self, client: TestClient) -> None:
        """Incomplete metadata returns errors for missing required fields."""
        body = {
            "title": "",
            "author": "",
            "language": "",
        }
        resp = client.post("/api/kdp/check-metadata", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["complete"] is False
        assert data["error_count"] > 0
        error_fields = [issue["field"] for issue in data["issues"] if issue["severity"] == "error"]
        assert "title" in error_fields
        assert "author" in error_fields
        assert "language" in error_fields

    def test_kdp_check_metadata_complete(self, client: TestClient) -> None:
        """Complete metadata with all required fields passes without errors."""
        body = {
            "title": "My Book",
            "author": "Asterios Raptis",
            "language": "en",
            "description": "A great book about testing.",
            "chapters": [{"title": "Chapter 1"}],
        }
        resp = client.post("/api/kdp/check-metadata", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["complete"] is True
        assert data["error_count"] == 0


class TestKdpMetadata:
    """Tests for POST /api/kdp/metadata."""

    def test_kdp_metadata_generation(self, client: TestClient) -> None:
        """POST /api/kdp/metadata returns KDP-formatted metadata."""
        body = {
            "title": "Test Book",
            "author": "Test Author",
            "description": "A test description.",
            "language": "de",
            "categories": ["Literature & Fiction"],
            "keywords": ["test", "fiction", "demo"],
        }
        resp = client.post("/api/kdp/metadata", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Test Book"
        assert data["author"] == "Test Author"
        assert isinstance(data["categories"], list)
        assert isinstance(data["keywords"], list)
        assert len(data["keywords"]) <= 7

    def test_kdp_metadata_keywords_capped_at_seven(self, client: TestClient) -> None:
        """KDP metadata caps keywords at 7 even if more are provided."""
        body = {
            "title": "Keyword Book",
            "author": "Author",
            "keywords": ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"],
        }
        resp = client.post("/api/kdp/metadata", json=body)
        assert resp.status_code == 200
        assert len(resp.json()["keywords"]) == 7


# ---------------------------------------------------------------------------
# Comics plugin routes (Session 1: scaffolding)
# ---------------------------------------------------------------------------


class TestComicsInfo:
    """Tests for GET /api/comics/info.

    The route exists primarily as a backend-tier gate: if this endpoint
    is missing, the backend's combined poetry.lock has lost the
    plugin-comics path-dep. Per the "Two installation paths" rule
    (.claude/rules/lessons-learned.md), both the backend lock and the
    per-plugin lock must be green; this test is the backend-lock half.
    """

    def test_comics_info_returns_200(self, client: TestClient) -> None:
        resp = client.get("/api/comics/info")
        assert resp.status_code == 200

    def test_comics_info_identity(self, client: TestClient) -> None:
        body = client.get("/api/comics/info").json()
        assert body["name"] == "comics"
        assert body["version"] == "1.0.0"

    def test_comics_info_session_phase(self, client: TestClient) -> None:
        # Session-1 marker pin. If a future commit ships Session-2
        # work, this test must update along with the plugin's status.
        body = client.get("/api/comics/info").json()
        assert body["session"] == 1
        assert body["status"] == "scaffolding"
