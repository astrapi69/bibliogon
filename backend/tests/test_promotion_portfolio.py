"""End-to-end tests for the portfolio board (#782).

plugin-promotion is enabled in config/app.yaml, so the TestClient
lifespan mounts its router. Module-scoped client for the usual reason:
the FastAPI singleton accumulates plugin-route state across per-test
lifespans.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Book, BookImportSource

EBOOK_URL = "https://www.amazon.com/dp/B0DWND11Y8"
PAPERBACK_URL = "https://www.amazon.com/dp/B0DWSW5PB7"
REPO_URL = "https://github.com/astrapi69/ai-for-everyone"


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def book(client: TestClient) -> dict:
    response = client.post(
        "/api/books", json={"title": "Portfolio Probe", "author": "Asterios Raptis"}
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


class TestBoard:
    def test_a_fresh_book_reports_all_three_formats_as_missing(
        self, client: TestClient, book: dict
    ) -> None:
        """Absent must be visible: the board is a worklist, not a log."""
        body = client.get(f"/api/promotion/portfolio/{book['id']}").json()
        assert [entry["book_format"] for entry in body["formats"]] == [
            "ebook",
            "paperback",
            "hardcover",
        ]
        assert {entry["status"] for entry in body["formats"]} == {"missing"}
        assert body["gaps"] == ["ebook", "paperback", "hardcover"]

    def test_unknown_book_is_a_404(self, client: TestClient) -> None:
        assert client.get("/api/promotion/portfolio/does-not-exist").status_code == 404

    def test_gaps_only_filter_hides_fully_published_books(
        self, client: TestClient, book: dict
    ) -> None:
        for book_format, url in (
            ("ebook", EBOOK_URL),
            ("paperback", PAPERBACK_URL),
            ("hardcover", "https://www.amazon.com/dp/B0FR1X1MVX"),
        ):
            client.put(
                f"/api/promotion/portfolio/{book['id']}/formats/{book_format}",
                json={"status": "live", "store_url": url},
            )
        ids = [
            row["book_id"]
            for row in client.get("/api/promotion/portfolio?gaps_only=true").json()["books"]
        ]
        assert book["id"] not in ids


class TestFormatState:
    def test_upsert_sets_status_link_and_asin(self, client: TestClient, book: dict) -> None:
        response = client.put(
            f"/api/promotion/portfolio/{book['id']}/formats/ebook",
            json={"status": "live", "store_url": EBOOK_URL, "asin": "B0DWND11Y8"},
        )
        assert response.status_code == 200, response.text
        entry = next(e for e in response.json()["formats"] if e["book_format"] == "ebook")
        assert entry["status"] == "live"
        assert entry["store_url"] == EBOOK_URL
        assert entry["asin"] == "B0DWND11Y8"

    def test_the_asin_lands_in_the_books_own_column(
        self, client: TestClient, book: dict, db_session
    ) -> None:
        """One source of truth: the format row must not shadow Book.asin_*."""
        client.put(
            f"/api/promotion/portfolio/{book['id']}/formats/paperback",
            json={"status": "live", "store_url": PAPERBACK_URL, "asin": "B0DWSW5PB7"},
        )
        stored = db_session.query(Book).filter(Book.id == book["id"]).one()
        assert stored.asin_paperback == "B0DWSW5PB7"

    def test_a_second_identical_upsert_keeps_one_row(
        self, client: TestClient, book: dict
    ) -> None:
        payload = {"status": "live", "store_url": EBOOK_URL}
        client.put(f"/api/promotion/portfolio/{book['id']}/formats/ebook", json=payload)
        body = client.put(
            f"/api/promotion/portfolio/{book['id']}/formats/ebook", json=payload
        ).json()
        ebook_entries = [e for e in body["formats"] if e["book_format"] == "ebook"]
        assert len(ebook_entries) == 1

    def test_an_unknown_format_is_rejected_before_it_reaches_the_database(
        self, client: TestClient, book: dict
    ) -> None:
        response = client.put(
            f"/api/promotion/portfolio/{book['id']}/formats/audiobook",
            json={"status": "live"},
        )
        assert response.status_code == 422

    def test_an_unknown_status_is_rejected(self, client: TestClient, book: dict) -> None:
        response = client.put(
            f"/api/promotion/portfolio/{book['id']}/formats/ebook",
            json={"status": "published"},
        )
        assert response.status_code == 422

    def test_universal_link_is_stored_on_the_book(self, client: TestClient, book: dict) -> None:
        body = client.patch(
            f"/api/promotion/portfolio/{book['id']}",
            json={"universal_link": "https://mybook.to/probe"},
        ).json()
        assert body["universal_link"] == "https://mybook.to/probe"


class TestCsvImport:
    def _row(self, title: str, **overrides) -> dict:
        row = {
            "title": title,
            "author": "Asterios Raptis",
            "language": "EN",
            "status": "Published",
            "universal_link": "https://mybook.to/probe",
            "links": {"ebook": EBOOK_URL, "paperback": PAPERBACK_URL, "hardcover": None},
        }
        row.update(overrides)
        return row

    def test_dry_run_reports_the_change_but_writes_nothing(
        self, client: TestClient, book: dict
    ) -> None:
        report = client.post(
            "/api/promotion/portfolio/import",
            json={"dry_run": True, "rows": [self._row(book["title"])]},
        ).json()
        assert report["dry_run"] is True
        assert report["matched"] == 1
        assert report["changed"] == 1

        after = client.get(f"/api/promotion/portfolio/{book['id']}").json()
        assert after["universal_link"] is None
        assert {entry["status"] for entry in after["formats"]} == {"missing"}

    def test_apply_then_reapply_is_idempotent(self, client: TestClient, book: dict) -> None:
        """The #762 lesson: a second run must change nothing."""
        payload = {"dry_run": False, "rows": [self._row(book["title"])]}
        first = client.post("/api/promotion/portfolio/import", json=payload).json()
        second = client.post("/api/promotion/portfolio/import", json=payload).json()
        assert first["changed"] == 1
        assert second["changed"] == 0
        assert second["unchanged"] == 1

    def test_links_drive_status_and_asin(self, client: TestClient, book: dict) -> None:
        client.post(
            "/api/promotion/portfolio/import",
            json={"dry_run": False, "rows": [self._row(book["title"])]},
        )
        body = client.get(f"/api/promotion/portfolio/{book['id']}").json()
        by_format = {entry["book_format"]: entry for entry in body["formats"]}
        assert by_format["ebook"]["status"] == "live"
        assert by_format["ebook"]["asin"] == "B0DWND11Y8"
        assert by_format["hardcover"]["status"] == "missing"
        assert body["gaps"] == ["hardcover"]

    def test_a_row_matches_its_book_by_repository_not_by_title(
        self, client: TestClient, book: dict, db_session
    ) -> None:
        """Titles drift and repeat across translations; the repo
        identifier is the reliable key since #762."""
        db_session.add(
            BookImportSource(
                book_id=book["id"],
                source_identifier="git:github.com/astrapi69/ai-for-everyone#main",
                source_type="git",
                format_name="wbt-zip",
            )
        )
        db_session.commit()
        report = client.post(
            "/api/promotion/portfolio/import",
            json={
                "dry_run": True,
                "rows": [
                    self._row(
                        "A Title That Does Not Match",
                        github_url=REPO_URL,
                        github_branch="main",
                    )
                ],
            },
        ).json()
        assert report["matched_by_repo"] == 1
        assert report["unmatched"] == []

    def test_an_unmatched_row_is_reported_not_silently_dropped(
        self, client: TestClient
    ) -> None:
        report = client.post(
            "/api/promotion/portfolio/import",
            json={"dry_run": True, "rows": [self._row("No Such Book Anywhere")]},
        ).json()
        assert report["unmatched"] == ["No Such Book Anywhere"]
        assert report["matched"] == 0

    def test_an_empty_batch_is_a_400(self, client: TestClient) -> None:
        response = client.post(
            "/api/promotion/portfolio/import", json={"dry_run": True, "rows": []}
        )
        assert response.status_code == 400
