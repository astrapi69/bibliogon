"""The four AI columns are writable through the public PATCH (#1076).

``ArticleOut`` and ``BookOut`` have returned ``featured_image_prompt``,
``inline_image_prompts``, ``cover_image_prompt`` and
``chapter_summaries`` since the AI-template work landed, but no update
body accepted them: Pydantic's default ``extra="ignore"`` meant a client
could PATCH one, get a 200, and find nothing written. The only writers
were two AI endpoints mutating the ORM row directly, which is why every
offline path drops these four fields.

Each test writes a non-default value through the endpoint and re-reads
it, rather than asserting the field reached the schema - the kwarg
reaching the model is not the behaviour anyone depends on.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _article(**extra) -> dict:
    resp = client.post("/api/articles", json={"title": "Prompt host", **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _book(**extra) -> dict:
    resp = client.post(
        "/api/books", json={"title": "Prompt host", "author": "Marta Rivers", **extra}
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _chapter(book_id: str, title: str) -> dict:
    resp = client.post(f"/api/books/{book_id}/chapters", json={"title": title})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


# --- Article ---


def test_patch_article_writes_featured_image_prompt() -> None:
    article = _article()
    prompt = "A newspaper dissolving into pixels, cool blue light, no text in image"
    resp = client.patch(
        f"/api/articles/{article['id']}",
        json={"featured_image_prompt": prompt},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["featured_image_prompt"] == prompt
    # Re-read, because a value echoed from the request body proves the
    # response model and not the column.
    assert client.get(f"/api/articles/{article['id']}").json()["featured_image_prompt"] == prompt


def test_patch_article_writes_inline_image_prompts() -> None:
    article = _article()
    prompts = [
        {"section_hint": "Introduction", "prompt": "Overlapping headlines, no text"},
        {"section_hint": "Spread", "prompt": "Red nodes pulsing outward, no text"},
    ]
    resp = client.patch(
        f"/api/articles/{article['id']}",
        json={"inline_image_prompts": prompts},
    )
    assert resp.status_code == 200, resp.text
    assert client.get(f"/api/articles/{article['id']}").json()["inline_image_prompts"] == prompts


def test_patch_article_clears_inline_image_prompts_with_empty_list() -> None:
    article = _article()
    client.patch(
        f"/api/articles/{article['id']}",
        json={"inline_image_prompts": [{"section_hint": "a", "prompt": "b"}]},
    )
    # Asserted before the clear, or the test would pass on a PATCH that
    # writes nothing at all: `[]` is both the post-clear state and the
    # never-written state.
    assert len(client.get(f"/api/articles/{article['id']}").json()["inline_image_prompts"]) == 1
    resp = client.patch(f"/api/articles/{article['id']}", json={"inline_image_prompts": []})
    assert resp.status_code == 200, resp.text
    # An empty list is a value, not an absent field: the AI-template
    # apply path distinguishes the two and so must the column.
    assert client.get(f"/api/articles/{article['id']}").json()["inline_image_prompts"] == []


def test_patch_article_rejects_a_malformed_inline_image_prompt() -> None:
    article = _article()
    resp = client.patch(
        f"/api/articles/{article['id']}",
        json={"inline_image_prompts": ["just a string"]},
    )
    # Refused rather than stored: junk in a JSON-text column surfaces
    # later as a decode failure in the template export, far from here.
    assert resp.status_code == 422, resp.text
    assert client.get(f"/api/articles/{article['id']}").json()["inline_image_prompts"] == []


def test_patch_article_leaves_the_prompts_alone_when_absent() -> None:
    article = _article()
    prompt = "Keep me"
    client.patch(f"/api/articles/{article['id']}", json={"featured_image_prompt": prompt})
    resp = client.patch(f"/api/articles/{article['id']}", json={"title": "Renamed"})
    assert resp.status_code == 200, resp.text
    body = client.get(f"/api/articles/{article['id']}").json()
    assert body["title"] == "Renamed"
    assert body["featured_image_prompt"] == prompt


# --- Book ---


def test_patch_book_writes_cover_image_prompt() -> None:
    book = _book()
    prompt = "Hand-drawn vintage map, muted earth tones, portrait, no text in image"
    resp = client.patch(f"/api/books/{book['id']}", json={"cover_image_prompt": prompt})
    assert resp.status_code == 200, resp.text
    assert client.get(f"/api/books/{book['id']}").json()["cover_image_prompt"] == prompt


def test_patch_book_writes_chapter_summaries() -> None:
    book = _book()
    chapter = _chapter(book["id"], "The First Survey")
    summaries = [
        {
            "chapter_id": chapter["id"],
            "title": "The First Survey",
            "summary": "Marta arrives and lays out the methodology.",
        }
    ]
    resp = client.patch(f"/api/books/{book['id']}", json={"chapter_summaries": summaries})
    assert resp.status_code == 200, resp.text
    assert client.get(f"/api/books/{book['id']}").json()["chapter_summaries"] == summaries


def test_patch_book_chapter_summaries_are_stored_as_json_text() -> None:
    book = _book()
    chapter = _chapter(book["id"], "Only")
    summaries = [{"chapter_id": chapter["id"], "title": "Only", "summary": "One line."}]
    client.patch(f"/api/books/{book['id']}", json={"chapter_summaries": summaries})
    # The column convention is JSON-text, like keywords: a list assigned
    # raw would store a Python repr the API could not decode back.
    from app.database import SessionLocal
    from app.models import Book

    with SessionLocal() as session:
        raw = session.query(Book).filter(Book.id == book["id"]).one().chapter_summaries
    assert isinstance(raw, str)
    assert json.loads(raw) == summaries


def test_patch_book_rejects_a_malformed_chapter_summary() -> None:
    book = _book()
    resp = client.patch(f"/api/books/{book['id']}", json={"chapter_summaries": [42]})
    assert resp.status_code == 422, resp.text
    assert client.get(f"/api/books/{book['id']}").json()["chapter_summaries"] == []


def test_patch_book_leaves_the_prompt_alone_when_absent() -> None:
    book = _book()
    prompt = "Keep me"
    client.patch(f"/api/books/{book['id']}", json={"cover_image_prompt": prompt})
    resp = client.patch(f"/api/books/{book['id']}", json={"subtitle": "A subtitle"})
    assert resp.status_code == 200, resp.text
    body = client.get(f"/api/books/{book['id']}").json()
    assert body["subtitle"] == "A subtitle"
    assert body["cover_image_prompt"] == prompt
