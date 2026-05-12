"""End-to-end tests for the Book AI-template endpoints.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 6/10. Mirrors
``test_article_ai_template`` with book-specific additions:

- chapter_summaries reconciliation per S4 (match by
  chapter_id, fallback to whitespace-normalized case-
  insensitive title, drop on no match).
- Lenient title matcher accepts Schreibweise-Variationen.
- Dropped entries surface in the response under
  ``dropped_chapter_summaries`` so the UI can render them
  for the user.
"""

from __future__ import annotations

import textwrap

import pytest
import yaml
from fastapi.testclient import TestClient

from app.ai.template_schema import SCHEMA_VERSION
from app.main import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _create_book(
    client: TestClient,
    *,
    title: str = "The Last Cartographer",
    language: str = "en",
    author: str = "Marta Rivers",
) -> dict:
    payload = {"title": title, "language": language, "author": author}
    resp = client.post("/api/books", json=payload)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _add_chapter(client: TestClient, book_id: str, title: str) -> dict:
    resp = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": title, "content": ""},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# GET per-book export
# ---------------------------------------------------------------------------


def test_export_returns_yaml_with_header_and_reference(client):
    book = _create_book(client)
    _add_chapter(client, book["id"], "Chapter One")

    resp = client.get(f"/api/books/{book['id']}/ai-template")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/yaml")

    text = resp.text
    assert text.startswith("#")
    assert "Bibliogon Book Template" in text
    assert "chapter_summaries" in text  # book-specific header section

    body = "\n".join(line for line in text.splitlines() if not line.startswith("#"))
    parsed = yaml.safe_load(body)
    assert parsed["type"] == "book"
    assert parsed["reference"]["id"] == book["id"]
    assert parsed["title"]["current_value"] == "The Last Cartographer"


def test_export_content_disposition_has_book_slug(client):
    book = _create_book(client, title="Über alles")
    resp = client.get(f"/api/books/{book['id']}/ai-template")
    assert "uber-alles" in resp.headers["content-disposition"].lower()


def test_export_returns_404_for_unknown_book(client):
    resp = client.get("/api/books/nope/ai-template")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET empty new-idea book template
# ---------------------------------------------------------------------------


def test_empty_book_template_omits_reference_and_uses_root_language(client):
    resp = client.get("/api/ai-templates/book?language=de")
    body = "\n".join(line for line in resp.text.splitlines() if not line.startswith("#"))
    parsed = yaml.safe_load(body)
    assert parsed["type"] == "book"
    assert "reference" not in parsed
    assert parsed["language"] == "de"
    for field in ("title", "subtitle", "keywords", "chapter_summaries", "cover_image_prompt"):
        assert "description" in parsed[field]
        assert "example" in parsed[field]
        assert "current_value" in parsed[field]


def test_empty_book_filename_includes_language(client):
    resp = client.get("/api/ai-templates/book?language=fr")
    assert "new-book-fr" in resp.headers["content-disposition"].lower()


# ---------------------------------------------------------------------------
# POST per-book import — field application
# ---------------------------------------------------------------------------


def _filled_book_template(
    book: dict,
    *,
    title: str | None = None,
    subtitle: str | None = None,
    description: str | None = None,
    genre: str | None = None,
    keywords: list[str] | None = None,
    html_description: str | None = None,
    backpage_description: str | None = None,
    backpage_author_bio: str | None = None,
    cover_image_prompt: str | None = None,
    chapter_summaries: list[dict] | None = None,
) -> str:
    body = {
        "type": "book",
        "schema_version": SCHEMA_VERSION,
        "reference": {
            "id": book["id"],
            "language": book["language"],
            "body_word_count": 0,
            "body_preview": "",
        },
        "title": {
            "description": "Title",
            "example": "X",
            "current_value": title if title is not None else book["title"],
        },
        "subtitle": {
            "description": "Subtitle",
            "example": "X",
            "current_value": subtitle,
        },
        "description": {
            "description": "Description",
            "example": "X",
            "current_value": description,
        },
        "genre": {
            "description": "Genre",
            "example": "X",
            "current_value": genre,
        },
        "keywords": {
            "description": "Keywords",
            "example": ["a"],
            "current_value": keywords if keywords is not None else [],
        },
        "html_description": {
            "description": "HTML description",
            "example": "X",
            "current_value": html_description,
        },
        "backpage_description": {
            "description": "Back-page",
            "example": "X",
            "current_value": backpage_description,
        },
        "backpage_author_bio": {
            "description": "Bio",
            "example": "X",
            "current_value": backpage_author_bio,
        },
        "cover_image_prompt": {
            "description": "Cover prompt",
            "example": "X",
            "current_value": cover_image_prompt,
        },
        "chapter_summaries": {
            "description": "Summaries",
            "example": [{"chapter_id": "x", "title": "x", "summary": "x"}],
            "current_value": chapter_summaries if chapter_summaries is not None else [],
        },
    }
    return yaml.safe_dump(body, sort_keys=False, allow_unicode=True)


def test_import_applies_basic_fields(client):
    book = _create_book(client)
    yaml_text = _filled_book_template(
        book,
        subtitle="A Practical Guide",
        description="A field guide for cartographers.",
        genre="Non-Fiction",
        keywords=["cartography", "field-guide"],
        cover_image_prompt="Vintage map, muted palette",
    )
    resp = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "subtitle" in body["updated_fields"]
    assert "description" in body["updated_fields"]
    assert "genre" in body["updated_fields"]
    assert "keywords" in body["updated_fields"]
    assert "cover_image_prompt" in body["updated_fields"]
    # Title was already populated -> skipped.
    assert body["skip_reasons"]["title"] == "field-already-populated"

    refreshed = client.get(f"/api/books/{book['id']}").json()
    assert refreshed["subtitle"] == "A Practical Guide"
    assert refreshed["keywords"] == ["cartography", "field-guide"]
    assert refreshed["cover_image_prompt"] == "Vintage map, muted palette"


def test_import_rejects_article_template(client):
    book = _create_book(client)
    yaml_text = textwrap.dedent(
        f"""\
        type: article
        schema_version: {SCHEMA_VERSION}
        """
    )
    resp = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.status_code == 400


def test_import_returns_404_for_unknown_book(client):
    yaml_text = textwrap.dedent(
        f"""\
        type: book
        schema_version: {SCHEMA_VERSION}
        """
    )
    resp = client.post(
        "/api/books/doesnotexist/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.status_code == 404


def test_import_force_true_overwrites_book_fields(client):
    book = _create_book(client)
    client.patch(f"/api/books/{book['id']}", json={"genre": "Fiction"})
    yaml_text = _filled_book_template(book, genre="Non-Fiction")
    resp = client.post(
        f"/api/books/{book['id']}/ai-template?force=true",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    assert "genre" in resp.json()["updated_fields"]
    refreshed = client.get(f"/api/books/{book['id']}").json()
    assert refreshed["genre"] == "Non-Fiction"


# ---------------------------------------------------------------------------
# Chapter-summaries reconciliation (S4)
# ---------------------------------------------------------------------------


def test_chapter_summaries_matched_by_chapter_id(client):
    book = _create_book(client)
    ch1 = _add_chapter(client, book["id"], "Chapter One")
    ch2 = _add_chapter(client, book["id"], "Chapter Two")

    yaml_text = _filled_book_template(
        book,
        chapter_summaries=[
            {"chapter_id": ch1["id"], "title": "Chapter One", "summary": "Intro."},
            {"chapter_id": ch2["id"], "title": "Chapter Two", "summary": "Details."},
        ],
    )
    resp = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert "chapter_summaries" in body["updated_fields"]
    assert body["dropped_chapter_summaries"] == []

    refreshed = client.get(f"/api/books/{book['id']}").json()
    assert len(refreshed["chapter_summaries"]) == 2
    summaries = {s["chapter_id"]: s["summary"] for s in refreshed["chapter_summaries"]}
    assert summaries[ch1["id"]] == "Intro."
    assert summaries[ch2["id"]] == "Details."


def test_chapter_summaries_title_fallback_lenient_match(client):
    """Title fallback must accept whitespace + case
    variations - per S4 the comparison is intentionally
    lenient."""
    book = _create_book(client)
    ch = _add_chapter(client, book["id"], "The First Survey")

    yaml_text = _filled_book_template(
        book,
        chapter_summaries=[
            {
                # No chapter_id at all; title differs in
                # casing + extra whitespace.
                "title": "  the  FIRST   survey ",
                "summary": "Marta arrives.",
            }
        ],
    )
    resp = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert body["dropped_chapter_summaries"] == []
    refreshed = client.get(f"/api/books/{book['id']}").json()
    assert refreshed["chapter_summaries"][0]["chapter_id"] == ch["id"]
    assert refreshed["chapter_summaries"][0]["title"] == "The First Survey"
    assert refreshed["chapter_summaries"][0]["summary"] == "Marta arrives."


def test_chapter_summaries_unknown_entry_dropped(client):
    book = _create_book(client)
    ch = _add_chapter(client, book["id"], "Real Chapter")

    yaml_text = _filled_book_template(
        book,
        chapter_summaries=[
            {"chapter_id": ch["id"], "title": "Real Chapter", "summary": "ok"},
            {"chapter_id": "fakeid", "title": "Phantom Chapter", "summary": "x"},
        ],
    )
    resp = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert "chapter_summaries" in body["updated_fields"]
    assert len(body["dropped_chapter_summaries"]) == 1
    drop = body["dropped_chapter_summaries"][0]
    assert drop["reason"] == "no-matching-chapter"
    assert drop["chapter_id"] == "fakeid"

    refreshed = client.get(f"/api/books/{book['id']}").json()
    assert len(refreshed["chapter_summaries"]) == 1
    assert refreshed["chapter_summaries"][0]["chapter_id"] == ch["id"]


def test_chapter_summaries_empty_summary_dropped(client):
    book = _create_book(client)
    ch = _add_chapter(client, book["id"], "Chapter One")

    yaml_text = _filled_book_template(
        book,
        chapter_summaries=[
            {"chapter_id": ch["id"], "title": "Chapter One", "summary": "   "},
        ],
    )
    resp = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert len(body["dropped_chapter_summaries"]) == 1
    assert body["dropped_chapter_summaries"][0]["reason"] == "summary-empty"
    # All entries dropped -> distinct skip reason from "value-is-empty".
    assert body["skip_reasons"]["chapter_summaries"] == "all-entries-dropped"


def test_chapter_summaries_all_invalid_distinguishes_from_genuinely_empty(client):
    book = _create_book(client)
    _add_chapter(client, book["id"], "Chapter One")

    # All entries are unmatched -> "all-entries-dropped".
    yaml_text = _filled_book_template(
        book,
        chapter_summaries=[
            {"chapter_id": "ghost1", "title": "Ghost", "summary": "x"},
            {"chapter_id": "ghost2", "title": "Ghost2", "summary": "y"},
        ],
    )
    resp = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_text,
        headers={"Content-Type": "text/yaml"},
    )
    body = resp.json()
    assert body["skip_reasons"]["chapter_summaries"] == "all-entries-dropped"
    assert len(body["dropped_chapter_summaries"]) == 2

    # Empty list -> classic "value-is-empty".
    yaml_text_empty = _filled_book_template(book, chapter_summaries=[])
    resp_empty = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_text_empty,
        headers={"Content-Type": "text/yaml"},
    )
    body_empty = resp_empty.json()
    assert body_empty["skip_reasons"]["chapter_summaries"] == "value-is-empty"


def test_chapter_summaries_force_overwrites_existing(client):
    book = _create_book(client)
    ch = _add_chapter(client, book["id"], "Chapter One")

    # Seed an existing summary.
    yaml_seed = _filled_book_template(
        book,
        chapter_summaries=[
            {"chapter_id": ch["id"], "title": "Chapter One", "summary": "Old."}
        ],
    )
    client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_seed,
        headers={"Content-Type": "text/yaml"},
    )

    # Default force=false should NOT overwrite (column populated).
    yaml_replace = _filled_book_template(
        book,
        chapter_summaries=[
            {"chapter_id": ch["id"], "title": "Chapter One", "summary": "New!"}
        ],
    )
    resp = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=yaml_replace,
        headers={"Content-Type": "text/yaml"},
    )
    assert resp.json()["skip_reasons"]["chapter_summaries"] == "field-already-populated"
    refreshed = client.get(f"/api/books/{book['id']}").json()
    assert refreshed["chapter_summaries"][0]["summary"] == "Old."

    # force=true overwrites.
    resp_force = client.post(
        f"/api/books/{book['id']}/ai-template?force=true",
        data=yaml_replace,
        headers={"Content-Type": "text/yaml"},
    )
    assert "chapter_summaries" in resp_force.json()["updated_fields"]
    refreshed2 = client.get(f"/api/books/{book['id']}").json()
    assert refreshed2["chapter_summaries"][0]["summary"] == "New!"


# ---------------------------------------------------------------------------
# Round-trip
# ---------------------------------------------------------------------------


def test_export_then_import_is_a_no_op(client):
    book = _create_book(client)
    _add_chapter(client, book["id"], "Chapter One")
    client.patch(f"/api/books/{book['id']}", json={"genre": "Non-Fiction"})

    export = client.get(f"/api/books/{book['id']}/ai-template")
    import_resp = client.post(
        f"/api/books/{book['id']}/ai-template",
        data=export.text,
        headers={"Content-Type": "text/yaml"},
    )
    body = import_resp.json()
    assert body["updated_fields"] == []


# ---------------------------------------------------------------------------
# POST /api/books/from-ai-template (Session 2 commit 5 endpoint)
# ---------------------------------------------------------------------------


def _empty_filled_book_template_yaml(
    *,
    title: str = "AI-Generated Book",
    language: str = "en",
    genre: str | None = "Non-Fiction",
    keywords: list[str] | None = None,
    cover_image_prompt: str | None = None,
) -> str:
    """Build a YAML body shaped like the empty-template export
    (no reference; language at root) with some fields pre-
    filled to simulate an AI run."""
    body = {
        "type": "book",
        "schema_version": SCHEMA_VERSION,
        "language": language,
        "title": {"description": "x", "example": "x", "current_value": title},
        "subtitle": {"description": "x", "example": "x", "current_value": None},
        "description": {"description": "x", "example": "x", "current_value": None},
        "genre": {"description": "x", "example": "x", "current_value": genre},
        "keywords": {
            "description": "x",
            "example": [],
            "current_value": keywords if keywords is not None else [],
        },
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
            "current_value": cover_image_prompt,
        },
        "chapter_summaries": {
            "description": "x",
            "example": [],
            "current_value": [],
        },
    }
    return yaml.safe_dump(body, sort_keys=False, allow_unicode=True)


def _allow_books_without_author_env(client, allow: bool):
    """Patch the books module's allow-null-author check for the
    duration of one test. The endpoint imports the helper at
    call time so a single patch covers both inbound paths."""
    return _patch("app.routers.books._allow_books_without_author", return_value=allow)


import unittest.mock  # noqa: E402

_patch = unittest.mock.patch


def test_from_template_creates_new_book_with_title(client):
    yaml_text = _empty_filled_book_template_yaml(
        title="New Book Title",
        language="en",
        genre="Non-Fiction / Reference",
        keywords=["alpha", "beta"],
        cover_image_prompt="vintage map, no text",
    )
    with _allow_books_without_author_env(client, True):
        resp = client.post(
            "/api/books/from-ai-template",
            data=yaml_text,
            headers={"Content-Type": "text/yaml"},
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "New Book Title"
    assert body["genre"] == "Non-Fiction / Reference"
    assert body["keywords"] == ["alpha", "beta"]
    assert body["cover_image_prompt"] == "vintage map, no text"
    assert body["language"] == "en"
    assert body["author"] is None  # allow-null toggle was on
    new_id = body["id"]

    refreshed = client.get(f"/api/books/{new_id}").json()
    assert refreshed["title"] == "New Book Title"


def test_from_template_uses_reference_language_when_present(client):
    body = yaml.safe_load(_empty_filled_book_template_yaml(title="T", language="en"))
    body.pop("language")
    body["reference"] = {
        "id": "ignored-on-create",
        "language": "de",
        "body_word_count": 0,
        "body_preview": "",
    }
    with _allow_books_without_author_env(client, True):
        resp = client.post(
            "/api/books/from-ai-template",
            data=yaml.safe_dump(body, sort_keys=False),
            headers={"Content-Type": "text/yaml"},
        )
    assert resp.status_code == 201
    assert resp.json()["language"] == "de"


def test_from_template_defaults_to_english_when_language_missing(client):
    body = yaml.safe_load(_empty_filled_book_template_yaml(title="T"))
    body.pop("language", None)
    with _allow_books_without_author_env(client, True):
        resp = client.post(
            "/api/books/from-ai-template",
            data=yaml.safe_dump(body, sort_keys=False),
            headers={"Content-Type": "text/yaml"},
        )
    assert resp.status_code == 201
    assert resp.json()["language"] == "en"


def test_from_template_rejects_missing_title(client):
    yaml_text = _empty_filled_book_template_yaml(title="")
    with _allow_books_without_author_env(client, True):
        resp = client.post(
            "/api/books/from-ai-template",
            data=yaml_text,
            headers={"Content-Type": "text/yaml"},
        )
    assert resp.status_code == 400
    assert "title" in resp.json()["detail"].lower()


def test_from_template_rejects_whitespace_only_title(client):
    yaml_text = _empty_filled_book_template_yaml(title="   ")
    with _allow_books_without_author_env(client, True):
        resp = client.post(
            "/api/books/from-ai-template",
            data=yaml_text,
            headers={"Content-Type": "text/yaml"},
        )
    assert resp.status_code == 400


def test_from_template_rejects_article_template(client):
    # Fully-shaped article template so the type-mismatch fires
    # before the Pydantic structural validator.
    article_body = {
        "type": "article",
        "schema_version": SCHEMA_VERSION,
        "title": {"description": "x", "example": "x", "current_value": "T"},
        "seo_title": {"description": "x", "example": "x", "current_value": None},
        "seo_description": {"description": "x", "example": "x", "current_value": None},
        "excerpt": {"description": "x", "example": "x", "current_value": None},
        "tags": {"description": "x", "example": [], "current_value": []},
        "topic": {"description": "x", "example": "x", "current_value": None},
        "featured_image_prompt": {"description": "x", "example": "x", "current_value": None},
        "inline_image_prompts": {"description": "x", "example": [], "current_value": []},
    }
    with _allow_books_without_author_env(client, True):
        resp = client.post(
            "/api/books/from-ai-template",
            data=yaml.safe_dump(article_body, sort_keys=False),
            headers={"Content-Type": "text/yaml"},
        )
    assert resp.status_code == 400
    assert "book" in resp.json()["detail"].lower()


def test_from_template_rejects_unknown_schema_version(client):
    body = "type: book\nschema_version: 99\n"
    with _allow_books_without_author_env(client, True):
        resp = client.post(
            "/api/books/from-ai-template",
            data=body,
            headers={"Content-Type": "text/yaml"},
        )
    assert resp.status_code == 400


def test_from_template_rejects_empty_body(client):
    with _allow_books_without_author_env(client, True):
        resp = client.post(
            "/api/books/from-ai-template",
            data="",
            headers={"Content-Type": "text/yaml"},
        )
    assert resp.status_code == 400


def test_from_template_returns_400_when_author_required_and_missing(client):
    """Default install has allow_books_without_author=False;
    the from-template endpoint never sees an author in the
    template, so the standard validator rejects the create
    with the same 400 message the per-book POST uses."""
    yaml_text = _empty_filled_book_template_yaml(title="T")
    with _allow_books_without_author_env(client, False):
        resp = client.post(
            "/api/books/from-ai-template",
            data=yaml_text,
            headers={"Content-Type": "text/yaml"},
        )
    assert resp.status_code == 400
    assert "author" in resp.json()["detail"].lower()


def test_from_template_applies_force_to_freshly_created_book(client):
    """Every column starts empty on a fresh book row; force=True
    is implicit. Verifies the non-empty current_values land on
    the new book without skip-because-populated."""
    yaml_text = _empty_filled_book_template_yaml(
        title="X",
        genre="Forced Genre",
        keywords=["k1"],
        cover_image_prompt="forced prompt",
    )
    with _allow_books_without_author_env(client, True):
        resp = client.post(
            "/api/books/from-ai-template",
            data=yaml_text,
            headers={"Content-Type": "text/yaml"},
        )
    body = resp.json()
    assert body["genre"] == "Forced Genre"
    assert body["keywords"] == ["k1"]
    assert body["cover_image_prompt"] == "forced prompt"
