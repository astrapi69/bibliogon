"""Regression pins for the v0.44.0 QA finding: asset-upload filename
path-traversal (CWE-22, arbitrary file write).

A crafted multipart filename like ``../../../../tmp/EVIL`` must NOT
escape the upload directory. ``safe_upload_filename`` reduces the name
to a bare basename; these tests assert the escape no longer happens at
each affected endpoint and that the unit helper rejects unsafe input.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.exceptions import ValidationError
from app.main import app
from app.paths import get_upload_dir, safe_upload_filename


def test_helper_strips_directory_components():
    assert safe_upload_filename("cover.png") == "cover.png"
    assert safe_upload_filename("../../../../etc/passwd") == "passwd"
    assert safe_upload_filename("/etc/shadow") == "shadow"
    assert safe_upload_filename(r"..\..\windows\system32\x.dll") == "x.dll"


@pytest.mark.parametrize("bad", [None, "", "..", ".", "../..", "/", "foo/.."])
def test_helper_rejects_unsafe(bad):
    with pytest.raises(ValidationError):
        safe_upload_filename(bad)


def test_book_asset_upload_no_traversal(tmp_path):
    with TestClient(app) as c:
        bid = c.post("/api/books", json={"title": "T", "author": "A"}).json()["id"]
        marker = Path("/tmp/QA_BOOK_ASSET_ESCAPE.txt")
        if marker.exists():
            marker.unlink()
        r = c.post(
            f"/api/books/{bid}/assets",
            files={"file": ("../../../../../../tmp/QA_BOOK_ASSET_ESCAPE.txt", b"x", "text/plain")},
            params={"asset_type": "figure"},
        )
        # Either rejected (400) OR stored safely inside the upload root.
        assert not marker.exists(), "upload escaped the upload directory"
        if r.status_code in (200, 201):
            stored = Path(r.json()["path"]).resolve()
            root = get_upload_dir().resolve()
            assert root in stored.parents, f"stored outside upload root: {stored}"
            assert r.json()["filename"] == "QA_BOOK_ASSET_ESCAPE.txt"


def test_article_asset_upload_no_traversal():
    with TestClient(app) as c:
        aid = c.post("/api/articles", json={"title": "A"}).json()["id"]
        marker = Path("/tmp/QA_ART_ASSET_ESCAPE.png")
        if marker.exists():
            marker.unlink()
        r = c.post(
            f"/api/articles/{aid}/assets",
            files={"file": ("../../../../../../tmp/QA_ART_ASSET_ESCAPE.png", b"x", "image/png")},
            params={"asset_type": "featured_image"},
        )
        assert not marker.exists(), "article upload escaped the upload directory"
        if r.status_code in (200, 201):
            stored = Path(r.json()["path"]).resolve()
            root = get_upload_dir().resolve()
            assert root in stored.parents
