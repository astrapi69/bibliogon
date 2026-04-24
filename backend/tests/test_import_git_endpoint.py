"""Tests for POST /api/import/detect/git.

The endpoint accepts JSON ``{git_url}`` and dispatches to the
first registered ``RemoteSourceHandler``. Plugin-git-sync
registers its ``GitImportHandler`` via its ``activate()`` hook;
these tests inject a stub handler so they stay network-free and
can cover the endpoint's dispatch + staging + error branches
without the plugin actually loading.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.import_plugins import (
    find_remote_handler,
    register_remote_handler,
)
from app.import_plugins.registry import _remote_registry
from app.main import app


class _StubGitHandler:
    source_kind = "git"

    def __init__(self, fixture_dir: Path, *, fail: Exception | None = None) -> None:
        self.fixture_dir = fixture_dir
        self.fail = fail
        self.clone_calls: list[tuple[str, Path]] = []

    def can_handle(self, url: str) -> bool:
        return url.startswith(("https://", "git@", "ssh://git"))

    def clone(self, url: str, target_dir: Path) -> Path:
        self.clone_calls.append((url, target_dir))
        if self.fail is not None:
            raise self.fail
        project_root = target_dir / "stubbed-repo"
        shutil.copytree(self.fixture_dir, project_root)
        return project_root


def _build_wbt_fixture(tmp_path: Path) -> Path:
    root = tmp_path / "wbt_fixture"
    (root / "config").mkdir(parents=True)
    (root / "manuscript" / "chapters").mkdir(parents=True)
    (root / "config" / "metadata.yaml").write_text(
        "title: Cloned Book\nauthor: R.E. Mote\nlang: en\n",
        encoding="utf-8",
    )
    (root / "manuscript" / "chapters" / "01-intro.md").write_text(
        "# Introduction\n\nBody.\n", encoding="utf-8"
    )
    return root


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def registered_stub(tmp_path_factory, request):
    """Install a stub git handler for the lifetime of one test, then
    remove it so other test files see an empty remote registry."""
    tmp = tmp_path_factory.mktemp("wbt")
    fixture = _build_wbt_fixture(tmp)
    fail: Exception | None = getattr(request, "param", None)
    stub = _StubGitHandler(fixture, fail=fail)

    pre = list(_remote_registry)
    register_remote_handler(stub)
    try:
        yield stub
    finally:
        _remote_registry.clear()
        _remote_registry.extend(pre)


def test_detect_git_returns_415_without_registered_handler(
    client: TestClient,
) -> None:
    assert find_remote_handler("https://example.invalid/repo") is None
    resp = client.post(
        "/api/import/detect/git",
        json={"git_url": "https://example.invalid/repo"},
    )
    assert resp.status_code == 415, resp.text
    body = resp.json()["detail"]
    assert "registered_remote_kinds" in body


def test_detect_git_dispatches_to_stub_and_finds_wbt(
    client: TestClient, registered_stub: _StubGitHandler
) -> None:
    url = "https://github.com/astrapi69/stubbed-repo"
    resp = client.post("/api/import/detect/git", json={"git_url": url})
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["detected"]["format_name"] == "wbt-zip"
    assert body["detected"]["title"] == "Cloned Book"
    assert body["temp_ref"].startswith("imp-")

    assert registered_stub.clone_calls, "Stub clone() was never invoked"
    called_url, target_dir = registered_stub.clone_calls[0]
    assert called_url == url
    assert target_dir.name == "payload"
    assert target_dir.parent.name.startswith("imp-")


@pytest.mark.parametrize(
    "registered_stub", [RuntimeError("remote says no")], indirect=True
)
def test_detect_git_maps_clone_failure_to_502(
    client: TestClient, registered_stub: _StubGitHandler
) -> None:
    resp = client.post(
        "/api/import/detect/git",
        json={"git_url": "https://example.invalid/broken"},
    )
    assert resp.status_code == 502, resp.text
    assert "remote says no" in resp.json()["detail"]


def test_detect_git_rejects_empty_url(client: TestClient) -> None:
    resp = client.post("/api/import/detect/git", json={"git_url": ""})
    assert resp.status_code == 422  # pydantic min_length=1
