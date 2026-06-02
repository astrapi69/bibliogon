"""Regression pins for QA L5: Book/Article titles reject NUL + other C0
control characters and are length-capped (SQLite enforces neither)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_book_title_rejects_null_byte():
    with TestClient(app) as c:
        r = c.post("/api/books", json={"title": "a\x00b", "author": "A"})
        assert r.status_code == 422, r.text


def test_book_title_rejects_overlong():
    with TestClient(app) as c:
        r = c.post("/api/books", json={"title": "X" * 10000, "author": "A"})
        assert r.status_code == 422, r.text


def test_book_title_accepts_normal():
    with TestClient(app) as c:
        r = c.post("/api/books", json={"title": "A Normal Title", "author": "A"})
        assert r.status_code in (200, 201), r.text


def test_book_patch_title_rejects_null_byte():
    with TestClient(app) as c:
        bid = c.post("/api/books", json={"title": "T", "author": "A"}).json()["id"]
        r = c.patch(f"/api/books/{bid}", json={"title": "bad\x00title"})
        assert r.status_code == 422, r.text


def test_article_title_rejects_null_byte_and_overlong():
    with TestClient(app) as c:
        assert c.post("/api/articles", json={"title": "x\x00y"}).status_code == 422
        assert c.post("/api/articles", json={"title": "X" * 10000}).status_code == 422
        assert c.post("/api/articles", json={"title": "Fine"}).status_code in (200, 201)
