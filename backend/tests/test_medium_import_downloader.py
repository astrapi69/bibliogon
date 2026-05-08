"""Backend-side tests for the Medium-import image downloader.

The pure-function tests (filename derivation, URL rewrite) live
in the plugin's own test suite. This file covers the parts that
need a real DB session and the upload-dir filesystem:

  * download_images writes files under
    uploads/articles/<id>/imported_image/
  * one ArticleAsset row is created per successful download
  * the returned rewrite map points cdn URLs at served paths
  * a per-image HTTP failure emits a warning but doesn't abort
    the batch
  * the served path resolves via /api/articles/<id>/assets/file/
    once the assets are persisted (regression check that the
    asset_type addition in this commit is wired through)
"""

from __future__ import annotations

import httpx
import pytest
from bibliogon_medium_import.image_downloader import download_images
from bibliogon_medium_import.walker import ImageRef
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Article, ArticleAsset
from app.paths import get_upload_dir

client = TestClient(app)


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _make_article(db: Session, title: str = "Medium Import Test") -> Article:
    article = Article(title=title, language="en")
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


class _FakeHTTPClient:
    """Minimal stand-in for httpx.Client used in the downloader.

    Returns canned responses keyed by URL. Any URL not in the map
    raises an HTTPError to simulate a fetch failure.
    """

    def __init__(self, responses: dict[str, bytes]) -> None:
        self._responses = responses
        self.calls: list[str] = []

    def get(self, url: str, timeout: float | None = None) -> httpx.Response:
        self.calls.append(url)
        if url not in self._responses:
            raise httpx.RequestError("fake fetch failed", request=httpx.Request("GET", url))
        return httpx.Response(
            200,
            content=self._responses[url],
            request=httpx.Request("GET", url),
        )

    def close(self) -> None:
        pass


_PNG_BYTES = b"\x89PNG\r\n\x1a\nfake-image-content"


def test_download_creates_files_assets_and_rewrites(db: Session) -> None:
    article = _make_article(db)
    cdn_url = "https://cdn-images-1.medium.com/max/800/1*aaa.jpeg"
    images = [ImageRef(src=cdn_url, data_image_id="1*aaa.jpeg", caption="cap")]
    fake_client = _FakeHTTPClient({cdn_url: _PNG_BYTES})

    result = download_images(images, article.id, client=fake_client)

    target = get_upload_dir() / "articles" / article.id / "imported_image" / "1_aaa.jpeg"
    assert target.exists()
    assert target.read_bytes() == _PNG_BYTES

    db.expire_all()
    rows = db.query(ArticleAsset).filter(ArticleAsset.article_id == article.id).all()
    assert len(rows) == 1
    assert rows[0].asset_type == "imported_image"
    assert rows[0].filename == "1_aaa.jpeg"

    assert result.url_rewrites == {cdn_url: f"/api/articles/{article.id}/assets/file/1_aaa.jpeg"}
    assert result.warnings == []


def test_download_warning_on_http_failure(db: Session) -> None:
    article = _make_article(db, title="Failure Host")
    good = "https://cdn-images-1.medium.com/max/800/1*good.jpeg"
    bad = "https://cdn-images-1.medium.com/max/800/1*bad.jpeg"
    images = [
        ImageRef(src=good, data_image_id="1*good.jpeg"),
        ImageRef(src=bad, data_image_id="1*bad.jpeg"),
    ]
    fake_client = _FakeHTTPClient({good: _PNG_BYTES})

    result = download_images(images, article.id, client=fake_client)

    # Good image saved + warning for the bad one
    assert good in result.url_rewrites
    assert bad not in result.url_rewrites
    assert any("1*bad.jpeg" in w for w in result.warnings)

    db.expire_all()
    rows = db.query(ArticleAsset).filter(ArticleAsset.article_id == article.id).all()
    assert len(rows) == 1
    assert rows[0].filename == "1_good.jpeg"


def test_served_url_resolves_via_assets_endpoint(db: Session) -> None:
    """Regression check: imported_image must be allow-listed by the
    asset router so the served path delivers the file."""
    article = _make_article(db, title="Served Host")
    cdn_url = "https://cdn-images-1.medium.com/max/800/1*served.jpeg"
    images = [ImageRef(src=cdn_url, data_image_id="1*served.jpeg")]
    fake_client = _FakeHTTPClient({cdn_url: _PNG_BYTES})

    download_images(images, article.id, client=fake_client)

    resp = client.get(
        f"/api/articles/{article.id}/assets/file/1_served.jpeg",
        follow_redirects=False,
    )
    assert resp.status_code == 200
    assert resp.content == _PNG_BYTES


def test_download_skips_empty_src(db: Session) -> None:
    article = _make_article(db, title="Empty Src Host")
    images = [ImageRef(src="", data_image_id="x")]
    fake_client = _FakeHTTPClient({})

    result = download_images(images, article.id, client=fake_client)

    assert result.url_rewrites == {}
    assert fake_client.calls == []
