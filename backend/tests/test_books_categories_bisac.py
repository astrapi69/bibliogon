"""Tests for Book.categories + Book.bisac_codes (Bug 9).

Covers:

- Pydantic ``BookUpdate`` coercion: list/str/comma-string inputs,
  trim, case-insensitive dedup.
- BISAC format validator: valid codes pass, lowercase auto-
  uppercases, invalid format raises ValidationError, duplicate
  codes collapse.
- Round-trip via the PATCH endpoint: server serialises the list
  into a JSON-encoded Text column, GET deserialises back to
  list[str].
- BookOut decode of pre-existing JSON-encoded Text values.
- 422 propagation on invalid BISAC via the API surface.
- ``Book.keywords`` round-trip unaffected (regression-pin that
  the new validators don't break the existing path).
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.database import SessionLocal
from app.main import app
from app.models import Book
from app.schemas import BookOut, BookUpdate

client = TestClient(app)


def _make_book() -> str:
    resp = client.post(
        "/api/books",
        json={"title": "Bug 9 Test Book", "author": "Aster"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Pydantic-level: BookUpdate.categories coercion
# ---------------------------------------------------------------------------


def test_book_update_categories_list_input() -> None:
    p = BookUpdate(categories=["Fiction", "Fantasy"])
    assert p.categories == ["Fiction", "Fantasy"]


def test_book_update_categories_dedup_case_insensitive() -> None:
    p = BookUpdate(categories=["Fiction", "fiction", "FICTION", "Fantasy"])
    assert p.categories == ["Fiction", "Fantasy"]


def test_book_update_categories_trim() -> None:
    p = BookUpdate(categories=["  Fiction  ", "Fantasy\t"])
    assert p.categories == ["Fiction", "Fantasy"]


def test_book_update_categories_empty_entries_dropped() -> None:
    p = BookUpdate(categories=["Fiction", "", "  ", "Fantasy"])
    assert p.categories == ["Fiction", "Fantasy"]


def test_book_update_categories_comma_string_input() -> None:
    p = BookUpdate(categories="Fiction, Fantasy, Mystery")
    assert p.categories == ["Fiction", "Fantasy", "Mystery"]


def test_book_update_categories_json_string_input() -> None:
    p = BookUpdate(categories='["Fiction", "Fantasy"]')
    assert p.categories == ["Fiction", "Fantasy"]


def test_book_update_categories_none_preserved() -> None:
    p = BookUpdate(categories=None)
    assert p.categories is None


# ---------------------------------------------------------------------------
# Pydantic-level: BookUpdate.bisac_codes coercion + format validation
# ---------------------------------------------------------------------------


def test_book_update_bisac_valid_codes() -> None:
    p = BookUpdate(bisac_codes=["FIC022020", "BIO000000"])
    assert p.bisac_codes == ["FIC022020", "BIO000000"]


def test_book_update_bisac_lowercase_auto_uppercased() -> None:
    p = BookUpdate(bisac_codes=["fic022020", "Bio000000"])
    assert p.bisac_codes == ["FIC022020", "BIO000000"]


def test_book_update_bisac_dedup() -> None:
    p = BookUpdate(bisac_codes=["FIC022020", "fic022020", "FIC022020"])
    assert p.bisac_codes == ["FIC022020"]


def test_book_update_bisac_rejects_wrong_segment_lengths() -> None:
    for bad in ["FIC02202", "FIC0220200", "FI022020", "FICX22020"]:
        with pytest.raises(ValidationError) as exc:
            BookUpdate(bisac_codes=[bad])
        assert "BISAC" in str(exc.value) or "Invalid" in str(exc.value)


def test_book_update_bisac_rejects_lowercase_after_uppercasing_still_invalid() -> None:
    """A lowercase ``f1c022020`` gets uppercased to ``F1C022020`` —
    which is still invalid because position 2 is a digit, not a
    letter. Pins that the uppercasing isn't a silent pass-through.
    """
    with pytest.raises(ValidationError):
        BookUpdate(bisac_codes=["f1c022020"])


def test_book_update_bisac_rejects_special_chars() -> None:
    with pytest.raises(ValidationError):
        BookUpdate(bisac_codes=["FIC-22020"])


def test_book_update_bisac_empty_entries_dropped() -> None:
    p = BookUpdate(bisac_codes=["FIC022020", "", "  ", "BIO000000"])
    assert p.bisac_codes == ["FIC022020", "BIO000000"]


def test_book_update_bisac_none_preserved() -> None:
    p = BookUpdate(bisac_codes=None)
    assert p.bisac_codes is None


def test_book_update_bisac_comma_string_input() -> None:
    p = BookUpdate(bisac_codes="FIC022020, BIO000000")
    assert p.bisac_codes == ["FIC022020", "BIO000000"]


def test_book_update_bisac_error_detail_includes_offending_code() -> None:
    with pytest.raises(ValidationError) as exc:
        BookUpdate(bisac_codes=["FIC022020", "BAD", "BIO000000"])
    # The error mentions the offending code so the user can fix it.
    assert "BAD" in str(exc.value)


# ---------------------------------------------------------------------------
# BookOut decode (JSON-text from DB → list[str])
# ---------------------------------------------------------------------------


def test_book_out_decodes_json_text_categories() -> None:
    db = SessionLocal()
    try:
        book = Book(
            title="JSON Decode Test",
            categories=json.dumps(["Fiction", "Fantasy"]),
            bisac_codes=json.dumps(["FIC022020"]),
        )
        db.add(book)
        db.commit()
        out = BookOut.model_validate(book)
        assert out.categories == ["Fiction", "Fantasy"]
        assert out.bisac_codes == ["FIC022020"]
    finally:
        db.close()


def test_book_out_handles_null_categories_and_bisac() -> None:
    """Pre-existing rows have NULL on both columns (migration default).
    The decoder must return ``[]``, not raise.
    """
    db = SessionLocal()
    try:
        book = Book(title="Null Test")
        db.add(book)
        db.commit()
        out = BookOut.model_validate(book)
        assert out.categories == []
        assert out.bisac_codes == []
    finally:
        db.close()


# ---------------------------------------------------------------------------
# API round-trip
# ---------------------------------------------------------------------------


def test_patch_categories_round_trip() -> None:
    book_id = _make_book()
    resp = client.patch(
        f"/api/books/{book_id}",
        json={"categories": ["Fiction", "Fantasy", "Coming of Age"]},
    )
    assert resp.status_code == 200
    assert resp.json()["categories"] == ["Fiction", "Fantasy", "Coming of Age"]
    # Confirm GET surfaces them too.
    resp = client.get(f"/api/books/{book_id}")
    assert resp.status_code == 200
    assert resp.json()["categories"] == [
        "Fiction",
        "Fantasy",
        "Coming of Age",
    ]


def test_patch_bisac_codes_round_trip() -> None:
    book_id = _make_book()
    resp = client.patch(
        f"/api/books/{book_id}",
        json={"bisac_codes": ["FIC022020", "BIO000000"]},
    )
    assert resp.status_code == 200
    assert resp.json()["bisac_codes"] == ["FIC022020", "BIO000000"]


def test_patch_bisac_lowercase_normalised_in_db() -> None:
    book_id = _make_book()
    resp = client.patch(
        f"/api/books/{book_id}",
        json={"bisac_codes": ["fic022020"]},
    )
    assert resp.status_code == 200
    assert resp.json()["bisac_codes"] == ["FIC022020"]


def test_patch_invalid_bisac_returns_422() -> None:
    book_id = _make_book()
    resp = client.patch(
        f"/api/books/{book_id}",
        json={"bisac_codes": ["BAD-FORMAT"]},
    )
    assert resp.status_code == 422
    body = resp.json()
    # Pydantic puts the validator message into the error detail.
    flat = json.dumps(body)
    assert "BAD-FORMAT" in flat or "BAD-FORMAT".upper() in flat


def test_patch_categories_dedups_at_api_layer() -> None:
    book_id = _make_book()
    resp = client.patch(
        f"/api/books/{book_id}",
        json={"categories": ["Fiction", "fiction", "Fantasy"]},
    )
    assert resp.status_code == 200
    assert resp.json()["categories"] == ["Fiction", "Fantasy"]


def test_patch_categories_independent_of_bisac() -> None:
    """Setting one field doesn't disturb the other."""
    book_id = _make_book()
    client.patch(f"/api/books/{book_id}", json={"categories": ["Fiction"]})
    client.patch(f"/api/books/{book_id}", json={"bisac_codes": ["FIC022020"]})
    resp = client.get(f"/api/books/{book_id}")
    assert resp.json()["categories"] == ["Fiction"]
    assert resp.json()["bisac_codes"] == ["FIC022020"]


def test_patch_unrelated_field_preserves_categories_and_bisac() -> None:
    """Bug-9 regression-pin: a PATCH that only touches ``subtitle``
    must NOT clear categories or bisac_codes already set."""
    book_id = _make_book()
    client.patch(
        f"/api/books/{book_id}",
        json={
            "categories": ["Fiction"],
            "bisac_codes": ["FIC022020"],
        },
    )
    client.patch(f"/api/books/{book_id}", json={"subtitle": "A subtitle"})
    resp = client.get(f"/api/books/{book_id}")
    assert resp.json()["categories"] == ["Fiction"]
    assert resp.json()["bisac_codes"] == ["FIC022020"]
    assert resp.json()["subtitle"] == "A subtitle"


def test_patch_empty_list_clears_field() -> None:
    book_id = _make_book()
    client.patch(
        f"/api/books/{book_id}",
        json={"categories": ["Fiction"], "bisac_codes": ["FIC022020"]},
    )
    resp = client.patch(
        f"/api/books/{book_id}",
        json={"categories": [], "bisac_codes": []},
    )
    assert resp.status_code == 200
    assert resp.json()["categories"] == []
    assert resp.json()["bisac_codes"] == []


# ---------------------------------------------------------------------------
# Regression pin: existing ``keywords`` round-trip still works
# ---------------------------------------------------------------------------


def test_keywords_round_trip_still_works() -> None:
    """Bug-9 regression-pin: the existing ``keywords`` validator
    behaviour is untouched. Pin a basic round-trip so the new
    ``categories`` / ``bisac_codes`` validators don't accidentally
    shadow the legacy ``keywords`` coercion.
    """
    book_id = _make_book()
    resp = client.patch(
        f"/api/books/{book_id}",
        json={"keywords": ["fantasy", "FANTASY", "coming-of-age"]},
    )
    assert resp.status_code == 200
    # Same case-insensitive dedup as Categories.
    assert resp.json()["keywords"] == ["fantasy", "coming-of-age"]
