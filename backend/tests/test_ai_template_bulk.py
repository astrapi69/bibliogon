"""End-to-end tests for the bulk AI-template export and
import endpoints.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 8/10. Pins:

- Export accepts an explicit ids list, packs one .biblio.yaml
  per record into a ZIP, dedupes filename collisions, and
  surfaces missing IDs as 404.
- Cap MAX_BULK_AI_TEMPLATE = 50 enforced on both export
  request (Pydantic max_length) and import ZIP entry count
  (422).
- Import processes each .biblio.yaml independently; the
  Medium-importer response shape (imported / failed) carries
  per-entry details. Type mismatch (article posted to /books
  import), missing reference block, and unknown reference.id
  each surface as failed entries instead of killing the call.
- Per-entry force semantics flow through to the standard
  apply pipeline.
- Book bulk import flows chapter_summaries reconciliation
  through to per-entry dropped_chapter_summaries.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest
import yaml
from fastapi.testclient import TestClient

from app.ai.template_schema import SCHEMA_VERSION
from app.main import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _create_article(client: TestClient, *, title: str) -> dict:
    resp = client.post(
        "/api/articles", json={"title": title, "language": "en"}
    )
    assert resp.status_code == 201
    return resp.json()


def _create_book(client: TestClient, *, title: str) -> dict:
    resp = client.post(
        "/api/books",
        json={"title": title, "language": "en", "author": "Test"},
    )
    assert resp.status_code in (200, 201)
    return resp.json()


def _zip_from(named_yamls: list[tuple[str, str]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, text in named_yamls:
            zf.writestr(name, text)
    return buf.getvalue()


def _article_template_yaml(article_id: str, *, language: str = "en") -> str:
    body = {
        "type": "article",
        "schema_version": SCHEMA_VERSION,
        "reference": {
            "id": article_id,
            "language": language,
            "body_word_count": 5,
            "body_preview": "x",
        },
        "title": {"description": "x", "example": "x", "current_value": None},
        "seo_title": {
            "description": "x",
            "example": "x",
            "current_value": "Bulk SEO Title",
        },
        "seo_description": {"description": "x", "example": "x", "current_value": None},
        "excerpt": {"description": "x", "example": "x", "current_value": None},
        "tags": {"description": "x", "example": [], "current_value": []},
        "topic": {"description": "x", "example": "x", "current_value": None},
        "featured_image_prompt": {
            "description": "x",
            "example": "x",
            "current_value": None,
        },
        "inline_image_prompts": {
            "description": "x",
            "example": [],
            "current_value": [],
        },
    }
    return yaml.safe_dump(body, sort_keys=False, allow_unicode=True)


def _book_template_yaml(book_id: str, *, language: str = "en") -> str:
    body = {
        "type": "book",
        "schema_version": SCHEMA_VERSION,
        "reference": {
            "id": book_id,
            "language": language,
            "body_word_count": 5,
            "body_preview": "x",
        },
        "title": {"description": "x", "example": "x", "current_value": None},
        "subtitle": {
            "description": "x",
            "example": "x",
            "current_value": "Bulk Subtitle",
        },
        "description": {"description": "x", "example": "x", "current_value": None},
        "genre": {"description": "x", "example": "x", "current_value": None},
        "keywords": {"description": "x", "example": [], "current_value": []},
        "html_description": {
            "description": "x",
            "example": "x",
            "current_value": None,
        },
        "backpage_description": {
            "description": "x",
            "example": "x",
            "current_value": None,
        },
        "backpage_author_bio": {
            "description": "x",
            "example": "x",
            "current_value": None,
        },
        "cover_image_prompt": {
            "description": "x",
            "example": "x",
            "current_value": None,
        },
        "chapter_summaries": {
            "description": "x",
            "example": [],
            "current_value": [],
        },
    }
    return yaml.safe_dump(body, sort_keys=False, allow_unicode=True)


# ---------------------------------------------------------------------------
# Article export
# ---------------------------------------------------------------------------


def test_article_bulk_export_returns_zip_with_one_yaml_per_id(client):
    a1 = _create_article(client, title="Alpha")
    a2 = _create_article(client, title="Beta")
    a3 = _create_article(client, title="Gamma")

    resp = client.post(
        "/api/articles/bulk-ai-template/export",
        json={"ids": [a1["id"], a2["id"], a3["id"]]},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"

    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = zf.namelist()
    assert len(names) == 3
    assert "alpha.biblio.yaml" in names
    assert "beta.biblio.yaml" in names
    assert "gamma.biblio.yaml" in names

    # Each entry parses back to a valid article template referencing the original id.
    yaml_text = zf.read("alpha.biblio.yaml").decode("utf-8")
    body = "\n".join(line for line in yaml_text.splitlines() if not line.startswith("#"))
    parsed = yaml.safe_load(body)
    assert parsed["type"] == "article"
    assert parsed["reference"]["id"] == a1["id"]


def test_article_bulk_export_dedupes_filename_collisions(client):
    a1 = _create_article(client, title="Same Title")
    a2 = _create_article(client, title="Same Title")
    a3 = _create_article(client, title="Same Title")

    resp = client.post(
        "/api/articles/bulk-ai-template/export",
        json={"ids": [a1["id"], a2["id"], a3["id"]]},
    )
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = sorted(zf.namelist())
    assert names == [
        "same-title-2.biblio.yaml",
        "same-title-3.biblio.yaml",
        "same-title.biblio.yaml",
    ]


def test_article_bulk_export_missing_id_returns_404(client):
    a1 = _create_article(client, title="Alpha")
    resp = client.post(
        "/api/articles/bulk-ai-template/export",
        json={"ids": [a1["id"], "doesnotexist"]},
    )
    assert resp.status_code == 404
    assert "doesnotexist" in resp.json()["detail"]


def test_article_bulk_export_cap_enforced_by_pydantic(client):
    ids = [f"id-{i}" for i in range(51)]
    resp = client.post(
        "/api/articles/bulk-ai-template/export", json={"ids": ids}
    )
    assert resp.status_code == 422


def test_article_bulk_export_empty_ids_returns_422(client):
    resp = client.post("/api/articles/bulk-ai-template/export", json={"ids": []})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Article import
# ---------------------------------------------------------------------------


def test_article_bulk_import_applies_each_template(client):
    a1 = _create_article(client, title="Alpha")
    a2 = _create_article(client, title="Beta")

    zip_bytes = _zip_from(
        [
            ("alpha.biblio.yaml", _article_template_yaml(a1["id"])),
            ("beta.biblio.yaml", _article_template_yaml(a2["id"])),
        ]
    )

    resp = client.post(
        "/api/articles/bulk-ai-template/import",
        files={"file": ("templates.zip", zip_bytes, "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["imported"]) == 2
    assert body["failed"] == []
    for entry in body["imported"]:
        assert "seo_title" in entry["updated_fields"]


def test_article_bulk_import_surfaces_failures_per_entry(client):
    a1 = _create_article(client, title="Alpha")

    zip_bytes = _zip_from(
        [
            ("good.biblio.yaml", _article_template_yaml(a1["id"])),
            (
                "wrong-type.biblio.yaml",
                _book_template_yaml("anybookid"),
            ),
            (
                "unknown-article.biblio.yaml",
                _article_template_yaml("notarealid"),
            ),
            (
                "broken.biblio.yaml",
                "type: article\nschema_version: 99\n",
            ),
        ]
    )

    resp = client.post(
        "/api/articles/bulk-ai-template/import",
        files={"file": ("templates.zip", zip_bytes, "application/zip")},
    )
    body = resp.json()
    assert len(body["imported"]) == 1
    assert len(body["failed"]) == 3
    failure_reasons = {f["filename"]: f["error"] for f in body["failed"]}
    assert "book" in failure_reasons["wrong-type.biblio.yaml"]
    assert "not found" in failure_reasons["unknown-article.biblio.yaml"]
    assert "schema_version" in failure_reasons["broken.biblio.yaml"]


def test_article_bulk_import_rejects_non_zip(client):
    resp = client.post(
        "/api/articles/bulk-ai-template/import",
        files={"file": ("not-zip.txt", b"plain text", "text/plain")},
    )
    assert resp.status_code == 400


def test_article_bulk_import_rejects_zip_without_biblio_files(client):
    zip_bytes = _zip_from([("readme.txt", "no yaml here")])
    resp = client.post(
        "/api/articles/bulk-ai-template/import",
        files={"file": ("empty.zip", zip_bytes, "application/zip")},
    )
    assert resp.status_code == 400
    assert ".biblio.yaml" in resp.json()["detail"]


def test_article_bulk_import_cap_enforced(client):
    # 51 entries, none valid - the cap fires before parse.
    entries = [
        (f"entry-{i}.biblio.yaml", _article_template_yaml(f"id-{i}"))
        for i in range(51)
    ]
    zip_bytes = _zip_from(entries)
    resp = client.post(
        "/api/articles/bulk-ai-template/import",
        files={"file": ("big.zip", zip_bytes, "application/zip")},
    )
    assert resp.status_code == 422
    assert "cap" in resp.json()["detail"].lower()


def test_article_bulk_import_force_propagates(client):
    article = _create_article(client, title="Alpha")
    client.patch(
        f"/api/articles/{article['id']}", json={"seo_title": "Existing"}
    )

    zip_bytes = _zip_from(
        [("alpha.biblio.yaml", _article_template_yaml(article["id"]))]
    )

    # force=false (default) -> seo_title already populated, skipped.
    resp = client.post(
        "/api/articles/bulk-ai-template/import",
        files={"file": ("a.zip", zip_bytes, "application/zip")},
    )
    body = resp.json()
    assert body["imported"][0]["skip_reasons"]["seo_title"] == "field-already-populated"
    assert body["force"] is False

    # force=true -> overwrite.
    resp_force = client.post(
        "/api/articles/bulk-ai-template/import?force=true",
        files={"file": ("a.zip", zip_bytes, "application/zip")},
    )
    body_force = resp_force.json()
    assert "seo_title" in body_force["imported"][0]["updated_fields"]
    refreshed = client.get(f"/api/articles/{article['id']}").json()
    assert refreshed["seo_title"] == "Bulk SEO Title"


# ---------------------------------------------------------------------------
# Book export + import
# ---------------------------------------------------------------------------


def test_book_bulk_export_packs_yaml_per_book(client):
    b1 = _create_book(client, title="Book Alpha")
    b2 = _create_book(client, title="Book Beta")
    resp = client.post(
        "/api/books/bulk-ai-template/export",
        json={"ids": [b1["id"], b2["id"]]},
    )
    assert resp.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert len(zf.namelist()) == 2
    assert "book-alpha.biblio.yaml" in zf.namelist()


def test_book_bulk_import_applies_and_drops_phantom_summaries(client):
    book = _create_book(client, title="The Book")
    ch = client.post(
        f"/api/books/{book['id']}/chapters",
        json={"title": "Real Chapter", "content": ""},
    ).json()

    # Hand-build a YAML with one real + one phantom chapter
    # summary so we can verify the reconciliation flows through
    # the bulk endpoint.
    body = yaml.safe_load(_book_template_yaml(book["id"]))
    body["chapter_summaries"]["current_value"] = [
        {"chapter_id": ch["id"], "title": "Real Chapter", "summary": "ok"},
        {"chapter_id": "ghost", "title": "Ghost", "summary": "no"},
    ]
    yaml_text = yaml.safe_dump(body, sort_keys=False)

    zip_bytes = _zip_from([("the-book.biblio.yaml", yaml_text)])

    resp = client.post(
        "/api/books/bulk-ai-template/import",
        files={"file": ("books.zip", zip_bytes, "application/zip")},
    )
    body_resp = resp.json()
    assert len(body_resp["imported"]) == 1
    entry = body_resp["imported"][0]
    assert "chapter_summaries" in entry["updated_fields"]
    assert len(entry["dropped_chapter_summaries"]) == 1
    assert entry["dropped_chapter_summaries"][0]["chapter_id"] == "ghost"


def test_book_bulk_import_rejects_article_template_per_entry(client):
    book = _create_book(client, title="The Book")

    zip_bytes = _zip_from(
        [
            ("good.biblio.yaml", _book_template_yaml(book["id"])),
            (
                "wrong.biblio.yaml",
                _article_template_yaml("anyarticleid"),
            ),
        ]
    )
    resp = client.post(
        "/api/books/bulk-ai-template/import",
        files={"file": ("books.zip", zip_bytes, "application/zip")},
    )
    body = resp.json()
    assert len(body["imported"]) == 1
    assert len(body["failed"]) == 1
    assert "article" in body["failed"][0]["error"]


# ---------------------------------------------------------------------------
# Round-trip across the bulk endpoints
# ---------------------------------------------------------------------------


def test_article_bulk_export_then_import_is_idempotent(client):
    a = _create_article(client, title="Round-trip Alpha")
    client.patch(f"/api/articles/{a['id']}", json={"seo_title": "Already Set"})

    export = client.post(
        "/api/articles/bulk-ai-template/export", json={"ids": [a["id"]]}
    )
    zip_bytes = export.content

    resp = client.post(
        "/api/articles/bulk-ai-template/import",
        files={"file": ("a.zip", zip_bytes, "application/zip")},
    )
    body = resp.json()
    # Every field is either already populated or AI returned
    # null -> no updates.
    assert body["imported"][0]["updated_fields"] == []
