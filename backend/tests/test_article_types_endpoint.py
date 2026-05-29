"""Endpoint tests for GET /api/article-types.

Filed by ARTICLE-TYPES-SSOT-01 (2026-05-29). The endpoint exposes
the ArticleTypeRegistry mapping so the frontend's
``useArticleTypes()`` hook can hydrate the React Context. Mirrors
the test_book_types_endpoint.py shape.

LRU cache discipline: same yield-based autouse fixture as the
registry test — clears on BOTH setup and teardown so the
fake-YAML fixture's result doesn't poison cross-file state.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import article_type_registry
from app.services.article_type_registry import load_article_types


@pytest.fixture(autouse=True)
def _clear_cache():
    load_article_types.cache_clear()
    yield
    load_article_types.cache_clear()


def test_endpoint_returns_eight_real_article_types() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/article-types")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {
        "blogpost",
        "tutorial",
        "review",
        "essay",
        "newsletter",
        "interview",
        "listicle",
        "short_story",
    }


def test_endpoint_includes_interview_extra_fields() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/article-types")
    body = resp.json()
    interview = body["interview"]
    assert interview["icon"] == "Users"
    fields = interview["extra_fields"]
    assert [f["name"] for f in fields] == [
        "interview_partner_name",
        "interview_partner_role",
    ]
    assert all(f["type"] == "text" for f in fields)


def test_endpoint_listicle_and_short_story_have_no_extra_fields() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/article-types")
    body = resp.json()
    assert body["listicle"]["icon"] == "ListOrdered"
    assert body["listicle"]["extra_fields"] == []
    assert body["short_story"]["icon"] == "BookOpen"
    assert body["short_story"]["extra_fields"] == []


def test_endpoint_shape_matches_ArticleTypeDef() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/article-types")
    assert resp.status_code == 200
    body = resp.json()
    blogpost = body["blogpost"]
    assert blogpost["id"] == "blogpost"
    assert blogpost["label_key"] == "ui.article_types.blogpost"
    assert blogpost["description_key"] == "ui.article_types.blogpost_description"
    assert blogpost["icon"] == "FileText"
    assert blogpost["default"] is True
    assert blogpost["extra_fields"] == []


def test_tutorial_extra_fields_serialised_correctly() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/article-types")
    body = resp.json()
    tutorial = body["tutorial"]
    assert tutorial["icon"] == "GraduationCap"
    assert tutorial.get("default") is False
    fields = tutorial["extra_fields"]
    assert [f["name"] for f in fields] == [
        "difficulty_level",
        "prerequisites",
        "estimated_duration_minutes",
    ]
    difficulty = fields[0]
    assert difficulty["type"] == "enum"
    assert difficulty["values"] == ["beginner", "intermediate", "advanced"]


def test_review_rating_bounds_present_in_response() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/article-types")
    body = resp.json()
    rating = next(
        f for f in body["review"]["extra_fields"] if f["name"] == "rating"
    )
    assert rating["min"] == 1
    assert rating["max"] == 5


def test_endpoint_returns_empty_dict_when_registry_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        article_type_registry,
        "_REGISTRY_PATH",
        tmp_path / "missing.yaml",
    )
    load_article_types.cache_clear()
    with TestClient(app) as client:
        resp = client.get("/api/article-types")
    assert resp.status_code == 200
    assert resp.json() == {}
