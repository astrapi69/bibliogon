"""UX-FU-02: article-asset upload tests."""

from __future__ import annotations

import io
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_article(title: str = "Asset Host") -> dict:
    resp = client.post("/api/articles", json={"title": title})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _upload(article_id: str, name: str = "hero.png", content: bytes = b"\x89PNG\r\n\x1a\n") -> dict:
    files = {"file": (name, io.BytesIO(content), "image/png")}
    resp = client.post(f"/api/articles/{article_id}/assets", files=files)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_upload_featured_image_creates_asset_row() -> None:
    article = _create_article()
    asset = _upload(article["id"])
    assert asset["article_id"] == article["id"]
    assert asset["asset_type"] == "featured_image"
    assert asset["filename"] == "hero.png"
    assert Path(asset["path"]).exists()


def test_list_assets_returns_uploaded() -> None:
    article = _create_article("List Host")
    _upload(article["id"], name="a.png")
    _upload(article["id"], name="b.png")
    resp = client.get(f"/api/articles/{article['id']}/assets")
    assert resp.status_code == 200
    names = {row["filename"] for row in resp.json()}
    assert names == {"a.png", "b.png"}


def test_list_assets_404_on_missing_article() -> None:
    resp = client.get("/api/articles/does-not-exist/assets")
    assert resp.status_code == 404


def test_upload_rejects_unsupported_extension() -> None:
    article = _create_article("Extension Host")
    files = {"file": ("script.exe", io.BytesIO(b"MZ"), "application/octet-stream")}
    resp = client.post(f"/api/articles/{article['id']}/assets", files=files)
    assert resp.status_code == 400
    assert "extension" in resp.json()["detail"].lower()


def test_upload_rejects_invalid_asset_type() -> None:
    article = _create_article("Type Host")
    files = {"file": ("hero.png", io.BytesIO(b"\x89PNG"), "image/png")}
    resp = client.post(
        f"/api/articles/{article['id']}/assets",
        files=files,
        params={"asset_type": "garbage"},
    )
    assert resp.status_code == 400


def test_upload_404_on_missing_article() -> None:
    files = {"file": ("hero.png", io.BytesIO(b"\x89PNG"), "image/png")}
    resp = client.post("/api/articles/ghost/assets", files=files)
    assert resp.status_code == 404


def test_serve_asset_by_filename() -> None:
    article = _create_article("Serve Host")
    asset = _upload(article["id"], name="serve.png", content=b"\x89PNG-payload")
    resp = client.get(f"/api/articles/{article['id']}/assets/file/{asset['filename']}")
    assert resp.status_code == 200
    assert resp.content == b"\x89PNG-payload"


def test_serve_asset_404_on_missing_filename() -> None:
    article = _create_article("Serve 404")
    resp = client.get(f"/api/articles/{article['id']}/assets/file/missing.png")
    assert resp.status_code == 404


def test_delete_asset_removes_row_and_file() -> None:
    article = _create_article("Delete Host")
    asset = _upload(article["id"], name="zap.png")
    asset_path = Path(asset["path"])
    assert asset_path.exists()
    resp = client.delete(f"/api/articles/{article['id']}/assets/{asset['id']}")
    assert resp.status_code == 204
    assert not asset_path.exists()
    follow = client.get(f"/api/articles/{article['id']}/assets")
    assert follow.json() == []


def test_delete_asset_404_on_missing() -> None:
    article = _create_article("Delete 404")
    resp = client.delete(f"/api/articles/{article['id']}/assets/does-not-exist")
    assert resp.status_code == 404


def test_assets_cascade_delete_with_article() -> None:
    """Deleting the parent article removes its assets via CASCADE."""
    article = _create_article("Cascade Host")
    asset = _upload(article["id"])
    asset_path = Path(asset["path"])
    resp = client.delete(f"/api/articles/{article['id']}")
    assert resp.status_code == 204
    # The article is gone; an asset list under that article id 404s.
    follow = client.get(f"/api/articles/{article['id']}/assets")
    assert follow.status_code == 404
    # File on disk is left orphaned (cascade is DB-only); cleanup is
    # the upload-dir housekeeping task's responsibility, not the
    # delete handler. Pin this contract so it stays explicit.
    assert asset_path.exists()
