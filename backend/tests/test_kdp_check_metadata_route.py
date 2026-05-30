"""Regression tests for ``POST /api/kdp/check-metadata``.

The KDP Publishing Wizard's ``MetadataChecklist`` posts the book's
``keywords`` as a JSON array (``BookDetail.keywords`` is ``string[]``;
``Book.keywords`` stores a serialized list). The request schema
``CheckMetadataRequest.keywords`` was typed ``str | None``, so the
array payload failed Pydantic validation with 422 — surfacing in the
wizard as "Metadaten-Pruefung fehlgeschlagen. Request failed".

These pins exercise the route through the mounted plugin router (the
per-plugin isolated venv has no sqlalchemy, so the schema can only be
exercised end-to-end from the backend test suite).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_check_metadata_accepts_empty_keywords_list(client):
    # The exact payload the wizard sends for a book with no keywords —
    # an empty array. This is what 422'd before the fix.
    resp = client.post(
        "/api/kdp/check-metadata",
        json={"title": "T", "author": "A", "keywords": []},
    )
    assert resp.status_code == 200, resp.text


def test_check_metadata_accepts_populated_keywords_list(client):
    resp = client.post(
        "/api/kdp/check-metadata",
        json={
            "title": "T",
            "author": "A",
            "language": "de",
            "description": "d",
            "keywords": ["one", "two", "three"],
            "categories": [],
            "bisac_codes": [],
            "chapters": [{"id": "1", "title": "C1"}],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # A populated keyword list satisfies the keyword warning.
    assert not any(
        issue["field"] == "keywords" and "No keywords" in issue["message"]
        for issue in body["issues"]
    )


def test_check_metadata_still_accepts_legacy_keywords_string(client):
    # Back-compat: a string payload (older callers) must still validate.
    resp = client.post(
        "/api/kdp/check-metadata",
        json={"title": "T", "author": "A", "keywords": "one, two"},
    )
    assert resp.status_code == 200, resp.text
