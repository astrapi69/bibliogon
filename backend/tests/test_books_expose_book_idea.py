"""Tests for Book.expose + Book.book_idea (EXPOSE-BUCHIDEE-METADATA-01).

Covers:
- BookCreate accepts both fields at create time
- BookUpdate accepts partial updates (one or both)
- BookOut serialises both fields including None default
- Round-trip via PATCH endpoint: server stores in Text columns,
  GET reads back identically (preserves multi-paragraph + UTF-8)
- Existing fields (description, backpage_description) unaffected
  (regression-pin that the new columns don't shadow neighbours)
- Pre-existing rows (book created before the migration applied)
  return null for both fields on GET (NULL-default safety)
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import BookCreate, BookOut, BookUpdate

client = TestClient(app)


def _make_book(payload: dict[str, object] | None = None) -> str:
    base: dict[str, object] = {"title": "Expose Test Book", "author": "Aster"}
    if payload:
        base.update(payload)
    resp = client.post("/api/books", json=base)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Pydantic-level: schema accepts both fields
# ---------------------------------------------------------------------------


def test_book_create_accepts_book_idea_and_expose() -> None:
    p = BookCreate(
        title="T", book_idea="A premise.", expose="Long plot doc.\n\nMore paragraphs."
    )
    assert p.book_idea == "A premise."
    assert p.expose == "Long plot doc.\n\nMore paragraphs."


def test_book_create_book_idea_optional() -> None:
    p = BookCreate(title="T")
    assert p.book_idea is None
    assert p.expose is None


def test_book_update_partial_book_idea_only() -> None:
    p = BookUpdate(book_idea="Just the idea.")
    assert p.book_idea == "Just the idea."
    assert p.expose is None


def test_book_update_partial_expose_only() -> None:
    p = BookUpdate(expose="Just the expose.")
    assert p.book_idea is None
    assert p.expose == "Just the expose."


def test_book_out_serialises_both_fields_as_null_by_default() -> None:
    # BookOut from a dict without the new fields should report None
    # for both (preserves backward-compat with pre-migration rows).
    payload = {
        "id": "id1",
        "title": "T",
        "subtitle": None,
        "author": None,
        "language": "de",
        "series": None,
        "series_index": None,
        "description": None,
        "created_at": "2026-05-23T00:00:00",
        "updated_at": "2026-05-23T00:00:00",
    }
    out = BookOut.model_validate(payload)
    assert out.book_idea is None
    assert out.expose is None


# ---------------------------------------------------------------------------
# Endpoint round-trip
# ---------------------------------------------------------------------------


def test_create_with_expose_and_idea_round_trip() -> None:
    book_id = _make_book(
        {
            "title": "Roundtrip Book",
            "author": "Aster",
            "book_idea": "Boy meets dragon.",
            "expose": (
                "PLOT: A boy finds a dragon egg.\n\n"
                "CHARACTERS: Liam (boy), Sköll (dragon).\n\n"
                "SETTING: Medieval Norway, autumn."
            ),
        }
    )
    resp = client.get(f"/api/books/{book_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["book_idea"] == "Boy meets dragon."
    assert "PLOT: A boy finds a dragon egg." in body["expose"]
    assert "Sköll" in body["expose"]  # UTF-8 umlaut preserved


def test_patch_book_idea_alone_preserves_expose() -> None:
    book_id = _make_book(
        {"book_idea": "Idea v1.", "expose": "Expose v1."}
    )
    resp = client.patch(
        f"/api/books/{book_id}", json={"book_idea": "Idea v2."}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["book_idea"] == "Idea v2."
    assert body["expose"] == "Expose v1."  # untouched


def test_patch_expose_alone_preserves_book_idea() -> None:
    book_id = _make_book(
        {"book_idea": "Idea v1.", "expose": "Expose v1."}
    )
    resp = client.patch(
        f"/api/books/{book_id}", json={"expose": "Expose v2."}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["book_idea"] == "Idea v1."
    assert body["expose"] == "Expose v2."


def test_patch_to_null_clears_field() -> None:
    book_id = _make_book(
        {"book_idea": "Idea.", "expose": "Expose."}
    )
    resp = client.patch(
        f"/api/books/{book_id}", json={"book_idea": None, "expose": None}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["book_idea"] is None
    assert body["expose"] is None


def test_description_unaffected_by_expose_update() -> None:
    """Regression-pin: ``description``, ``backpage_description``, and
    ``book_idea``/``expose`` are distinct fields. Updating one must
    not shadow neighbours."""
    book_id = _make_book(
        {
            "title": "Distinct Fields Test",
            "description": "Short blurb for store.",
        }
    )
    resp = client.patch(
        f"/api/books/{book_id}",
        json={
            "book_idea": "New idea.",
            "expose": "New expose.",
            "backpage_description": "Back cover copy.",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["description"] == "Short blurb for store."  # untouched
    assert body["book_idea"] == "New idea."
    assert body["expose"] == "New expose."
    assert body["backpage_description"] == "Back cover copy."


def test_pre_existing_book_without_expose_returns_null() -> None:
    """A book created without specifying the new fields gets both as
    NULL (Text nullable=True default). The migration's nullable=True
    + no server_default mirrors this behaviour for rows present
    before the migration ran."""
    book_id = _make_book({"title": "Pre-Migration Style"})
    resp = client.get(f"/api/books/{book_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["book_idea"] is None
    assert body["expose"] is None
