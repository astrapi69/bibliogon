"""Tests for the book-templates feature (TM-01).

Covers:
  - Model round-trip for BookTemplate + BookTemplateChapter.
  - Pydantic schema validation (BookTemplateCreate).
  - API: list, create, update, delete endpoints.
  - Builtin enforcement: PUT/DELETE on builtin templates returns 403.
  - Seed idempotency: calling ``seed_builtin_templates`` twice does
    not duplicate rows.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.data.builtin_templates import BUILTIN_TEMPLATES, seed_builtin_templates
from app.database import SessionLocal
from app.main import app
from app.models import BookTemplate, BookTemplateChapter, ChapterType
from app.schemas import BookTemplateCreate


@pytest.fixture(scope="module")
def client():
    """TestClient with lifespan -> triggers builtin template seed."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reseed_builtins():
    """Re-seed builtins before each test.

    The conftest's autouse ``setup_db`` fixture calls ``drop_all`` +
    ``create_all`` around every test, which wipes the builtin rows
    seeded by the module-scoped lifespan. Re-seed here so every test
    sees the builtin templates.
    """
    db = SessionLocal()
    try:
        seed_builtin_templates(db)
    finally:
        db.close()
    yield


# --- Model tests ---


def test_book_template_persists_with_chapters():
    db = SessionLocal()
    try:
        template = BookTemplate(
            name="Model Test Template",
            description="Round-trip model test",
            genre="test",
            language="en",
            is_builtin=False,
        )
        template.chapters.append(
            BookTemplateChapter(
                position=0,
                title="First",
                chapter_type=ChapterType.CHAPTER.value,
                content="hello",
            )
        )
        template.chapters.append(
            BookTemplateChapter(
                position=1,
                title="Second",
                chapter_type=ChapterType.EPILOGUE.value,
            )
        )
        db.add(template)
        db.commit()
        template_id = template.id

        fetched = db.query(BookTemplate).filter(BookTemplate.id == template_id).first()
        assert fetched is not None
        assert fetched.name == "Model Test Template"
        assert len(fetched.chapters) == 2
        assert fetched.chapters[0].title == "First"
        assert fetched.chapters[0].content == "hello"
        assert fetched.chapters[1].chapter_type == "epilogue"
        assert fetched.chapters[1].content is None
    finally:
        # Cleanup
        db.query(BookTemplate).filter(
            BookTemplate.name == "Model Test Template"
        ).delete()
        db.commit()
        db.close()


def test_cascade_delete_removes_chapters():
    db = SessionLocal()
    try:
        template = BookTemplate(
            name="Cascade Test",
            description="desc",
            genre="test",
            language="en",
        )
        template.chapters.append(
            BookTemplateChapter(position=0, title="Ch", chapter_type="chapter")
        )
        db.add(template)
        db.commit()
        template_id = template.id
        chapter_ids = [c.id for c in template.chapters]

        db.delete(template)
        db.commit()

        assert db.query(BookTemplate).filter(BookTemplate.id == template_id).first() is None
        remaining = (
            db.query(BookTemplateChapter)
            .filter(BookTemplateChapter.id.in_(chapter_ids))
            .count()
        )
        assert remaining == 0
    finally:
        db.close()


# --- Schema tests ---


def test_schema_rejects_empty_chapter_list():
    with pytest.raises(ValidationError):
        BookTemplateCreate(
            name="X",
            description="d",
            genre="g",
            language="en",
            chapters=[],
        )


def test_schema_rejects_missing_name():
    with pytest.raises(ValidationError):
        BookTemplateCreate(
            description="d",
            genre="g",
            language="en",
            chapters=[{"position": 0, "title": "t", "chapter_type": "chapter"}],
        )


def test_schema_default_language_is_en():
    schema = BookTemplateCreate(
        name="X",
        description="d",
        genre="g",
        chapters=[{"position": 0, "title": "t", "chapter_type": "chapter"}],
    )
    assert schema.language == "en"


# --- API tests ---


def test_list_returns_builtin_templates(client: TestClient):
    r = client.get("/api/templates")
    assert r.status_code == 200
    items = r.json()
    builtin_names = {t["name"] for t in items if t["is_builtin"]}
    expected = {t["name"] for t in BUILTIN_TEMPLATES}
    assert expected.issubset(builtin_names)


def test_get_single_template_includes_chapters(client: TestClient):
    r = client.get("/api/templates")
    template_id = next(t["id"] for t in r.json() if t["is_builtin"])

    r = client.get(f"/api/templates/{template_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == template_id
    assert len(body["chapters"]) > 0
    positions = [c["position"] for c in body["chapters"]]
    assert positions == sorted(positions)


def test_get_unknown_template_returns_404(client: TestClient):
    r = client.get("/api/templates/does-not-exist")
    assert r.status_code == 404


def test_create_user_template(client: TestClient):
    r = client.post(
        "/api/templates",
        json={
            "name": "My Custom Template",
            "description": "From API test",
            "genre": "poetry",
            "language": "en",
            "is_builtin": True,  # Must be ignored - server forces False
            "chapters": [
                {"position": 0, "title": "Poem 1", "chapter_type": "chapter"},
                {"position": 1, "title": "Poem 2", "chapter_type": "chapter"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_builtin"] is False
    assert len(body["chapters"]) == 2
    # Cleanup
    client.delete(f"/api/templates/{body['id']}")


def test_create_duplicate_name_returns_409(client: TestClient):
    payload = {
        "name": "Dup Test",
        "description": "d",
        "genre": "g",
        "language": "en",
        "chapters": [{"position": 0, "title": "t", "chapter_type": "chapter"}],
    }
    r = client.post("/api/templates", json=payload)
    assert r.status_code == 201
    template_id = r.json()["id"]
    try:
        r2 = client.post("/api/templates", json=payload)
        assert r2.status_code == 409
    finally:
        client.delete(f"/api/templates/{template_id}")


def test_update_user_template(client: TestClient):
    r = client.post(
        "/api/templates",
        json={
            "name": "Update Target",
            "description": "old",
            "genre": "g",
            "language": "en",
            "chapters": [{"position": 0, "title": "t", "chapter_type": "chapter"}],
        },
    )
    template_id = r.json()["id"]
    try:
        r = client.put(
            f"/api/templates/{template_id}",
            json={"description": "new", "genre": "updated"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["description"] == "new"
        assert body["genre"] == "updated"
    finally:
        client.delete(f"/api/templates/{template_id}")


def test_delete_builtin_returns_403(client: TestClient):
    r = client.get("/api/templates")
    builtin_id = next(t["id"] for t in r.json() if t["is_builtin"])

    r = client.delete(f"/api/templates/{builtin_id}")
    assert r.status_code == 403


def test_update_builtin_returns_403(client: TestClient):
    r = client.get("/api/templates")
    builtin_id = next(t["id"] for t in r.json() if t["is_builtin"])

    r = client.put(
        f"/api/templates/{builtin_id}",
        json={"description": "hacked"},
    )
    assert r.status_code == 403


def test_delete_user_template_succeeds(client: TestClient):
    r = client.post(
        "/api/templates",
        json={
            "name": "Delete Me",
            "description": "d",
            "genre": "g",
            "language": "en",
            "chapters": [{"position": 0, "title": "t", "chapter_type": "chapter"}],
        },
    )
    template_id = r.json()["id"]

    r = client.delete(f"/api/templates/{template_id}")
    assert r.status_code == 204

    r = client.get(f"/api/templates/{template_id}")
    assert r.status_code == 404


# --- Seed idempotency ---


def test_seed_is_idempotent():
    db = SessionLocal()
    try:
        before = db.query(BookTemplate).filter(BookTemplate.is_builtin.is_(True)).count()
        # First call: should insert only if table is currently empty of builtins.
        inserted_first = seed_builtin_templates(db)
        after_first = db.query(BookTemplate).filter(
            BookTemplate.is_builtin.is_(True)
        ).count()

        # Second call: always a no-op because builtins exist.
        inserted_second = seed_builtin_templates(db)
        after_second = db.query(BookTemplate).filter(
            BookTemplate.is_builtin.is_(True)
        ).count()

        assert inserted_second == 0
        assert after_first == after_second
        # The first call inserts the expected count only when starting empty.
        if before == 0:
            assert inserted_first == len(BUILTIN_TEMPLATES)
            assert after_first == len(BUILTIN_TEMPLATES)
        else:
            assert inserted_first == 0
            assert after_first == before
    finally:
        db.close()
