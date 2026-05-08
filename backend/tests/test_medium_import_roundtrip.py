"""Round-trip smoke tests for Medium-imported articles.

The walker, downloader, and endpoint already have unit and
integration tests. This file covers the user-flow gap: once the
ZIP import has run, are the resulting Articles usable through
Bibliogon's existing API surface?

  * GET /api/articles lists them
  * GET /api/articles/{id} returns the same content the importer
    persisted (TipTap JSON, status, canonical_url, etc.)
  * DELETE /api/articles/{id} (soft-delete to trash) and POST
    /trash/{id}/restore round-trip cleanly
  * The imported Publication is queryable via the publications
    router and reports content_snapshot_at_publish == content_json
    so the drift detector treats the post as in-sync at import
    time
  * The ArticleImportSource is fetchable through the relationship
    on the loaded Article ORM object

Importer internals are mocked at the image-download layer so
tests don't touch the network.
"""

from __future__ import annotations

import io
import json
import zipfile
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Article, ArticleImportSource, Publication

FIXTURES_DIR = (
    Path(__file__).parent.parent.parent
    / "plugins"
    / "bibliogon-plugin-medium-import"
    / "tests"
    / "fixtures"
)


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _import_one(client: TestClient, fixture_name: str) -> dict:
    """Build a minimal ZIP with a single fixture and import it.

    The image-download path is patched out so tests never hit
    cdn-images-1.medium.com.
    """
    from bibliogon_medium_import.image_downloader import DownloadResult

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            f"posts/{fixture_name}",
            (FIXTURES_DIR / fixture_name).read_bytes(),
        )

    def _fake_download(images, article_id, **kwargs):  # noqa: ANN001
        return DownloadResult(
            url_rewrites={
                img.src: f"/api/articles/{article_id}/assets/file/dummy.jpg"
                for img in images
                if img.src
            },
            saved_filenames=[],
            warnings=[],
        )

    with patch("bibliogon_medium_import.importer.download_images", _fake_download):
        files = {"file": ("export.zip", io.BytesIO(buf.getvalue()), "application/zip")}
        body = client.post("/api/medium-import/import", files=files).json()

    assert body["imported_count"] == 1, body
    return body["imported"][0]


def test_imported_article_appears_in_list_endpoint(client: TestClient) -> None:
    imported = _import_one(client, "01_oldest_tech.html")
    listing = client.get("/api/articles").json()
    ids = {row["id"] for row in listing}
    assert imported["id"] in ids


def test_imported_article_get_returns_same_content(client: TestClient) -> None:
    imported = _import_one(client, "03_english_recent_with_code.html")
    article_id = imported["id"]
    fetched = client.get(f"/api/articles/{article_id}").json()
    assert fetched["title"] == imported["title"]
    assert fetched["status"] == "published"
    assert fetched["canonical_url"] == imported["canonical_url"]
    # content_json round-trips as a parseable TipTap doc
    doc = json.loads(fetched["content_json"])
    assert doc["type"] == "doc"
    assert doc["content"]


def test_imported_article_trash_and_restore_round_trip(client: TestClient, db: Session) -> None:
    imported = _import_one(client, "02_german_philosophical.html")
    article_id = imported["id"]

    # Soft-delete (trash)
    resp = client.delete(f"/api/articles/{article_id}")
    assert resp.status_code in (200, 204)
    db.expire_all()
    assert (
        db.query(Article).filter(Article.id == article_id, Article.deleted_at.is_(None)).first()
        is None
    ), "article should be soft-deleted"

    # Restore
    restore = client.post(f"/api/articles/trash/{article_id}/restore")
    assert restore.status_code == 200
    db.expire_all()
    article = db.query(Article).filter(Article.id == article_id).one()
    assert article.deleted_at is None


def test_publication_records_drift_baseline_at_import(client: TestClient, db: Session) -> None:
    """The Publication created at import time MUST snapshot the
    article's content_json so the drift detector treats the post
    as in-sync until the user edits it. Without this, every
    imported article would show up as 'out_of_sync' immediately."""
    imported = _import_one(client, "01_oldest_tech.html")
    article_id = imported["id"]
    article = db.query(Article).filter(Article.id == article_id).one()
    pub = db.query(Publication).filter(Publication.article_id == article_id).one()
    assert pub.content_snapshot_at_publish == article.content_json


def test_imported_article_carries_import_source_relationship(
    client: TestClient, db: Session
) -> None:
    """Article.import_source (relationship) must resolve so callers
    that load an Article can ask 'where did this come from?'
    without an extra query."""
    imported = _import_one(client, "01_oldest_tech.html")
    article_id = imported["id"]
    article = db.query(Article).filter(Article.id == article_id).one()
    assert article.import_source is not None
    assert article.import_source.source_type == "medium"
    assert article.import_source.source_identifier == imported["canonical_url"]
    # Provenance survives a deep-fetch via the relationship
    src_via_query = (
        db.query(ArticleImportSource).filter(ArticleImportSource.article_id == article_id).one()
    )
    assert src_via_query.id == article.import_source.id
