"""Tests for the chapter-templates feature (TM-04).

Mirrors the structure of ``test_templates.py``:
  - Model round-trip
  - Pydantic schema validation
  - API: list, get, create, update, delete, 403 on builtin,
    409 on duplicate name
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.data.builtin_chapter_templates import (
    BUILTIN_CHAPTER_TEMPLATES,
    seed_builtin_chapter_templates,
)
from app.database import SessionLocal
from app.main import app
from app.models import ChapterTemplate
from app.schemas import ChapterTemplateCreate


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# --- Model tests ---


def test_chapter_template_roundtrip():
    db = SessionLocal()
    try:
        template = ChapterTemplate(
            name="Model Chapter Template",
            description="Model round-trip test",
            chapter_type="chapter",
            content='{"type":"doc"}',
            language="en",
            is_builtin=False,
        )
        db.add(template)
        db.commit()
        template_id = template.id

        fetched = (
            db.query(ChapterTemplate)
            .filter(ChapterTemplate.id == template_id)
            .first()
        )
        assert fetched is not None
        assert fetched.name == "Model Chapter Template"
        assert fetched.chapter_type == "chapter"
        assert fetched.content == '{"type":"doc"}'
        assert fetched.is_builtin is False
    finally:
        db.query(ChapterTemplate).filter(
            ChapterTemplate.name == "Model Chapter Template"
        ).delete()
        db.commit()
        db.close()


# --- Schema tests ---


def test_chapter_template_schema_rejects_missing_name():
    with pytest.raises(ValidationError):
        ChapterTemplateCreate(description="d", chapter_type="chapter")


def test_chapter_template_schema_default_language_is_en():
    schema = ChapterTemplateCreate(
        name="X", description="d", chapter_type="chapter"
    )
    assert schema.language == "en"
    assert schema.is_builtin is False
    assert schema.content is None


# --- API tests ---


def test_list_chapter_templates(client: TestClient):
    r = client.get("/api/chapter-templates")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_user_chapter_template(client: TestClient):
    r = client.post(
        "/api/chapter-templates",
        json={
            "name": "API Interview",
            "description": "Interview via API",
            "chapter_type": "chapter",
            "content": '{"type":"doc"}',
            "language": "en",
            "is_builtin": True,  # must be ignored, server forces False
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_builtin"] is False
    assert body["content"] == '{"type":"doc"}'
    client.delete(f"/api/chapter-templates/{body['id']}")


def test_get_unknown_chapter_template_returns_404(client: TestClient):
    r = client.get("/api/chapter-templates/does-not-exist")
    assert r.status_code == 404


def test_duplicate_name_returns_409(client: TestClient):
    payload = {
        "name": "Dup Chapter",
        "description": "x",
        "chapter_type": "chapter",
    }
    r = client.post("/api/chapter-templates", json=payload)
    assert r.status_code == 201
    template_id = r.json()["id"]
    try:
        r2 = client.post("/api/chapter-templates", json=payload)
        assert r2.status_code == 409
    finally:
        client.delete(f"/api/chapter-templates/{template_id}")


def test_update_user_chapter_template(client: TestClient):
    r = client.post(
        "/api/chapter-templates",
        json={
            "name": "Update Target Chapter",
            "description": "old",
            "chapter_type": "chapter",
        },
    )
    template_id = r.json()["id"]
    try:
        r = client.put(
            f"/api/chapter-templates/{template_id}",
            json={"description": "new", "content": '{"new":true}'},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["description"] == "new"
        assert body["content"] == '{"new":true}'
    finally:
        client.delete(f"/api/chapter-templates/{template_id}")


def test_delete_user_chapter_template(client: TestClient):
    r = client.post(
        "/api/chapter-templates",
        json={"name": "Delete Me Chapter", "description": "x", "chapter_type": "chapter"},
    )
    template_id = r.json()["id"]
    r = client.delete(f"/api/chapter-templates/{template_id}")
    assert r.status_code == 204
    r = client.get(f"/api/chapter-templates/{template_id}")
    assert r.status_code == 404


# --- Builtin seed tests ---


@pytest.fixture(autouse=True)
def _reseed_builtin_chapter_templates():
    """Re-seed builtins before each API-facing test.

    conftest.py's ``setup_db`` fixture drops and recreates all tables
    around every test, which wipes the rows the module-scoped
    lifespan inserted. Re-seed so list-style tests observe the
    expected builtin count.
    """
    db = SessionLocal()
    try:
        seed_builtin_chapter_templates(db)
    finally:
        db.close()
    yield


def test_seed_inserts_expected_builtins():
    db = SessionLocal()
    try:
        names = {
            t.name
            for t in db.query(ChapterTemplate)
            .filter(ChapterTemplate.is_builtin.is_(True))
            .all()
        }
        expected = {spec["name"] for spec in BUILTIN_CHAPTER_TEMPLATES}
        assert expected.issubset(names)
    finally:
        db.close()


def test_seed_is_idempotent():
    db = SessionLocal()
    try:
        before = (
            db.query(ChapterTemplate)
            .filter(ChapterTemplate.is_builtin.is_(True))
            .count()
        )
        inserted = seed_builtin_chapter_templates(db)
        after = (
            db.query(ChapterTemplate)
            .filter(ChapterTemplate.is_builtin.is_(True))
            .count()
        )
        assert inserted == 0
        assert before == after
    finally:
        db.close()


def test_builtin_content_is_valid_tiptap_json():
    import json
    for spec in BUILTIN_CHAPTER_TEMPLATES:
        doc = json.loads(spec["content"])
        assert doc["type"] == "doc"
        assert isinstance(doc["content"], list)
        assert len(doc["content"]) > 0


def test_delete_and_update_builtin_returns_403(client: TestClient):
    # Manually insert a builtin directly via the DB
    db = SessionLocal()
    try:
        template = ChapterTemplate(
            name="Builtin 403 Test",
            description="builtin",
            chapter_type="chapter",
            is_builtin=True,
        )
        db.add(template)
        db.commit()
        template_id = template.id
    finally:
        db.close()

    try:
        r = client.delete(f"/api/chapter-templates/{template_id}")
        assert r.status_code == 403
        r = client.put(
            f"/api/chapter-templates/{template_id}",
            json={"description": "hacked"},
        )
        assert r.status_code == 403
    finally:
        db = SessionLocal()
        try:
            db.query(ChapterTemplate).filter(
                ChapterTemplate.id == template_id
            ).delete()
            db.commit()
        finally:
            db.close()
