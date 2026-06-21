"""Endpoint tests for GET /api/book-types.

Filed by BOOK-TYPES-SSOT-YAML-01 (2026-05-24). The endpoint
exposes the BookTypeRegistry mapping so the frontend's
useBookTypes() hook can hydrate the React Context.

LRU cache discipline: same yield-based autouse fixture as
test_book_type_registry.py — clears on BOTH setup and teardown
so the fake-YAML fixture's result doesn't poison cross-file
state via the module-level cache (per the "Module-level caches
survive test boundaries" lessons-learned rule).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.registries import book_type_registry
from app.services.registries.book_type_registry import load_book_types


@pytest.fixture(autouse=True)
def _clear_cache():
    load_book_types.cache_clear()
    yield
    load_book_types.cache_clear()


def test_endpoint_returns_three_real_book_types() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/book-types")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"prose", "picture_book", "comic_book"}


def test_endpoint_shape_matches_BookTypeDef() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/book-types")
    assert resp.status_code == 200
    body = resp.json()
    prose = body["prose"]
    # Top-level fields present per BookTypeDef.
    assert prose["id"] == "prose"
    assert prose["label_key"] == "ui.get_started.book_type_prose_title"
    assert prose["description_key"] == "ui.get_started.book_type_prose_desc"
    assert prose["icon"] == "BookOpen"
    assert prose["content_model"] == "chapters"
    assert prose["editor_component"] == "BookEditor"
    assert prose["dashboard_create_visible"] is True
    assert prose["immutable_after_create"] is True
    # Capabilities nested.
    assert prose["capabilities"]["ebook_export"] is True
    assert prose["capabilities"]["template_catalog"] is True


def test_picture_book_default_page_size_field_present() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/book-types")
    body = resp.json()
    assert body["picture_book"]["default_page_size"] == "8.5x8.5"
    assert body["comic_book"]["default_page_size"] == "7x10"
    # prose has no default_page_size; field is None (or absent
    # depending on Pydantic serialization).
    assert body["prose"].get("default_page_size") is None


def test_endpoint_returns_empty_dict_when_registry_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Point the registry at a non-existent path so the load fails
    # gracefully (returns empty dict per the registry's
    # missing-file branch). Endpoint must still return 200 with
    # an empty body.
    monkeypatch.setattr(
        book_type_registry, "_REGISTRY_PATH", tmp_path / "missing.yaml"
    )
    load_book_types.cache_clear()
    with TestClient(app) as client:
        resp = client.get("/api/book-types")
    assert resp.status_code == 200
    assert resp.json() == {}
