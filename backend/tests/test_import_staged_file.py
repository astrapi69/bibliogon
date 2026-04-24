"""Tests for GET /api/import/staged/{temp_ref}/file.

Serves staged preview assets (cover thumbnails + any other image)
so the wizard's Step 3 CoverThumbnail can render the actual image
before the user commits the import.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _wbt_with_cover(tmp_path: Path) -> Path:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "book/config/metadata.yaml",
            "title: Preview Cover\nauthor: A\nlang: en\n",
        )
        zf.writestr("book/assets/covers/cover.png", b"\x89PNG\r\n\x1a\n")
        zf.writestr("book/manuscript/chapters/01.md", "# C\n\nBody.\n")
    path = tmp_path / "book.zip"
    path.write_bytes(buf.getvalue())
    return path


def test_staged_file_serves_detected_asset(
    client: TestClient, tmp_path: Path
) -> None:
    zip_path = _wbt_with_cover(tmp_path)
    with open(zip_path, "rb") as f:
        detect = client.post(
            "/api/import/detect",
            files=[("files", (zip_path.name, f.read(), "application/zip"))],
        )
    assert detect.status_code == 200, detect.text
    body = detect.json()
    temp_ref = body["temp_ref"]
    # Find the cover asset's path.
    assets = body["detected"]["assets"]
    cover = next(a for a in assets if a["purpose"] == "cover")

    resp = client.get(
        f"/api/import/staged/{temp_ref}/file",
        params={"path": cover["path"]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.content.startswith(b"\x89PNG")


def test_staged_file_rejects_path_traversal(client: TestClient) -> None:
    resp = client.get(
        "/api/import/staged/imp-nonexistent/file",
        params={"path": "../../etc/passwd"},
    )
    assert resp.status_code == 400


def test_staged_file_rejects_unknown_temp_ref(client: TestClient) -> None:
    resp = client.get(
        "/api/import/staged/imp-does-not-exist/file",
        params={"path": "assets/covers/cover.png"},
    )
    assert resp.status_code == 404


def test_staged_file_missing_file_returns_404(
    client: TestClient, tmp_path: Path
) -> None:
    zip_path = _wbt_with_cover(tmp_path)
    with open(zip_path, "rb") as f:
        detect = client.post(
            "/api/import/detect",
            files=[("files", (zip_path.name, f.read(), "application/zip"))],
        )
    temp_ref = detect.json()["temp_ref"]

    resp = client.get(
        f"/api/import/staged/{temp_ref}/file",
        params={"path": "assets/covers/not-present.png"},
    )
    assert resp.status_code == 404
