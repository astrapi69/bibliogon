"""Bulk article export tests.

Covers the new ``POST /articles/bulk-export`` endpoint plus the
list-filter additions (``?series=...&tag=...``) that compose with
the existing ``status`` and ``topic`` filters.

Pandoc-driven formats (HTML / PDF / DOCX) execute the real Pandoc
binary because the per-article export tests in this repo already
do; the smoke-level checks here verify the response media type and
non-empty body, not the rendered content. Markdown skips Pandoc.
"""

from __future__ import annotations

import io
import json
import zipfile
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_article(
    title: str = "Article",
    *,
    body: str = "Hello world.",
    status: str | None = None,
    topic: str | None = None,
    series: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """Create an article and patch optional metadata in a second request."""
    resp = client.post("/api/articles", json={"title": title})
    assert resp.status_code == 201, resp.text
    article = resp.json()
    patch_payload: dict[str, Any] = {
        "content_json": json.dumps(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": body}],
                    }
                ],
            }
        ),
    }
    if status is not None:
        patch_payload["status"] = status
    if topic is not None:
        patch_payload["topic"] = topic
    if series is not None:
        patch_payload["series"] = series
    if tags is not None:
        patch_payload["tags"] = tags
    resp = client.patch(f"/api/articles/{article['id']}", json=patch_payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


# --- list-filter additions ----------------------------------------


class TestListFilters:
    def test_filter_by_series(self) -> None:
        a = _create_article("Series-A", series="Cosmos")
        b = _create_article("Series-B", series="Cosmos")
        c = _create_article("Series-C", series="Other")
        resp = client.get("/api/articles", params={"series": "Cosmos"})
        assert resp.status_code == 200
        ids = {row["id"] for row in resp.json()}
        assert {a["id"], b["id"]}.issubset(ids)
        assert c["id"] not in ids

    def test_filter_by_tag_matches_membership_not_substring(self) -> None:
        a = _create_article("Tag-A", tags=["python", "pytest"])
        b = _create_article("Tag-B", tags=["pythonista"])  # superstring
        resp = client.get("/api/articles", params={"tag": "python"})
        assert resp.status_code == 200
        ids = {row["id"] for row in resp.json()}
        assert a["id"] in ids
        assert b["id"] not in ids

    def test_filter_compose_and(self) -> None:
        a = _create_article(
            "AND-A", series="Stoa", topic="Philosophy", status="published"
        )
        b = _create_article(
            "AND-B", series="Stoa", topic="Philosophy", status="draft"
        )
        c = _create_article(
            "AND-C", series="Stoa", topic="History", status="published"
        )
        resp = client.get(
            "/api/articles",
            params={
                "series": "Stoa",
                "topic": "Philosophy",
                "status": "published",
            },
        )
        assert resp.status_code == 200
        ids = {row["id"] for row in resp.json()}
        assert a["id"] in ids
        assert b["id"] not in ids
        assert c["id"] not in ids


# --- bulk export validation ---------------------------------------


class TestBulkExportValidation:
    def test_empty_article_ids_returns_422(self) -> None:
        resp = client.post(
            "/api/articles/bulk-export",
            json={"article_ids": [], "format": "markdown", "mode": "zip"},
        )
        assert resp.status_code == 422

    def test_over_limit_returns_422(self) -> None:
        resp = client.post(
            "/api/articles/bulk-export",
            json={
                "article_ids": [f"id-{i}" for i in range(201)],
                "format": "markdown",
                "mode": "zip",
            },
        )
        assert resp.status_code == 422

    def test_unknown_id_returns_404_with_id_in_message(self) -> None:
        resp = client.post(
            "/api/articles/bulk-export",
            json={
                "article_ids": ["does-not-exist"],
                "format": "markdown",
                "mode": "zip",
            },
        )
        assert resp.status_code == 404
        assert "does-not-exist" in resp.json()["detail"]


# --- bulk export ZIP output ---------------------------------------


class TestBulkExportZip:
    def test_zip_markdown_three_articles(self) -> None:
        a = _create_article("Z-A", body="Body of A.")
        b = _create_article("Z-B", body="Body of B.")
        c = _create_article("Z-C", body="Body of C.")
        resp = client.post(
            "/api/articles/bulk-export",
            json={
                "article_ids": [a["id"], b["id"], c["id"]],
                "format": "markdown",
                "mode": "zip",
            },
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            names = sorted(zf.namelist())
            assert names == ["z-a.md", "z-b.md", "z-c.md"]
            payload = zf.read("z-a.md").decode("utf-8")
            assert "# Z-A" in payload
            assert "Body of A." in payload

    def test_zip_filename_collision_uses_numeric_suffix(self) -> None:
        a = _create_article("Same Title")
        b = _create_article("Same Title")
        c = _create_article("Same Title")
        resp = client.post(
            "/api/articles/bulk-export",
            json={
                "article_ids": [a["id"], b["id"], c["id"]],
                "format": "markdown",
                "mode": "zip",
            },
        )
        assert resp.status_code == 200
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            names = sorted(zf.namelist())
            assert names == ["same-title-2.md", "same-title-3.md", "same-title.md"]


# --- bulk export combined output ----------------------------------


class TestBulkExportCombined:
    def test_combined_markdown_strips_h1_and_uses_h2_headers(self) -> None:
        a = _create_article("Combined-A", body="Body A.")
        b = _create_article("Combined-B", body="Body B.")
        resp = client.post(
            "/api/articles/bulk-export",
            json={
                "article_ids": [a["id"], b["id"]],
                "format": "markdown",
                "mode": "combined",
            },
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/markdown")
        body = resp.content.decode("utf-8")
        # Per-article H1 must be gone (`# Combined-A` line, not the
        # `## Combined-A` H2 line). Use line-anchored regex to avoid
        # the obvious-string-substring false positive.
        import re

        assert not re.search(r"^# Combined-A$", body, flags=re.MULTILINE)
        assert not re.search(r"^# Combined-B$", body, flags=re.MULTILINE)
        # Replaced by H2 section headers.
        assert "## Combined-A" in body
        assert "## Combined-B" in body
        # Separator between articles.
        assert "---" in body
        # Bodies preserved.
        assert "Body A." in body
        assert "Body B." in body
        # Filename in headers.
        assert "articles-" in resp.headers["content-disposition"]

    def test_combined_id_order_preserved(self) -> None:
        a = _create_article("Order-First", body="aaa")
        b = _create_article("Order-Second", body="bbb")
        c = _create_article("Order-Third", body="ccc")
        # Send IDs in reverse to verify the response respects input order.
        resp = client.post(
            "/api/articles/bulk-export",
            json={
                "article_ids": [c["id"], a["id"], b["id"]],
                "format": "markdown",
                "mode": "combined",
            },
        )
        assert resp.status_code == 200
        body = resp.content.decode("utf-8")
        idx_a = body.index("Order-First")
        idx_b = body.index("Order-Second")
        idx_c = body.index("Order-Third")
        assert idx_c < idx_a < idx_b

    def test_combined_html_includes_toc_and_section_anchors(self) -> None:
        a = _create_article("HTML-A", body="Body A.")
        b = _create_article("HTML-B", body="Body B.")
        resp = client.post(
            "/api/articles/bulk-export",
            json={
                "article_ids": [a["id"], b["id"]],
                "format": "html",
                "mode": "combined",
            },
        )
        if resp.status_code == 502:
            pytest.skip("Pandoc unavailable in test environment")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/html")
        body = resp.content.decode("utf-8")
        assert "<h2" in body  # section headings rendered
        assert 'id="' in body  # anchor IDs auto-generated by Pandoc

    def test_combined_docx_returns_office_media_type(self) -> None:
        a = _create_article("DOCX-A", body="Body A.")
        b = _create_article("DOCX-B", body="Body B.")
        resp = client.post(
            "/api/articles/bulk-export",
            json={
                "article_ids": [a["id"], b["id"]],
                "format": "docx",
                "mode": "combined",
            },
        )
        if resp.status_code == 502:
            pytest.skip("Pandoc unavailable in test environment")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        # DOCX is a ZIP under the hood; first 4 bytes are PK\x03\x04.
        assert resp.content[:4] == b"PK\x03\x04"

    def test_combined_pdf_returns_pdf_magic_bytes(self) -> None:
        a = _create_article("PDF-A", body="Body A.")
        b = _create_article("PDF-B", body="Body B.")
        resp = client.post(
            "/api/articles/bulk-export",
            json={
                "article_ids": [a["id"], b["id"]],
                "format": "pdf",
                "mode": "combined",
            },
        )
        if resp.status_code == 502:
            pytest.skip("Pandoc/xelatex unavailable in test environment")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content[:4] == b"%PDF"
