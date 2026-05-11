"""End-to-end tests for the Medium-import bulk ZIP endpoint.

These exercise the full pipeline:

  ZIP upload -> extract -> walk each post -> dedup against
  canonical_url -> persist Article -> download images (mocked) ->
  rewrite TipTap doc -> create Publication + ArticleImportSource.

The 3 sample HTMLs from the audit drive the happy-path matrix.
Synthetic edge cases cover empty ZIP, malformed ZIP, and the
no-posts-dir branch.

NB: plugin routes are mounted by the FastAPI lifespan; using
``with TestClient(app) as c:`` is mandatory or the plugin router
stays unmounted and every request 404s. See lessons-learned.md
"Audiobook export is async with SSE progress" for the canonical
reference.
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
from app.models import Article, ArticleAsset, ArticleImportSource, Publication

FIXTURES_DIR = (
    Path(__file__).parent.parent.parent
    / "plugins"
    / "bibliogon-plugin-medium-import"
    / "tests"
    / "fixtures"
)

SAMPLE_FILES = (
    "01_oldest_tech.html",
    "02_german_philosophical.html",
    "03_english_recent_with_code.html",
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


def _build_zip(filenames: list[str]) -> bytes:
    """Build a minimal Medium-export ZIP from the named fixtures."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in filenames:
            html = (FIXTURES_DIR / name).read_bytes()
            zf.writestr(f"posts/{name}", html)
    return buf.getvalue()


def _post_zip(client: TestClient, zip_bytes: bytes, filename: str = "medium-export.zip") -> dict:
    """Upload a ZIP through /api/medium-import/import.

    The endpoint instantiates its own httpx.Client. To avoid hitting
    cdn-images-1.medium.com from tests we patch download_images
    inside the importer module to a fake that pretends every image
    downloaded successfully and produces a valid local served path.
    The asset-download path itself is exercised separately in
    test_medium_import_downloader.py.
    """
    from bibliogon_medium_import.image_downloader import DownloadResult

    def _fake_download(images, article_id, **kwargs):  # noqa: ANN001 - sig matches signature
        rewrites = {
            img.src: f"/api/articles/{article_id}/assets/file/dummy.jpg"
            for img in images
            if img.src
        }
        return DownloadResult(url_rewrites=rewrites, saved_filenames=[], warnings=[])

    with patch("bibliogon_medium_import.importer.download_images", _fake_download):
        files = {"file": (filename, io.BytesIO(zip_bytes), "application/zip")}
        return client.post("/api/medium-import/import", files=files).json()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_health_endpoint_responds(client: TestClient) -> None:
    resp = client.get("/api/medium-import/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_import_creates_article_publication_and_provenance(client: TestClient, db: Session) -> None:
    body = _post_zip(client, _build_zip(["01_oldest_tech.html"]))
    assert body["imported_count"] == 1
    assert body["skipped_count"] == 0
    assert body["errored_count"] == 0

    article_id = body["imported"][0]["id"]
    article = db.query(Article).filter(Article.id == article_id).one()
    assert article.title == "Migrate a maven project to Gradle"
    assert article.status == "published"
    assert article.canonical_url.endswith("2f276c4a070e")
    # content_json is parseable TipTap doc with paragraphs
    doc = json.loads(article.content_json)
    assert doc["type"] == "doc"
    assert any(n["type"] == "paragraph" for n in doc["content"])

    src = db.query(ArticleImportSource).filter(ArticleImportSource.article_id == article_id).one()
    assert src.source_type == "medium"
    assert src.format_name == "medium_html_export"
    assert src.source_identifier == article.canonical_url
    assert src.importer_version  # non-empty
    metadata = json.loads(src.import_metadata)
    assert metadata["original_published_at"] == "2020-02-04T15:46:58.820Z"
    assert metadata["source_filename"] == "01_oldest_tech.html"

    pub = db.query(Publication).filter(Publication.article_id == article_id).one()
    assert pub.platform == "medium"
    assert pub.status == "published"
    assert pub.published_at is not None
    pub_meta = json.loads(pub.platform_metadata)
    assert pub_meta["title"] == article.title
    assert pub_meta["tags"] == []  # MVP: empty tags by design


def test_bulk_import_all_three_fixtures(client: TestClient) -> None:
    body = _post_zip(client, _build_zip(list(SAMPLE_FILES)))
    assert body["imported_count"] == 3
    assert body["skipped_count"] == 0
    assert body["errored_count"] == 0
    titles = {a["title"] for a in body["imported"]}
    assert "Migrate a maven project to Gradle" in titles
    # German title is preserved with real umlauts
    assert any("Logos" in t for t in titles)


def test_dedup_skips_existing_canonical_url(client: TestClient, db: Session) -> None:
    """Re-importing the same archive should skip every post on the
    second pass and create no new Article rows."""
    zip_bytes = _build_zip(["01_oldest_tech.html"])
    first = _post_zip(client, zip_bytes)
    assert first["imported_count"] == 1

    second = _post_zip(client, zip_bytes)
    assert second["imported_count"] == 0
    assert second["skipped_count"] == 1
    skip_entry = second["skipped"][0]
    assert skip_entry["existing_article_id"] == first["imported"][0]["id"]
    assert skip_entry["canonical_url"] == first["imported"][0]["canonical_url"]

    article_count = (
        db.query(Article)
        .filter(Article.canonical_url == first["imported"][0]["canonical_url"])
        .count()
    )
    assert article_count == 1


def test_image_rewrite_lands_in_persisted_doc(client: TestClient, db: Session) -> None:
    """When the image downloader produces rewrites, the persisted
    content_json must reflect them - no cdn URLs left over."""
    body = _post_zip(client, _build_zip(["01_oldest_tech.html"]))
    article_id = body["imported"][0]["id"]
    article = db.query(Article).filter(Article.id == article_id).one()
    doc = json.loads(article.content_json)
    image_srcs: list[str] = []

    def _walk(n: dict) -> None:
        # Walker emits ``imageFigure`` to match Bibliogon's editor
        # schema (see lessons-learned: "TipTap image node in Bibliogon
        # is imageFigure, not image"). A test that still looks for
        # ``image`` will silently report zero images.
        if n.get("type") == "imageFigure":
            image_srcs.append(n["attrs"]["src"])
        for child in n.get("content") or []:
            _walk(child)

    _walk(doc)
    assert image_srcs, "fixture has at least one image"
    for src in image_srcs:
        assert src.startswith(f"/api/articles/{article_id}/assets/file/")


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


def test_non_zip_file_rejected_with_400(client: TestClient) -> None:
    files = {
        "file": ("not-a-zip.txt", io.BytesIO(b"hello world"), "text/plain"),
    }
    resp = client.post("/api/medium-import/import", files=files)
    assert resp.status_code == 400
    assert "zip" in resp.json()["detail"].lower()


def test_empty_file_rejected_with_400(client: TestClient) -> None:
    files = {"file": ("empty.zip", io.BytesIO(b""), "application/zip")}
    resp = client.post("/api/medium-import/import", files=files)
    assert resp.status_code == 400


def test_malformed_zip_rejected_with_400(client: TestClient) -> None:
    files = {"file": ("broken.zip", io.BytesIO(b"PK\x03\x04corrupt"), "application/zip")}
    resp = client.post("/api/medium-import/import", files=files)
    assert resp.status_code == 400


def test_zip_without_posts_dir_rejected_with_400(client: TestClient) -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("README.html", "<html></html>")
    files = {"file": ("no-posts.zip", io.BytesIO(buf.getvalue()), "application/zip")}
    resp = client.post("/api/medium-import/import", files=files)
    assert resp.status_code == 400


def test_zip_with_wrapper_directory_is_handled(client: TestClient) -> None:
    """Some Medium exports wrap posts/ in an outer directory like
    medium-export-2024/posts/. The importer must find it anyway."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        html = (FIXTURES_DIR / "01_oldest_tech.html").read_bytes()
        zf.writestr("medium-export-2024/posts/post.html", html)
    body = _post_zip(client, buf.getvalue())
    assert body["imported_count"] == 1


def test_no_asset_rows_when_download_is_mocked(client: TestClient, db: Session) -> None:
    """The fake download in _post_zip returns rewrites without
    writing ArticleAsset rows. Smoke check that the importer does
    not double-write rows when the downloader produces them."""
    body = _post_zip(client, _build_zip(["01_oldest_tech.html"]))
    article_id = body["imported"][0]["id"]
    rows = db.query(ArticleAsset).filter(ArticleAsset.article_id == article_id).all()
    assert rows == []


# ---------------------------------------------------------------------------
# Settings wiring — end-to-end behavior tests
#
# Per the v0.30.0 lessons-learned ("End-to-end behavior tests are not
# 'kwarg passes through' tests"): each of these flips one setting to a
# non-default value and asserts an OBSERVABLE behavioral difference.
# Smoke tests that only check "the kwarg arrived in import_zip" would
# have passed even before the wiring fix landed.
# ---------------------------------------------------------------------------


def _post_zip_with_settings(
    client: TestClient,
    zip_bytes: bytes,
    settings: dict,
    download_capture: list | None = None,
) -> dict:
    """Like _post_zip but injects a custom settings dict via set_config.

    ``download_capture``, when provided, receives one tuple
    ``(images, article_id, kwargs)`` per call to ``download_images``.
    Lets the test assert that the kwarg actually reached the
    downloader (e.g. the timeout value).
    """
    from bibliogon_medium_import import routes as mi_routes
    from bibliogon_medium_import.image_downloader import DownloadResult

    def _fake_download(images, article_id, **kwargs):  # noqa: ANN001
        if download_capture is not None:
            download_capture.append((images, article_id, kwargs))
        rewrites = {
            img.src: f"/api/articles/{article_id}/assets/file/dummy.jpg"
            for img in images
            if img.src
        }
        return DownloadResult(url_rewrites=rewrites, saved_filenames=[], warnings=[])

    saved_config = mi_routes._config
    mi_routes.set_config({"settings": settings})
    try:
        with patch("bibliogon_medium_import.importer.download_images", _fake_download):
            files = {"file": ("medium-export.zip", io.BytesIO(zip_bytes), "application/zip")}
            return client.post("/api/medium-import/import", files=files).json()
    finally:
        mi_routes.set_config(saved_config)


def test_setting_default_status_propagates_to_article(
    client: TestClient, db: Session
) -> None:
    body = _post_zip_with_settings(
        client,
        _build_zip(["01_oldest_tech.html"]),
        {"default_status": "draft"},
    )
    assert body["imported_count"] == 1
    article = db.query(Article).filter(Article.id == body["imported"][0]["id"]).one()
    assert article.status == "draft"


def test_setting_skip_existing_false_allows_reimport(
    client: TestClient, db: Session
) -> None:
    """Setting skip_existing_canonical_urls=False must let the second
    pass actually create a NEW article (today's behavior keeps the
    first one as the dedup target; the toggle was previously dead)."""
    zip_bytes = _build_zip(["02_german_philosophical.html"])
    first = _post_zip_with_settings(
        client, zip_bytes, {"skip_existing_canonical_urls": True}
    )
    assert first["imported_count"] == 1
    canonical = first["imported"][0]["canonical_url"]
    first_count = (
        db.query(Article).filter(Article.canonical_url == canonical).count()
    )
    assert first_count == 1

    # With skip_existing_canonical_urls=False, the dedup branch in
    # _import_one_post must NOT short-circuit; another row appears.
    second = _post_zip_with_settings(
        client, zip_bytes, {"skip_existing_canonical_urls": False}
    )
    assert second["imported_count"] == 1
    assert second["skipped_count"] == 0
    second_count = (
        db.query(Article).filter(Article.canonical_url == canonical).count()
    )
    assert second_count == 2  # second pass created a duplicate row


def test_setting_download_images_false_skips_download(
    client: TestClient, db: Session
) -> None:
    """When download_images=False, the downloader must NOT be called
    and the body's image URLs must stay CDN-hosted."""
    capture: list = []
    body = _post_zip_with_settings(
        client,
        _build_zip(["01_oldest_tech.html"]),
        {"download_images": False},
        download_capture=capture,
    )
    assert body["imported_count"] == 1
    assert capture == []  # downloader was never invoked

    article = db.query(Article).filter(Article.id == body["imported"][0]["id"]).one()
    doc = json.loads(article.content_json)
    image_srcs = []

    def _walk(node):
        if isinstance(node, dict):
            if node.get("type") == "imageFigure":
                image_srcs.append(node.get("attrs", {}).get("src"))
            for child in node.get("content", []) or []:
                _walk(child)

    _walk(doc)
    assert image_srcs, "fixture has at least one image"
    for src in image_srcs:
        assert src.startswith("https://cdn-images-1.medium.com/"), (
            f"expected CDN URL when download_images=False, got {src!r}"
        )


def test_setting_image_download_timeout_seconds_passes_to_downloader(
    client: TestClient,
) -> None:
    capture: list = []
    _post_zip_with_settings(
        client,
        _build_zip(["01_oldest_tech.html"]),
        {"image_download_timeout_seconds": 7},
        download_capture=capture,
    )
    assert capture, "downloader should have been invoked"
    _images, _article_id, kwargs = capture[0]
    assert kwargs.get("timeout_seconds") == 7.0


def test_settings_absent_falls_back_to_safe_defaults(
    client: TestClient, db: Session
) -> None:
    """An empty settings dict must NOT crash the endpoint. The
    importer's hardcoded defaults (download=True, skip=True,
    status='published', timeout=30) take effect."""
    body = _post_zip_with_settings(
        client, _build_zip(["01_oldest_tech.html"]), {}
    )
    assert body["imported_count"] == 1
    article = db.query(Article).filter(Article.id == body["imported"][0]["id"]).one()
    assert article.status == "published"  # default


def test_setting_default_status_junk_value_falls_back_to_published(
    client: TestClient, db: Session
) -> None:
    """A value the database accepts but that is meaningless to
    Bibliogon (e.g. None, empty string) must coerce to 'published'."""
    body = _post_zip_with_settings(
        client, _build_zip(["01_oldest_tech.html"]), {"default_status": ""}
    )
    article = db.query(Article).filter(Article.id == body["imported"][0]["id"]).one()
    assert article.status == "published"
