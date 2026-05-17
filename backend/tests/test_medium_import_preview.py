"""End-to-end tests for the Medium-import v2 dry-run preview endpoints.

Three endpoints under test:

  * ``POST /api/medium-import/preview`` — accepts the ZIP, returns the
    per-post preview table + a ``preview_id`` token.
  * ``POST /api/medium-import/import/{preview_id}`` — accepts a
    selection, imports only those, reaps the cache on success.
  * ``DELETE /api/medium-import/preview/{preview_id}`` — explicit
    cancel-from-UI.

Plus the importer's new ``selected_filenames`` selection plumbing.

Same lifespan discipline as test_medium_import_endpoint.py — plugin
routes are mounted by the FastAPI lifespan, so ``with TestClient(app)
as c:`` is mandatory or every request 404s.
"""

from __future__ import annotations

import io
import time
import zipfile
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Article

# Walk up to find the directory that contains
# ``plugins/bibliogon-plugin-medium-import``. Same logic as the
# sibling endpoint test file — see its comment for the mutmut /
# backend/plugins/installed/ rationale.
_REPO_ROOT = next(
    p
    for p in Path(__file__).resolve().parents
    if (p / "plugins" / "bibliogon-plugin-medium-import").is_dir()
)
FIXTURES_DIR = (
    _REPO_ROOT
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


@pytest.fixture(autouse=True)
def _reap_preview_cache() -> Iterator[None]:
    """Clear the on-disk preview cache between tests so leftover
    files from one test don't poison the next. The cache lives
    under ``get_data_dir() / "tmp" / "medium-import-previews"``
    which resolves to the conftest tmp dir under
    ``BIBLIOGON_DATA_DIR``."""
    from bibliogon_medium_import.preview import get_default_cache

    cache = get_default_cache()
    try:
        cache_dir = cache._cache_dir()
        for f in cache_dir.glob("*.zip"):
            try:
                f.unlink()
            except OSError:
                pass
    except OSError:
        pass
    yield
    try:
        cache_dir = cache._cache_dir()
        for f in cache_dir.glob("*.zip"):
            try:
                f.unlink()
            except OSError:
                pass
    except OSError:
        pass


def _build_zip(filenames: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in filenames:
            html = (FIXTURES_DIR / name).read_bytes()
            zf.writestr(f"posts/{name}", html)
    return buf.getvalue()


def _post_preview(client: TestClient, zip_bytes: bytes) -> dict:
    """Upload through ``POST /api/medium-import/preview``."""
    files = {"file": ("medium-export.zip", io.BytesIO(zip_bytes), "application/zip")}
    return client.post("/api/medium-import/preview", files=files).json()


def _post_import_selection(
    client: TestClient, preview_id: str, selected_filenames: list[str]
) -> dict:
    """Trigger ``POST /api/medium-import/import/{preview_id}`` with the
    image downloader patched. Same fake the v1 endpoint test uses."""
    from bibliogon_medium_import.image_downloader import DownloadResult

    def _fake_download(images, article_id, **kwargs):  # noqa: ANN001
        rewrites = {
            img.src: f"/api/articles/{article_id}/assets/file/dummy.jpg"
            for img in images
            if img.src
        }
        return DownloadResult(url_rewrites=rewrites, saved_filenames=[], warnings=[])

    with patch("bibliogon_medium_import.importer.download_images", _fake_download):
        return client.post(
            f"/api/medium-import/import/{preview_id}",
            json={"selected_filenames": selected_filenames},
        ).json()


# ---------------------------------------------------------------------------
# Preview endpoint — happy path + structure
# ---------------------------------------------------------------------------


def test_preview_returns_per_post_table_and_preview_id(client: TestClient) -> None:
    body = _post_preview(client, _build_zip(list(SAMPLE_FILES)))
    assert isinstance(body.get("preview_id"), str) and body["preview_id"]
    assert body["total_posts"] == 3
    assert len(body["items"]) == 3
    assert body["errored"] == []
    assert body["expires_at"] > time.time()

    # Sorted by filename for deterministic display.
    filenames = [item["filename"] for item in body["items"]]
    assert filenames == sorted(filenames)

    # Every row carries the documented preview columns.
    for item in body["items"]:
        assert {
            "filename",
            "title",
            "subtitle",
            "author",
            "published_at",
            "canonical_url",
            "detected_language",
            "classification",
            "existing_article_id",
            "body_preview",
            "warnings",
        }.issubset(item.keys())
        assert item["classification"] in ("article", "comment")


def test_preview_does_not_persist_any_article(client: TestClient, db: Session) -> None:
    """The whole point of the preview is no-side-effect parsing.
    A preview call MUST NOT create Article rows even though it
    parses every post."""
    before = db.query(Article).count()
    _post_preview(client, _build_zip(list(SAMPLE_FILES)))
    after = db.query(Article).count()
    assert before == after


def test_preview_flags_existing_canonical_urls(client: TestClient, db: Session) -> None:
    """When an article with a matching canonical_url already exists,
    the preview row's ``existing_article_id`` must point at it so
    the UI can render the 'would skip' badge."""
    # Seed: import the fixture via the v1 endpoint so we know the
    # canonical_url + article_id pair.
    from bibliogon_medium_import.image_downloader import DownloadResult

    def _fake_download(images, article_id, **kwargs):  # noqa: ANN001
        return DownloadResult(
            url_rewrites={img.src: "/x" for img in images if img.src},
            saved_filenames=[],
            warnings=[],
        )

    zip_bytes = _build_zip(["01_oldest_tech.html"])
    with patch("bibliogon_medium_import.importer.download_images", _fake_download):
        files = {"file": ("e.zip", io.BytesIO(zip_bytes), "application/zip")}
        seed = client.post("/api/medium-import/import", files=files).json()
    seeded_id = seed["imported"][0]["id"]
    seeded_url = seed["imported"][0]["canonical_url"]

    preview = _post_preview(client, zip_bytes)
    row = preview["items"][0]
    assert row["existing_article_id"] == seeded_id
    assert row["canonical_url"] == seeded_url


def test_preview_classifies_articles_vs_comments(client: TestClient) -> None:
    """The walker's comment heuristic must surface in the
    ``classification`` column. The bundled fixtures are all
    articles; assert at least that the column is correctly
    populated and exclusively uses the two documented values."""
    body = _post_preview(client, _build_zip(list(SAMPLE_FILES)))
    classifications = {item["classification"] for item in body["items"]}
    assert classifications.issubset({"article", "comment"})
    # All three audit fixtures are articles.
    assert all(item["classification"] == "article" for item in body["items"])


# ---------------------------------------------------------------------------
# Preview endpoint — error paths
# ---------------------------------------------------------------------------


def test_preview_non_zip_rejected_with_400(client: TestClient) -> None:
    files = {"file": ("not-a-zip.txt", io.BytesIO(b"hi"), "text/plain")}
    resp = client.post("/api/medium-import/preview", files=files)
    assert resp.status_code == 400


def test_preview_empty_file_rejected_with_400(client: TestClient) -> None:
    files = {"file": ("empty.zip", io.BytesIO(b""), "application/zip")}
    resp = client.post("/api/medium-import/preview", files=files)
    assert resp.status_code == 400


def test_preview_malformed_zip_rejected_with_400(client: TestClient) -> None:
    files = {"file": ("bad.zip", io.BytesIO(b"PK\x03\x04corrupt"), "application/zip")}
    resp = client.post("/api/medium-import/preview", files=files)
    assert resp.status_code == 400


def test_preview_zip_without_posts_dir_rejected_with_400(client: TestClient) -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("README.html", "<html></html>")
    files = {"file": ("noposts.zip", io.BytesIO(buf.getvalue()), "application/zip")}
    resp = client.post("/api/medium-import/preview", files=files)
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Import-with-selection endpoint
# ---------------------------------------------------------------------------


def test_import_selection_imports_only_selected_files(client: TestClient) -> None:
    """The whole point of v2: only the user-selected rows actually
    land in the DB. The two unselected ones must NOT appear in the
    ``imported`` list."""
    preview = _post_preview(client, _build_zip(list(SAMPLE_FILES)))
    selected = ["01_oldest_tech.html"]

    body = _post_import_selection(client, preview["preview_id"], selected)
    assert body["imported_count"] == 1
    assert body["skipped_count"] == 0
    assert body["errored_count"] == 0
    imported_titles = {a["title"] for a in body["imported"]}
    assert "Migrate a maven project to Gradle" in imported_titles
    # The other two fixture titles must NOT have been imported.
    assert "Migrate a maven project to Gradle" == next(iter(imported_titles))


def test_import_selection_reaps_cache_on_success(client: TestClient) -> None:
    """After a successful import the cached ZIP file must be gone
    so a retry against the same preview_id returns 404."""
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))
    _post_import_selection(client, preview["preview_id"], ["01_oldest_tech.html"])

    # Second import attempt against the same id must 404.
    resp = client.post(
        f"/api/medium-import/import/{preview['preview_id']}",
        json={"selected_filenames": ["01_oldest_tech.html"]},
    )
    assert resp.status_code == 404


def test_import_unknown_preview_id_returns_404(client: TestClient) -> None:
    resp = client.post(
        "/api/medium-import/import/this-id-does-not-exist",
        json={"selected_filenames": ["foo.html"]},
    )
    assert resp.status_code == 404


def test_import_empty_selection_returns_400_and_keeps_cache(client: TestClient) -> None:
    """A defense-in-depth gate against API callers that bypass the
    UI button-disable. The cache stays intact so the user can
    submit a non-empty selection without re-uploading."""
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))
    resp = client.post(
        f"/api/medium-import/import/{preview['preview_id']}",
        json={"selected_filenames": []},
    )
    assert resp.status_code == 400

    # Cache still valid — second attempt with a real selection works.
    body = _post_import_selection(
        client, preview["preview_id"], ["01_oldest_tech.html"]
    )
    assert body["imported_count"] == 1


def test_import_selection_filenames_not_in_zip_are_silently_ignored(
    client: TestClient,
) -> None:
    """The walker iterates only the files actually in the ZIP; if
    the selection carries a phantom filename (UI bug / race) the
    importer just skips it rather than erroring."""
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))
    body = _post_import_selection(
        client,
        preview["preview_id"],
        ["01_oldest_tech.html", "ghost.html"],
    )
    assert body["imported_count"] == 1
    assert body["errored_count"] == 0


# ---------------------------------------------------------------------------
# Cancel-preview endpoint
# ---------------------------------------------------------------------------


def test_cancel_preview_deletes_cache_entry(client: TestClient) -> None:
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))
    resp = client.delete(f"/api/medium-import/preview/{preview['preview_id']}")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True

    # Subsequent import attempts must 404.
    follow = client.post(
        f"/api/medium-import/import/{preview['preview_id']}",
        json={"selected_filenames": ["01_oldest_tech.html"]},
    )
    assert follow.status_code == 404


def test_cancel_preview_unknown_id_returns_200_deleted_false(client: TestClient) -> None:
    """Cancel is idempotent — the caller's intent ('forget this
    preview') is satisfied regardless of whether the cache entry
    still existed."""
    resp = client.delete("/api/medium-import/preview/does-not-exist")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is False
