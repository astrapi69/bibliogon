"""End-to-end tests for the Danger Zone HTTP endpoints.

Exercises the two-phase contract from the client's perspective:

- ``POST /api/system/reset/prepare`` issues a token + expiry
- ``POST /api/system/reset`` accepts ``{token, confirmation}``
- 400 on missing / expired / tampered token
- 400 on wrong confirmation literal
- Happy path returns ``status: "reset"`` and matches the
  ``reset_service.run_reset`` response shape

The filesystem layer here is the REAL test data dir managed by
``conftest.py``'s ``BIBLIOGON_DATA_DIR``. The endpoint resolves
paths via ``app.paths.get_data_dir()`` + the secrets-override
helper - the test merely verifies the wiring + status codes.
The deep semantics (every-table-empty + reseed) are covered by
``test_reset_service.py``.
"""

from __future__ import annotations

import os

from fastapi.testclient import TestClient

from app.main import app
from app.models import Book
from app.services import reset_token


def _client() -> TestClient:
    return TestClient(app)


def _seed_book_via_db() -> str:
    """Insert a row directly so the reset has something to delete."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        b = Book(title="reset-target")
        db.add(b)
        db.commit()
        return b.id
    finally:
        db.close()


class TestResetPrepare:
    def test_returns_signed_token(self) -> None:
        with _client() as c:
            resp = c.post("/api/system/reset/prepare")
            assert resp.status_code == 200
            body = resp.json()
            assert "token" in body
            assert "expires_at" in body
            assert body["ttl_seconds"] == 300
            # Token must verify with the same secret used in-process.
            assert reset_token.verify_token(body["token"]) is True

    def test_two_calls_issue_distinct_tokens(self) -> None:
        with _client() as c:
            a = c.post("/api/system/reset/prepare").json()
            b = c.post("/api/system/reset/prepare").json()
            assert a["token"] != b["token"]


class TestResetExecute:
    def test_happy_path_returns_reset_status(self) -> None:
        with _client() as c:
            # Force the secrets path to a tmp location for the test
            # so we don't touch real ~/.config/bibliogon/secrets.yaml.
            # The reset_service resolves the path via app.main, which
            # respects XDG_CONFIG_HOME - override that.
            old_xdg = os.environ.get("XDG_CONFIG_HOME")
            os.environ["XDG_CONFIG_HOME"] = os.environ["BIBLIOGON_DATA_DIR"]
            try:
                book_id = _seed_book_via_db()
                token = c.post("/api/system/reset/prepare").json()["token"]
                resp = c.post(
                    "/api/system/reset",
                    json={"token": token, "confirmation": "RESET"},
                )
                assert resp.status_code == 200, resp.text
                body = resp.json()
                assert body["status"] == "reset"
                assert "rows_deleted" in body
                assert "jobs_cancelled" in body
                # The book we seeded is gone.
                from app.database import SessionLocal

                db = SessionLocal()
                try:
                    assert db.query(Book).filter(Book.id == book_id).first() is None
                finally:
                    db.close()
            finally:
                if old_xdg is None:
                    os.environ.pop("XDG_CONFIG_HOME", None)
                else:
                    os.environ["XDG_CONFIG_HOME"] = old_xdg

    def test_wrong_confirmation_rejected(self) -> None:
        with _client() as c:
            token = c.post("/api/system/reset/prepare").json()["token"]
            resp = c.post(
                "/api/system/reset",
                json={"token": token, "confirmation": "reset"},  # lowercase
            )
            assert resp.status_code == 400
            assert "confirmation" in resp.json()["detail"].lower()

    def test_missing_confirmation_rejected(self) -> None:
        with _client() as c:
            token = c.post("/api/system/reset/prepare").json()["token"]
            resp = c.post(
                "/api/system/reset",
                json={"token": token, "confirmation": ""},
            )
            # Empty string fails the literal check (400), not Pydantic
            # min_length (we did not set min_length on confirmation
            # because the literal check provides the same protection).
            assert resp.status_code == 400

    def test_garbage_token_rejected(self) -> None:
        with _client() as c:
            resp = c.post(
                "/api/system/reset",
                json={"token": "not-a-real-token", "confirmation": "RESET"},
            )
            assert resp.status_code == 400
            assert (
                "token" in resp.json()["detail"].lower()
                or "expired" in resp.json()["detail"].lower()
            )

    def test_missing_token_rejected(self) -> None:
        with _client() as c:
            resp = c.post(
                "/api/system/reset",
                json={"token": "", "confirmation": "RESET"},
            )
            # Pydantic min_length=1 -> 422 unprocessable entity.
            assert resp.status_code == 422

    def test_tampered_token_rejected(self) -> None:
        with _client() as c:
            token = c.post("/api/system/reset/prepare").json()["token"]
            # Flip a character in the signature half.
            payload, sig = token.split(".", 1)
            tampered = f"{payload}.{sig[:-1]}X"
            resp = c.post(
                "/api/system/reset",
                json={"token": tampered, "confirmation": "RESET"},
            )
            assert resp.status_code == 400
