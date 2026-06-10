"""Tests for the Authors-Database CRUD (Bug 8 Phase 1, Commit 3).

Covers:

- Model round-trip + ``__repr__``
- Slug helper edge cases (ASCII / DE umlauts / general Latin
  diacritics / Nordic letters / all-emoji fallback / collisions)
- Pydantic ``AuthorCreate`` validation gates (name min/max)
- Endpoint behaviour: list (empty / populated / search filter),
  create (happy path + slug auto-generation + slug
  collision-suffixing), retrieve (404), patch (name + bio +
  immutable slug), delete (204 + idempotent)
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.database import SessionLocal
from app.main import app
from app.models import Author
from app.repositories.authors import SqlAlchemyAuthorRepository
from app.routers.authors import _slugify, _unique_slug
from app.schemas import AuthorCreate


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Model round-trip
# ---------------------------------------------------------------------------


def test_author_model_roundtrip():
    db = SessionLocal()
    try:
        author = Author(name="Model Author", slug="model-author", bio="bio text")
        db.add(author)
        db.commit()
        author_id = author.id

        fetched = db.query(Author).filter(Author.id == author_id).first()
        assert fetched is not None
        assert fetched.name == "Model Author"
        assert fetched.slug == "model-author"
        assert fetched.bio == "bio text"
        assert fetched.created_at is not None
        assert fetched.updated_at is not None
        assert "Model Author" in repr(fetched)
    finally:
        db.close()


def test_author_slug_unique_constraint():
    """Two rows with the same slug must collide at the DB layer."""
    db = SessionLocal()
    try:
        db.add(Author(name="A", slug="dup-slug"))
        db.commit()
        db.add(Author(name="B", slug="dup-slug"))
        with pytest.raises(Exception):  # IntegrityError or similar
            db.commit()
        db.rollback()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Slug helper
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name,expected",
    [
        ("Asterios Raptis", "asterios-raptis"),
        ("simple", "simple"),
        ("Multiple    Spaces", "multiple-spaces"),
        ("Already-Hyphenated", "already-hyphenated"),
        ("Mixed_Underscores_And-Hyphens", "mixed-underscores-and-hyphens"),
        ("UPPERCASE", "uppercase"),
        ("Trailing punctuation!!!", "trailing-punctuation"),
        ("  leading whitespace", "leading-whitespace"),
        # DE umlauts + ß: must transliterate, not be stripped.
        ("Müller", "mueller"),
        ("Hörst Schäfer", "hoerst-schaefer"),
        ("Straße", "strasse"),
        # General Latin diacritics: NFKD-fold to ASCII.
        ("Naïve", "naive"),
        ("Café", "cafe"),
        ("José Hernández", "jose-hernandez"),
        # Nordic letters: covered by the explicit table.
        ("Søren Ågård", "soren-agard"),
        ("Ægir Æsir", "aegir-aesir"),
        # Numbers preserved.
        ("Author 2 Returns", "author-2-returns"),
        # Empty / all-symbol fallback.
        ("🎉", "author"),
        ("???", "author"),
        ("   ", "author"),
    ],
)
def test_slugify(name: str, expected: str):
    assert _slugify(name) == expected


def test_unique_slug_no_collision_returns_base():
    db = SessionLocal()
    try:
        assert _unique_slug(SqlAlchemyAuthorRepository(db), "fresh-slug") == "fresh-slug"
    finally:
        db.close()


def test_unique_slug_single_collision_appends_2():
    db = SessionLocal()
    try:
        db.add(Author(name="X", slug="taken"))
        db.commit()
        assert _unique_slug(SqlAlchemyAuthorRepository(db), "taken") == "taken-2"
    finally:
        db.close()


def test_unique_slug_chained_collisions_increment_suffix():
    db = SessionLocal()
    try:
        for slug in ("popular", "popular-2", "popular-3"):
            db.add(Author(name=slug, slug=slug))
        db.commit()
        assert _unique_slug(SqlAlchemyAuthorRepository(db), "popular") == "popular-4"
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Pydantic schema validation
# ---------------------------------------------------------------------------


def test_author_create_requires_name():
    with pytest.raises(ValidationError):
        AuthorCreate.model_validate({"bio": "no name"})


def test_author_create_rejects_empty_name():
    with pytest.raises(ValidationError):
        AuthorCreate.model_validate({"name": ""})


def test_author_create_rejects_oversize_name():
    with pytest.raises(ValidationError):
        AuthorCreate.model_validate({"name": "X" * 301})


def test_author_create_accepts_max_length_name():
    payload = AuthorCreate.model_validate({"name": "X" * 300})
    assert payload.name == "X" * 300


def test_author_create_bio_optional():
    payload = AuthorCreate.model_validate({"name": "Solo"})
    assert payload.bio is None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def test_list_empty(client):
    resp = client.get("/api/authors")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_happy_path(client):
    resp = client.post(
        "/api/authors",
        json={"name": "Jane Author", "bio": "fiction writer"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Jane Author"
    assert body["slug"] == "jane-author"
    assert body["bio"] == "fiction writer"
    assert body["id"]
    assert body["created_at"]
    assert body["updated_at"]


def test_create_without_bio(client):
    resp = client.post("/api/authors", json={"name": "Solo Name"})
    assert resp.status_code == 201
    assert resp.json()["bio"] is None


def test_create_empty_name_returns_422(client):
    resp = client.post("/api/authors", json={"name": ""})
    assert resp.status_code == 422


def test_create_oversize_name_returns_422(client):
    resp = client.post("/api/authors", json={"name": "X" * 500})
    assert resp.status_code == 422


def test_create_duplicate_name_yields_suffixed_slug(client):
    first = client.post("/api/authors", json={"name": "Common Author"})
    second = client.post("/api/authors", json={"name": "Common Author"})
    third = client.post("/api/authors", json={"name": "Common Author"})
    assert first.json()["slug"] == "common-author"
    assert second.json()["slug"] == "common-author-2"
    assert third.json()["slug"] == "common-author-3"


def test_create_unicode_name_yields_transliterated_slug(client):
    resp = client.post("/api/authors", json={"name": "Hörst Müller"})
    assert resp.status_code == 201
    assert resp.json()["slug"] == "hoerst-mueller"


def test_create_emoji_only_name_falls_back_to_author_slug(client):
    """Slug fallback ``"author"`` + collision-suffixing must coexist."""
    first = client.post("/api/authors", json={"name": "🎉"})
    second = client.post("/api/authors", json={"name": "🚀"})
    assert first.json()["slug"] == "author"
    assert second.json()["slug"] == "author-2"


def test_get_by_id_happy_path(client):
    created = client.post("/api/authors", json={"name": "Findable"}).json()
    resp = client.get(f"/api/authors/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Findable"


def test_get_by_id_returns_404_on_missing(client):
    resp = client.get("/api/authors/does-not-exist")
    assert resp.status_code == 404
    assert "does-not-exist" in resp.json()["detail"]


def test_list_returns_authors_sorted_by_name(client):
    for name in ("Charlie", "Alpha", "Bravo"):
        client.post("/api/authors", json={"name": name})
    resp = client.get("/api/authors")
    assert resp.status_code == 200
    names = [row["name"] for row in resp.json()]
    assert names == ["Alpha", "Bravo", "Charlie"]


def test_list_search_filters_case_insensitively(client):
    for name in ("Alice Adams", "Bob Bridges", "Carol Connors"):
        client.post("/api/authors", json={"name": name})
    resp = client.get("/api/authors", params={"search": "BRIDGES"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Bob Bridges"


def test_list_search_substring_match(client):
    for name in ("Karlsen", "Tarja Turunen", "Bruce Dickinson"):
        client.post("/api/authors", json={"name": name})
    resp = client.get("/api/authors", params={"search": "ar"})
    assert resp.status_code == 200
    names = {row["name"] for row in resp.json()}
    # "ar" substring matches "Karlsen" and "Tarja Turunen" but not
    # "Bruce Dickinson" — confirms it's a substring filter, not a
    # word-boundary one.
    assert names == {"Karlsen", "Tarja Turunen"}


def test_list_search_whitespace_only_treated_as_omitted(client):
    for name in ("A", "B"):
        client.post("/api/authors", json={"name": name})
    resp = client.get("/api/authors", params={"search": "   "})
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_respects_limit(client):
    for i in range(5):
        client.post("/api/authors", json={"name": f"Name {i:02d}"})
    resp = client.get("/api/authors", params={"limit": 3})
    assert resp.status_code == 200
    assert len(resp.json()) == 3


def test_patch_updates_bio(client):
    created = client.post("/api/authors", json={"name": "Patch Me"}).json()
    resp = client.patch(f"/api/authors/{created['id']}", json={"bio": "new bio"})
    assert resp.status_code == 200
    assert resp.json()["bio"] == "new bio"


def test_patch_updates_name(client):
    created = client.post("/api/authors", json={"name": "Old Name"}).json()
    resp = client.patch(f"/api/authors/{created['id']}", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_patch_does_not_regenerate_slug_on_name_change(client):
    """Slug stays stable across name edits — protects any future
    ``/authors/{slug}`` URL routing.
    """
    created = client.post("/api/authors", json={"name": "Original Name"}).json()
    original_slug = created["slug"]
    resp = client.patch(
        f"/api/authors/{created['id']}",
        json={"name": "Completely Different"},
    )
    assert resp.status_code == 200
    assert resp.json()["slug"] == original_slug


def test_patch_partial_leaves_other_fields_alone(client):
    created = client.post(
        "/api/authors",
        json={"name": "Stable Name", "bio": "keep me"},
    ).json()
    resp = client.patch(f"/api/authors/{created['id']}", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Stable Name"
    assert body["bio"] == "keep me"


def test_patch_returns_404_on_missing(client):
    resp = client.patch("/api/authors/does-not-exist", json={"bio": "hi"})
    assert resp.status_code == 404


def test_delete_returns_204(client):
    created = client.post("/api/authors", json={"name": "Doomed"}).json()
    resp = client.delete(f"/api/authors/{created['id']}")
    assert resp.status_code == 204
    follow_up = client.get(f"/api/authors/{created['id']}")
    assert follow_up.status_code == 404


def test_delete_is_idempotent(client):
    """Deleting an absent author returns 204, not 404 — supports the
    frontend's delete-then-refetch cycle across multi-tab races.
    """
    resp = client.delete("/api/authors/never-existed")
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# is_profile_author (Profile -> DB mirror flag)
# ---------------------------------------------------------------------------


def test_create_defaults_is_profile_author_false(client):
    resp = client.post("/api/authors", json={"name": "Plain Catalog Entry"})
    assert resp.status_code == 201
    assert resp.json()["is_profile_author"] is False


def test_create_with_is_profile_author_true(client):
    resp = client.post(
        "/api/authors",
        json={"name": "My Pen Name", "is_profile_author": True},
    )
    assert resp.status_code == 201
    assert resp.json()["is_profile_author"] is True


def test_patch_promotes_to_profile_author(client):
    created = client.post("/api/authors", json={"name": "Later Promoted"}).json()
    assert created["is_profile_author"] is False
    resp = client.patch(
        f"/api/authors/{created['id']}",
        json={"is_profile_author": True},
    )
    assert resp.status_code == 200
    assert resp.json()["is_profile_author"] is True


def test_patch_without_flag_preserves_is_profile_author(client):
    created = client.post(
        "/api/authors",
        json={"name": "Stays Profile", "is_profile_author": True},
    ).json()
    resp = client.patch(f"/api/authors/{created['id']}", json={"bio": "edit"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["bio"] == "edit"
    assert body["is_profile_author"] is True
