"""End-to-end tests for POST /api/import/detect/git.

plugin-git-sync is enabled in config/app.yaml so the TestClient
lifespan registers the real ``GitImportHandler`` in the core
remote-source registry. We monkey-patch ``GitPython.Repo`` inside
the plugin so the clone step materialises a local WBT fixture
instead of talking to a real git remote.

Uses a module-scoped client fixture to keep the number of
lifespan invocations down (the backend FastAPI singleton
accumulates plugin-route state across per-test lifespans; see
the notes on the other scope="module" fixtures).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _build_wbt(project_root: Path, *, title: str = "End To End Book") -> None:
    (project_root / "config").mkdir(parents=True)
    (project_root / "manuscript" / "chapters").mkdir(parents=True)
    (project_root / "config" / "metadata.yaml").write_text(
        f"title: {title}\nauthor: G. I. Sync\nlang: en\n",
        encoding="utf-8",
    )
    (project_root / "manuscript" / "chapters" / "01-intro.md").write_text(
        "# Introduction\n\nFrom a cloned repo.\n", encoding="utf-8"
    )


def _patch_git_repo(monkeypatch: pytest.MonkeyPatch, clone_impl):
    """Redirect the lazy ``from git import Repo`` inside the plugin."""
    import sys

    import bibliogon_git_sync.handlers.git_handler as gh

    class _MockRepo:
        clone_from = staticmethod(clone_impl)

    sys.modules.setdefault("git", type(sys)("git"))
    sys.modules["git"].Repo = _MockRepo  # type: ignore[attr-defined]
    monkeypatch.setattr(gh, "Repo", _MockRepo, raising=False)


def test_plugin_git_sync_handler_is_registered_at_lifespan(
    client: TestClient,
) -> None:
    """activate() hook must land the real GitImportHandler in the
    core registry. The client fixture triggers lifespan."""
    from app.import_plugins import list_remote_handlers

    kinds = [getattr(h, "source_kind", "?") for h in list_remote_handlers()]
    assert "git" in kinds, (
        "plugin-git-sync did not register its GitImportHandler via "
        "activate(); check app.yaml enabled list or pluginforge entry-point."
    )


def test_detect_plus_execute_end_to_end_with_mocked_clone(
    client: TestClient, monkeypatch
) -> None:
    """Happy path: detect/git -> mocked clone into staging ->
    WbtImportHandler detect -> execute -> Book row with chapters.
    Covers the full orchestrator<->plugin<->handler contract."""

    def _clone(_url: str, to_path: str, **_kwargs) -> None:
        _build_wbt(Path(to_path))

    _patch_git_repo(monkeypatch, _clone)

    url = "https://github.com/astrapi69/fake-wbt-repo"
    detect = client.post("/api/import/detect/git", json={"git_url": url})
    assert detect.status_code == 200, detect.text
    body = detect.json()
    assert body["detected"]["format_name"] == "wbt-zip"
    assert body["detected"]["title"] == "End To End Book"
    assert body["duplicate"]["found"] is False
    assert body["temp_ref"].startswith("imp-")

    execute = client.post(
        "/api/import/execute",
        json={
            "temp_ref": body["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert execute.status_code == 200, execute.text
    book_id = execute.json()["book_id"]

    book = client.get(f"/api/books/{book_id}").json()
    assert book["title"] == "End To End Book"
    assert any("Introduction" in ch["title"] for ch in book["chapters"])


def test_detect_git_maps_clone_failure_to_502(
    client: TestClient, monkeypatch
) -> None:
    """Any exception from ``Repo.clone_from`` must surface as a 502
    with the exception message in ``detail``, not a 500 with a raw
    traceback. Regression guard: a generic 500 here loses the
    actionable error the user needs to fix their URL."""

    def _boom(*_args, **_kwargs):
        raise RuntimeError("remote says no")

    _patch_git_repo(monkeypatch, _boom)

    resp = client.post(
        "/api/import/detect/git",
        json={"git_url": "https://example.invalid/unreachable"},
    )
    assert resp.status_code == 502, resp.text
    assert "remote says no" in resp.json()["detail"]


def test_detect_git_rejects_empty_url(client: TestClient) -> None:
    resp = client.post("/api/import/detect/git", json={"git_url": ""})
    assert resp.status_code == 422  # pydantic min_length=1


def test_detect_git_rejects_malformed_url(
    client: TestClient, monkeypatch
) -> None:
    """can_handle() filters out inputs that are obviously not git
    URLs before we attempt a clone. Ends up as 415 (no remote
    handler recognises the input), not 502."""

    # Install a clone that WOULD succeed so the test proves the
    # can_handle gate rejected the input before we ever got there.
    def _clone_panic(*_args, **_kwargs):
        raise AssertionError("clone should never have been attempted")

    _patch_git_repo(monkeypatch, _clone_panic)

    resp = client.post(
        "/api/import/detect/git", json={"git_url": "ftp://nope/repo"}
    )
    assert resp.status_code == 415, resp.text
