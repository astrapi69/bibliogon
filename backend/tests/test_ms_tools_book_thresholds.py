"""Tests for M-16: per-book ms-tools threshold overrides."""

from fastapi.testclient import TestClient

from app.main import app


def _create_book(client: TestClient) -> str:
    r = client.post("/api/books", json={"title": "T", "author": "A"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _cleanup(client: TestClient, book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def test_patch_persists_ms_tools_thresholds():
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            r = client.patch(
                f"/api/books/{book_id}",
                json={
                    "ms_tools_max_sentence_length": 18,
                    "ms_tools_repetition_window": 80,
                    "ms_tools_max_filler_ratio": 0.03,
                },
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["ms_tools_max_sentence_length"] == 18
            assert body["ms_tools_repetition_window"] == 80
            assert abs(body["ms_tools_max_filler_ratio"] - 0.03) < 1e-9

            fetched = client.get(f"/api/books/{book_id}").json()
            assert fetched["ms_tools_max_sentence_length"] == 18
            assert fetched["ms_tools_repetition_window"] == 80
        finally:
            _cleanup(client, book_id)


def test_new_book_has_null_ms_tools_thresholds():
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            body = client.get(f"/api/books/{book_id}").json()
            assert body["ms_tools_max_sentence_length"] is None
            assert body["ms_tools_repetition_window"] is None
            assert body["ms_tools_max_filler_ratio"] is None
        finally:
            _cleanup(client, book_id)


def test_style_check_uses_per_book_threshold():
    """When book_id is supplied and overrides are set, the style check
    respects them: a sentence just above the override is flagged as long."""
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            client.patch(
                f"/api/books/{book_id}",
                json={"ms_tools_max_sentence_length": 5},
            )
            text = "This sentence clearly has more than five words."
            r = client.post(
                "/api/ms-tools/check",
                json={"text": text, "language": "en", "book_id": book_id},
            )
            assert r.status_code == 200, r.text
            assert r.json()["long_sentence_count"] >= 1

            r_default = client.post(
                "/api/ms-tools/check",
                json={"text": text, "language": "en"},
            )
            assert r_default.json()["long_sentence_count"] == 0
        finally:
            _cleanup(client, book_id)


def test_style_check_request_overrides_book_threshold():
    """Explicit request value beats per-book persisted override."""
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            client.patch(
                f"/api/books/{book_id}",
                json={"ms_tools_max_sentence_length": 5},
            )
            text = "This sentence has exactly eight little words inside, counted."
            r = client.post(
                "/api/ms-tools/check",
                json={
                    "text": text,
                    "language": "en",
                    "book_id": book_id,
                    "max_sentence_length": 50,
                },
            )
            assert r.status_code == 200
            assert r.json()["long_sentence_count"] == 0
        finally:
            _cleanup(client, book_id)
