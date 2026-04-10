"""Tests for the help plugin's docs-based routes.

These tests create a temporary docs directory with _meta.yaml and
sample Markdown files, then exercise the navigation, page, and search
endpoints against that structure.
"""

import json
from pathlib import Path
from textwrap import dedent

import pytest
import yaml

from bibliogon_help.routes import (
    DOCS_ROOT,
    _resolve_locale,
    _resolve_nav,
    _validate_slug,
)


# --- Fixtures ---

@pytest.fixture
def docs_dir(tmp_path, monkeypatch):
    """Create a temporary docs structure and point the routes at it."""
    import bibliogon_help.routes as routes_mod
    monkeypatch.setattr(routes_mod, "DOCS_ROOT", tmp_path)

    # _meta.yaml
    meta = {
        "languages": [
            {"code": "de", "name": "Deutsch", "default": True},
            {"code": "en", "name": "English"},
        ],
        "navigation": [
            {
                "title": {"de": "Erste Schritte", "en": "Getting Started"},
                "slug": "getting-started",
                "icon": "rocket",
            },
            {
                "title": {"de": "Editor", "en": "Editor"},
                "slug": "editor",
                "icon": "edit",
                "children": [
                    {
                        "title": {"de": "Uebersicht", "en": "Overview"},
                        "slug": "editor/uebersicht",
                    },
                ],
            },
        ],
    }
    (tmp_path / "_meta.yaml").write_text(yaml.dump(meta), encoding="utf-8")

    # German pages
    de_dir = tmp_path / "de"
    de_dir.mkdir()
    (de_dir / "getting-started.md").write_text(
        "# Erste Schritte\n\nWillkommen bei Bibliogon.\n", encoding="utf-8",
    )
    editor_dir = de_dir / "editor"
    editor_dir.mkdir()
    (editor_dir / "uebersicht.md").write_text(
        "# Editor Uebersicht\n\nDer TipTap Editor ist das Herzsueck.\n", encoding="utf-8",
    )

    # English page (only getting-started, to test fallback)
    en_dir = tmp_path / "en"
    en_dir.mkdir()
    (en_dir / "getting-started.md").write_text(
        "# Getting Started\n\nWelcome to Bibliogon.\n", encoding="utf-8",
    )

    return tmp_path


# --- Unit tests for helpers ---


class TestResolveLocale:
    def test_known_locale(self):
        meta = {"languages": [{"code": "de", "default": True}, {"code": "en"}]}
        assert _resolve_locale("en", meta) == "en"

    def test_unknown_falls_back_to_default(self):
        meta = {"languages": [{"code": "de", "default": True}, {"code": "en"}]}
        assert _resolve_locale("fr", meta) == "de"


class TestResolveNav:
    def test_flat_item(self):
        items = [{"title": {"de": "Start", "en": "Start"}, "slug": "start", "icon": "x"}]
        result = _resolve_nav(items, "de")
        assert result == [{"title": "Start", "slug": "start", "icon": "x"}]

    def test_nested_children(self):
        items = [{
            "title": {"de": "Editor"},
            "slug": "editor",
            "icon": "edit",
            "children": [{"title": {"de": "Uebersicht"}, "slug": "editor/uebersicht"}],
        }]
        result = _resolve_nav(items, "de")
        assert len(result) == 1
        assert len(result[0]["children"]) == 1
        assert result[0]["children"][0]["title"] == "Uebersicht"


class TestValidateSlug:
    def test_valid(self):
        _validate_slug("getting-started")
        _validate_slug("editor/uebersicht")

    def test_traversal_rejected(self):
        with pytest.raises(Exception):
            _validate_slug("../../etc/passwd")

    def test_absolute_path_rejected(self):
        with pytest.raises(Exception):
            _validate_slug("/etc/passwd")

    def test_backslash_rejected(self):
        with pytest.raises(Exception):
            _validate_slug("editor\\uebersicht")


# --- Integration tests via FastAPI TestClient ---


@pytest.fixture
def client(docs_dir):
    """Create a TestClient with the help router mounted."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from bibliogon_help.routes import router

    app = FastAPI()
    app.include_router(router, prefix="/api")
    return TestClient(app)


class TestNavigationEndpoint:
    def test_german_navigation(self, client):
        r = client.get("/api/help/navigation/de")
        assert r.status_code == 200
        nav = r.json()
        assert len(nav) == 2
        assert nav[0]["title"] == "Erste Schritte"
        assert nav[0]["slug"] == "getting-started"
        assert nav[1]["title"] == "Editor"
        assert len(nav[1]["children"]) == 1

    def test_english_navigation(self, client):
        r = client.get("/api/help/navigation/en")
        assert r.status_code == 200
        assert r.json()[0]["title"] == "Getting Started"

    def test_unknown_locale_falls_back(self, client):
        r = client.get("/api/help/navigation/fr")
        assert r.status_code == 200
        # Falls back to German (default)
        assert r.json()[0]["title"] == "Erste Schritte"


class TestPageEndpoint:
    def test_german_page(self, client):
        r = client.get("/api/help/page/de/getting-started")
        assert r.status_code == 200
        body = r.json()
        assert body["slug"] == "getting-started"
        assert body["locale"] == "de"
        assert "# Erste Schritte" in body["content"]
        assert "last_modified" in body

    def test_english_page(self, client):
        r = client.get("/api/help/page/en/getting-started")
        assert r.status_code == 200
        assert "Welcome" in r.json()["content"]

    def test_nested_slug(self, client):
        r = client.get("/api/help/page/de/editor/uebersicht")
        assert r.status_code == 200
        assert "TipTap" in r.json()["content"]

    def test_missing_page_returns_404(self, client):
        r = client.get("/api/help/page/de/nonexistent")
        assert r.status_code == 404

    def test_english_fallback_to_german(self, client):
        """English page for editor/uebersicht does not exist -> falls back to DE."""
        r = client.get("/api/help/page/en/editor/uebersicht")
        assert r.status_code == 200
        assert r.json()["locale"] == "de"
        assert "TipTap" in r.json()["content"]

    def test_path_traversal_blocked(self, client):
        r = client.get("/api/help/page/de/../../etc/passwd")
        assert r.status_code >= 400


class TestSearchEndpoint:
    def test_search_finds_match(self, client):
        r = client.get("/api/help/search/de?q=TipTap")
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) >= 1
        assert any("TipTap" in res["snippet"] for res in results)

    def test_search_returns_title(self, client):
        r = client.get("/api/help/search/de?q=Bibliogon")
        results = r.json()["results"]
        assert len(results) >= 1
        assert results[0]["title"]  # not empty

    def test_search_empty_query(self, client):
        r = client.get("/api/help/search/de?q=")
        assert r.json() == {"results": []}

    def test_search_short_query(self, client):
        r = client.get("/api/help/search/de?q=x")
        assert r.json() == {"results": []}

    def test_search_no_results(self, client):
        r = client.get("/api/help/search/de?q=xyznonexistent")
        assert r.json()["results"] == []

    def test_search_unknown_locale(self, client):
        r = client.get("/api/help/search/fr?q=Bibliogon")
        # Falls back to DE
        assert r.status_code == 200
