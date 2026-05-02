"""Tests for the chapter-templates feature (TM-04).

Mirrors the structure of ``test_templates.py``:
  - Model round-trip
  - Pydantic schema validation
  - API: list, get, create, update, delete, 403 on builtin,
    409 on duplicate name
"""
from __future__ import annotations

import json

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


# --- TM-04b sub-item 2: JSON export / import -------------------------------


def test_export_chapter_template_returns_portable_json(client: TestClient):
    r = client.post(
        "/api/chapter-templates",
        json={
            "name": "Export Source",
            "description": "exportable",
            "chapter_type": "chapter",
            "content": '{"type":"doc"}',
            "language": "de",
        },
    )
    template_id = r.json()["id"]
    try:
        r = client.get(f"/api/chapter-templates/{template_id}/export")
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert "export-source.chapter-template.json" in cd
        body = r.json()
        assert body["format"] == "bibliogon-chapter-template"
        assert body["format_version"] == "1.0"
        assert body["name"] == "Export Source"
        assert body["chapter_type"] == "chapter"
        assert body["content"] == '{"type":"doc"}'
        assert body["language"] == "de"
        # is_builtin must NOT travel with the file - re-import always
        # lands as a user template.
        assert "is_builtin" not in body
    finally:
        client.delete(f"/api/chapter-templates/{template_id}")


def test_export_unknown_chapter_template_returns_404(client: TestClient):
    r = client.get("/api/chapter-templates/does-not-exist/export")
    assert r.status_code == 404


def test_import_roundtrip_creates_user_template(client: TestClient):
    payload = {
        "format": "bibliogon-chapter-template",
        "format_version": "1.0",
        "name": "Imported Template",
        "description": "imported",
        "chapter_type": "chapter",
        "content": '{"type":"doc","content":[]}',
        "language": "en",
    }
    r = client.post(
        "/api/chapter-templates/import",
        files={"file": ("tpl.json", json.dumps(payload).encode("utf-8"), "application/json")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    template_id = body["id"]
    try:
        assert body["name"] == "Imported Template"
        assert body["content"] == payload["content"]
        # Always lands as user template even if the JSON tried to claim
        # is_builtin (the importer ignores that key entirely).
        assert body["is_builtin"] is False
    finally:
        client.delete(f"/api/chapter-templates/{template_id}")


def test_import_rejects_non_json_file(client: TestClient):
    r = client.post(
        "/api/chapter-templates/import",
        files={"file": ("tpl.txt", b"plain text", "text/plain")},
    )
    assert r.status_code == 400
    assert "JSON" in r.json()["detail"]


def test_import_rejects_wrong_format_marker(client: TestClient):
    r = client.post(
        "/api/chapter-templates/import",
        files={
            "file": (
                "tpl.json",
                json.dumps({"format": "wrong", "name": "X"}).encode("utf-8"),
                "application/json",
            )
        },
    )
    assert r.status_code == 400
    assert "Bibliogon chapter template" in r.json()["detail"]


def test_import_rejects_missing_required_fields(client: TestClient):
    r = client.post(
        "/api/chapter-templates/import",
        files={
            "file": (
                "tpl.json",
                json.dumps(
                    {
                        "format": "bibliogon-chapter-template",
                        "name": "Only name",
                    }
                ).encode("utf-8"),
                "application/json",
            )
        },
    )
    assert r.status_code == 400
    assert "Required fields missing" in r.json()["detail"]


def test_import_rejects_unknown_chapter_type(client: TestClient):
    r = client.post(
        "/api/chapter-templates/import",
        files={
            "file": (
                "tpl.json",
                json.dumps(
                    {
                        "format": "bibliogon-chapter-template",
                        "name": "Bad Type",
                        "description": "x",
                        "chapter_type": "not-a-real-type",
                    }
                ).encode("utf-8"),
                "application/json",
            )
        },
    )
    assert r.status_code == 400
    assert "chapter_type" in r.json()["detail"].lower()


# --- TM-04b sub-item 3: multi-chapter templates ----------------------------


def test_create_group_template_persists_child_ids(client: TestClient):
    # Seed two children first
    a = client.post("/api/chapter-templates", json={"name": "Child A", "description": "a", "chapter_type": "chapter"}).json()
    b = client.post("/api/chapter-templates", json={"name": "Child B", "description": "b", "chapter_type": "chapter"}).json()
    try:
        r = client.post(
            "/api/chapter-templates",
            json={
                "name": "Group AB",
                "description": "group",
                "chapter_type": "chapter",
                "child_template_ids": [a["id"], b["id"]],
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["child_template_ids"] == [a["id"], b["id"]]
        client.delete(f"/api/chapter-templates/{body['id']}")
    finally:
        client.delete(f"/api/chapter-templates/{a['id']}")
        client.delete(f"/api/chapter-templates/{b['id']}")


def test_create_group_rejects_unknown_child(client: TestClient):
    r = client.post(
        "/api/chapter-templates",
        json={
            "name": "Group with Ghost",
            "description": "group",
            "chapter_type": "chapter",
            "child_template_ids": ["does-not-exist"],
        },
    )
    assert r.status_code == 400
    assert "Unknown child template id" in r.json()["detail"]


def test_update_group_rejects_self_reference(client: TestClient):
    r = client.post(
        "/api/chapter-templates",
        json={"name": "Self Ref Test", "description": "x", "chapter_type": "chapter"},
    )
    template_id = r.json()["id"]
    try:
        r = client.put(
            f"/api/chapter-templates/{template_id}",
            json={"child_template_ids": [template_id]},
        )
        assert r.status_code == 400
        assert "itself" in r.json()["detail"]
    finally:
        client.delete(f"/api/chapter-templates/{template_id}")


def test_update_group_rejects_cycle(client: TestClient):
    a = client.post("/api/chapter-templates", json={"name": "Cycle A", "description": "a", "chapter_type": "chapter"}).json()
    b = client.post("/api/chapter-templates", json={"name": "Cycle B", "description": "b", "chapter_type": "chapter"}).json()
    try:
        # B -> [A] is fine
        r = client.put(f"/api/chapter-templates/{b['id']}", json={"child_template_ids": [a["id"]]})
        assert r.status_code == 200
        # A -> [B] would close the loop -> rejected
        r = client.put(f"/api/chapter-templates/{a['id']}", json={"child_template_ids": [b["id"]]})
        assert r.status_code == 400
        assert "Cycle" in r.json()["detail"]
    finally:
        client.delete(f"/api/chapter-templates/{a['id']}")
        client.delete(f"/api/chapter-templates/{b['id']}")


def test_export_group_includes_child_ids(client: TestClient):
    a = client.post("/api/chapter-templates", json={"name": "Exp A", "description": "a", "chapter_type": "chapter"}).json()
    g = client.post(
        "/api/chapter-templates",
        json={
            "name": "Exp Group",
            "description": "group",
            "chapter_type": "chapter",
            "child_template_ids": [a["id"]],
        },
    ).json()
    try:
        r = client.get(f"/api/chapter-templates/{g['id']}/export")
        assert r.status_code == 200
        body = r.json()
        assert body["child_template_ids"] == [a["id"]]
    finally:
        client.delete(f"/api/chapter-templates/{g['id']}")
        client.delete(f"/api/chapter-templates/{a['id']}")


def test_import_group_from_json(client: TestClient):
    a = client.post("/api/chapter-templates", json={"name": "Imp A", "description": "a", "chapter_type": "chapter"}).json()
    try:
        payload = {
            "format": "bibliogon-chapter-template",
            "format_version": "1.0",
            "name": "Imported Group",
            "description": "group",
            "chapter_type": "chapter",
            "content": None,
            "language": "en",
            "child_template_ids": [a["id"]],
        }
        r = client.post(
            "/api/chapter-templates/import",
            files={"file": ("group.json", json.dumps(payload).encode("utf-8"), "application/json")},
        )
        assert r.status_code == 201, r.text
        body = r.json()
        try:
            assert body["child_template_ids"] == [a["id"]]
        finally:
            client.delete(f"/api/chapter-templates/{body['id']}")
    finally:
        client.delete(f"/api/chapter-templates/{a['id']}")


def test_legacy_single_chapter_template_has_null_child_ids(client: TestClient):
    """No regression: existing templates without ``child_template_ids`` in
    the create payload still surface as ``None`` in the read shape."""
    r = client.post(
        "/api/chapter-templates",
        json={"name": "Legacy Single", "description": "x", "chapter_type": "chapter"},
    )
    template_id = r.json()["id"]
    try:
        body = r.json()
        assert body["child_template_ids"] is None
    finally:
        client.delete(f"/api/chapter-templates/{template_id}")


def test_import_duplicate_name_returns_409(client: TestClient):
    # Seed an existing template under the target name first.
    r = client.post(
        "/api/chapter-templates",
        json={
            "name": "Dup Import",
            "description": "x",
            "chapter_type": "chapter",
        },
    )
    template_id = r.json()["id"]
    try:
        r = client.post(
            "/api/chapter-templates/import",
            files={
                "file": (
                    "tpl.json",
                    json.dumps(
                        {
                            "format": "bibliogon-chapter-template",
                            "name": "Dup Import",
                            "description": "x",
                            "chapter_type": "chapter",
                        }
                    ).encode("utf-8"),
                    "application/json",
                )
            },
        )
        assert r.status_code == 409
    finally:
        client.delete(f"/api/chapter-templates/{template_id}")
