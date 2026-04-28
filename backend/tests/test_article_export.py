"""AR editor-parity Phase 3: article export tests."""

from __future__ import annotations

import json
import shutil
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PANDOC_AVAILABLE = shutil.which("pandoc") is not None


def _create(title: str = "Sample Article") -> dict:
    resp = client.post("/api/articles", json={"title": title})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _patch(article_id: str, **fields) -> None:
    resp = client.patch(f"/api/articles/{article_id}", json=fields)
    assert resp.status_code == 200, resp.text


def test_list_supported_formats_returns_4_formats() -> None:
    article = _create()
    resp = client.get(f"/api/articles/{article['id']}/export")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["formats"]) == {"markdown", "html", "pdf", "docx"}
    assert set(body["pandoc_required"]) == {"html", "pdf", "docx"}


def test_list_supported_formats_404_on_missing() -> None:
    resp = client.get("/api/articles/ghost/export")
    assert resp.status_code == 404


def test_export_markdown_renders_title_subtitle_author_body() -> None:
    article = _create("My Article")
    _patch(
        article["id"],
        subtitle="A subtitle",
        author="Jane Doe",
        content_json=json.dumps({
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Hello world."}]},
            ],
        }),
    )
    resp = client.get(f"/api/articles/{article['id']}/export/markdown")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    body = resp.text
    assert "# My Article" in body
    assert "_A subtitle_" in body
    assert "*by Jane Doe*" in body
    assert "Hello world." in body
    assert resp.headers["content-disposition"].startswith("attachment;")
    assert "my-article.md" in resp.headers["content-disposition"]


def test_export_md_alias_resolves_to_markdown() -> None:
    article = _create("Alias Test")
    resp = client.get(f"/api/articles/{article['id']}/export/md")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    assert "alias-test.md" in resp.headers["content-disposition"]


def test_export_markdown_handles_empty_body() -> None:
    article = _create("Empty Body")
    resp = client.get(f"/api/articles/{article['id']}/export/markdown")
    assert resp.status_code == 200
    assert "# Empty Body" in resp.text


def test_export_rejects_unsupported_format() -> None:
    article = _create("Bad Format")
    resp = client.get(f"/api/articles/{article['id']}/export/epub")
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "epub" in detail.lower() or "format" in detail.lower()


def test_export_404_on_missing_article() -> None:
    resp = client.get("/api/articles/ghost/export/markdown")
    assert resp.status_code == 404


def test_export_returns_502_when_pandoc_missing(monkeypatch) -> None:
    """When pandoc binary is absent, html/pdf/docx return 502 with
    actionable message instead of a confusing crash."""
    article = _create("No Pandoc")
    with patch("app.routers.article_export.shutil.which", return_value=None):
        resp = client.get(f"/api/articles/{article['id']}/export/html")
    assert resp.status_code == 502
    assert "pandoc" in resp.json()["detail"].lower()


@pytest.mark.skipif(not PANDOC_AVAILABLE, reason="pandoc binary not installed")
def test_export_html_via_pandoc() -> None:
    article = _create("HTML Test")
    _patch(
        article["id"],
        content_json=json.dumps({
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Body text."}]},
            ],
        }),
    )
    resp = client.get(f"/api/articles/{article['id']}/export/html")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/html")
    body = resp.text
    assert "<h1" in body
    assert "HTML Test" in body
    assert "Body text." in body


@pytest.mark.skipif(not PANDOC_AVAILABLE, reason="pandoc binary not installed")
def test_export_docx_via_pandoc() -> None:
    article = _create("Docx Test")
    resp = client.get(f"/api/articles/{article['id']}/export/docx")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    # DOCX is a ZIP - magic bytes "PK\x03\x04"
    assert resp.content.startswith(b"PK\x03\x04")
    assert "docx-test.docx" in resp.headers["content-disposition"]


def test_slugify_handles_umlauts_and_punctuation() -> None:
    article = _create("Über/Foo: Bar! Baz?")
    resp = client.get(f"/api/articles/{article['id']}/export/markdown")
    assert resp.status_code == 200
    cd = resp.headers["content-disposition"]
    # Punctuation stripped, slashes too. Umlaut may or may not survive
    # \w under unicode mode - just assert no slashes / no punctuation
    # leak into the filename and the .md extension landed.
    assert ".md" in cd
    assert "/" not in cd.split("filename=")[1]
    assert "?" not in cd
    assert "!" not in cd
