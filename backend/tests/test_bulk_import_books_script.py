"""Unit tests for scripts/bulk_import_books.py.

The script is the stage-1 bulk book importer (#758): it reads a YAML
catalog of manuscript-repo URLs, diffs it against the running backend
via POST /api/import/detect/git (server-side duplicate check), and
imports only the missing books via POST /api/import/execute.

Tests follow the sync_versions convention: scripts/ is added to
sys.path and the helpers are exercised directly with an injected
transport callable, so no HTTP server and no git clone is needed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import bulk_import_books as bib  # noqa: E402


def write_catalog(tmp_path: Path, content: str) -> Path:
    catalog_path = tmp_path / "book-catalog.yaml"
    catalog_path.write_text(content, encoding="utf-8")
    return catalog_path


class TestLoadCatalog:
    def test_plain_url_entries(self, tmp_path: Path) -> None:
        catalog_path = write_catalog(
            tmp_path,
            "books:\n"
            "  - https://github.com/astrapi69/book-one\n"
            "  - https://github.com/astrapi69/book-two\n",
        )
        entries = bib.load_catalog(catalog_path)
        assert [entry.repo_url for entry in entries] == [
            "https://github.com/astrapi69/book-one",
            "https://github.com/astrapi69/book-two",
        ]
        assert all(entry.git_adoption == "adopt_with_remote" for entry in entries)

    def test_mapping_entries_with_adoption_override(self, tmp_path: Path) -> None:
        catalog_path = write_catalog(
            tmp_path,
            "books:\n"
            "  - repo_url: https://github.com/astrapi69/book-one\n"
            "    git_adoption: start_fresh\n",
        )
        entries = bib.load_catalog(catalog_path)
        assert entries[0].repo_url == "https://github.com/astrapi69/book-one"
        assert entries[0].git_adoption == "start_fresh"

    def test_rejects_entry_without_repo_url(self, tmp_path: Path) -> None:
        catalog_path = write_catalog(tmp_path, "books:\n  - git_adoption: start_fresh\n")
        with pytest.raises(bib.CatalogError, match="repo_url"):
            bib.load_catalog(catalog_path)

    def test_rejects_unknown_adoption_mode(self, tmp_path: Path) -> None:
        catalog_path = write_catalog(
            tmp_path,
            "books:\n"
            "  - repo_url: https://github.com/astrapi69/book-one\n"
            "    git_adoption: bogus_mode\n",
        )
        with pytest.raises(bib.CatalogError, match="git_adoption"):
            bib.load_catalog(catalog_path)

    def test_rejects_duplicate_urls(self, tmp_path: Path) -> None:
        catalog_path = write_catalog(
            tmp_path,
            "books:\n"
            "  - https://github.com/astrapi69/book-one\n"
            "  - https://github.com/astrapi69/book-one\n",
        )
        with pytest.raises(bib.CatalogError, match="[Dd]uplicate"):
            bib.load_catalog(catalog_path)

    def test_rejects_empty_catalog(self, tmp_path: Path) -> None:
        catalog_path = write_catalog(tmp_path, "books: []\n")
        with pytest.raises(bib.CatalogError, match="empty"):
            bib.load_catalog(catalog_path)


class FakeTransport:
    """Records every POST and answers from a scripted per-URL plan.

    The plan maps a repo URL to a dict with the detect response
    (``duplicate_found`` + optional ids) or an exception to raise.
    Execute calls answer with a created book id derived from the
    temp_ref handed out by the matching detect call.
    """

    def __init__(self, plan: dict[str, dict]) -> None:
        self.plan = plan
        self.calls: list[tuple[str, dict]] = []
        self._temp_counter = 0

    def __call__(self, endpoint: str, payload: dict) -> dict:
        self.calls.append((endpoint, payload))
        if endpoint.endswith("/import/detect/git"):
            scripted = self.plan[payload["git_url"]]
            if "raises" in scripted:
                raise scripted["raises"]
            self._temp_counter += 1
            temp_ref = f"imp-{self._temp_counter}"
            scripted["temp_ref"] = temp_ref
            duplicate = {"found": scripted.get("duplicate_found", False)}
            if duplicate["found"]:
                duplicate["existing_book_id"] = scripted.get("existing_book_id", "b-existing")
                duplicate["existing_book_title"] = scripted.get(
                    "existing_book_title", "Existing Book"
                )
            detected = {
                "title": "T",
                "git_repo": {"present": scripted.get("git_repo_present", True)},
            }
            return {"detected": detected, "duplicate": duplicate, "temp_ref": temp_ref}
        if endpoint.endswith("/import/execute"):
            if payload["duplicate_action"] == "cancel":
                return {"book_id": None, "status": "cancelled", "imported_book_ids": []}
            return {
                "book_id": f"book-for-{payload['temp_ref']}",
                "status": "created",
                "imported_book_ids": [f"book-for-{payload['temp_ref']}"],
            }
        raise AssertionError(f"Unexpected endpoint: {endpoint}")


BASE_URL = "http://localhost:8000/api"


class TestRunBulkImport:
    def test_imports_missing_book(self) -> None:
        url = "https://github.com/astrapi69/book-one"
        transport = FakeTransport({url: {"duplicate_found": False}})
        outcomes = bib.run_bulk_import(
            [bib.CatalogEntry(repo_url=url)],
            base_url=BASE_URL,
            dry_run=False,
            post=transport,
        )
        assert outcomes[0].status == "imported"
        assert outcomes[0].book_id == "book-for-imp-1"
        execute_calls = [payload for endpoint, payload in transport.calls if "execute" in endpoint]
        assert execute_calls[0]["duplicate_action"] == "create"
        assert execute_calls[0]["git_adoption"] == "adopt_with_remote"

    def test_skips_present_book_via_cancel(self) -> None:
        url = "https://github.com/astrapi69/book-one"
        transport = FakeTransport(
            {url: {"duplicate_found": True, "existing_book_title": "Book One"}}
        )
        outcomes = bib.run_bulk_import(
            [bib.CatalogEntry(repo_url=url)],
            base_url=BASE_URL,
            dry_run=False,
            post=transport,
        )
        assert outcomes[0].status == "present"
        assert "Book One" in outcomes[0].detail
        execute_calls = [payload for endpoint, payload in transport.calls if "execute" in endpoint]
        assert len(execute_calls) == 1
        assert execute_calls[0]["duplicate_action"] == "cancel"

    def test_dry_run_reports_would_import_and_never_creates(self) -> None:
        url = "https://github.com/astrapi69/book-one"
        transport = FakeTransport({url: {"duplicate_found": False}})
        outcomes = bib.run_bulk_import(
            [bib.CatalogEntry(repo_url=url)],
            base_url=BASE_URL,
            dry_run=True,
            post=transport,
        )
        assert outcomes[0].status == "would_import"
        execute_calls = [payload for endpoint, payload in transport.calls if "execute" in endpoint]
        assert [payload["duplicate_action"] for payload in execute_calls] == ["cancel"]

    def test_adoption_omitted_when_clone_has_no_git_repo(self) -> None:
        """execute rejects git_adoption=adopt_* with 400 when the
        detected source has no .git/; the script must degrade to
        start_fresh (omit the field) instead of failing the import."""
        url = "https://github.com/astrapi69/book-one"
        transport = FakeTransport({url: {"duplicate_found": False, "git_repo_present": False}})
        outcomes = bib.run_bulk_import(
            [bib.CatalogEntry(repo_url=url)],
            base_url=BASE_URL,
            dry_run=False,
            post=transport,
        )
        assert outcomes[0].status == "imported"
        execute_calls = [payload for endpoint, payload in transport.calls if "execute" in endpoint]
        assert "git_adoption" not in execute_calls[0]

    def test_error_on_one_repo_does_not_stop_the_rest(self) -> None:
        broken = "https://github.com/astrapi69/broken"
        healthy = "https://github.com/astrapi69/healthy"
        transport = FakeTransport(
            {
                broken: {"raises": bib.TransportError(502, "Clone failed: no such repo")},
                healthy: {"duplicate_found": False},
            }
        )
        outcomes = bib.run_bulk_import(
            [bib.CatalogEntry(repo_url=broken), bib.CatalogEntry(repo_url=healthy)],
            base_url=BASE_URL,
            dry_run=False,
            post=transport,
        )
        assert outcomes[0].status == "error"
        assert "Clone failed" in outcomes[0].detail
        assert outcomes[1].status == "imported"


def _build_wbt(project_root: Path, *, title: str) -> None:
    """Minimal write-book-template fixture (same shape as
    test_import_git_endpoint.py; duplicated because tests/ is not an
    importable package)."""
    (project_root / "config").mkdir(parents=True)
    (project_root / "manuscript" / "chapters").mkdir(parents=True)
    (project_root / "config" / "metadata.yaml").write_text(
        f"title: {title}\nauthor: Bulk Importer\nlang: en\n",
        encoding="utf-8",
    )
    (project_root / "manuscript" / "chapters" / "01-intro.md").write_text(
        "# Introduction\n\nFrom a cloned repo.\n", encoding="utf-8"
    )


def _patch_git_repo(monkeypatch: pytest.MonkeyPatch, clone_impl) -> None:
    """Redirect the lazy ``from git import Repo`` inside plugin-git-sync
    so the clone step materialises a local fixture (same mechanism as
    test_import_git_endpoint.py)."""
    import bibliogon_git_sync.handlers.git_handler as git_handler_module

    class _MockRepo:
        clone_from = staticmethod(clone_impl)

    sys.modules.setdefault("git", type(sys)("git"))
    monkeypatch.setattr(sys.modules["git"], "Repo", _MockRepo, raising=False)
    monkeypatch.setattr(git_handler_module, "Repo", _MockRepo, raising=False)


class TestAgainstRealOrchestrator:
    """Wire the script's run loop to the real orchestrator endpoints
    via TestClient (mocked clone, per test_import_git_endpoint.py),
    so the transport contract the unit tests fake is verified against
    the actual API: first run imports, second run reports present."""

    @pytest.fixture()
    def client(self):
        from fastapi.testclient import TestClient

        from app.main import app

        with TestClient(app) as test_client:
            yield test_client

    @staticmethod
    def _client_post(client) -> bib.PostCallable:
        def post(endpoint: str, payload: dict) -> dict:
            response = client.post(endpoint, json=payload)
            if response.status_code >= 400:
                raise bib.TransportError(response.status_code, response.text)
            return response.json()

        return post

    def test_check_and_fill_cycle(self, client, monkeypatch, tmp_path: Path) -> None:
        def _clone(_url: str, to_path: str, **_kwargs) -> None:
            _build_wbt(Path(to_path), title="Bulk Cycle Book")

        _patch_git_repo(monkeypatch, _clone)
        entry = bib.CatalogEntry(
            repo_url="https://github.com/astrapi69/bulk-cycle-book",
            git_adoption="start_fresh",
        )
        post = self._client_post(client)

        first_run = bib.run_bulk_import([entry], base_url="/api", dry_run=False, post=post)
        assert first_run[0].status == "imported", first_run[0].detail
        assert first_run[0].book_id

        second_run = bib.run_bulk_import([entry], base_url="/api", dry_run=False, post=post)
        assert second_run[0].status == "present", second_run[0].detail
        assert "Bulk Cycle Book" in second_run[0].detail

        book_listing = client.get("/api/books").json()
        matching = [book for book in book_listing if book["title"] == "Bulk Cycle Book"]
        assert len(matching) == 1

    def test_dry_run_creates_nothing(self, client, monkeypatch, tmp_path: Path) -> None:
        def _clone(_url: str, to_path: str, **_kwargs) -> None:
            _build_wbt(Path(to_path), title="Dry Run Book")

        _patch_git_repo(monkeypatch, _clone)
        entry = bib.CatalogEntry(repo_url="https://github.com/astrapi69/dry-run-book")
        post = self._client_post(client)

        outcomes = bib.run_bulk_import([entry], base_url="/api", dry_run=True, post=post)
        assert outcomes[0].status == "would_import", outcomes[0].detail

        book_listing = client.get("/api/books").json()
        assert not [book for book in book_listing if book["title"] == "Dry Run Book"]


class TestReport:
    def test_render_report_counts_and_exit_code(self) -> None:
        outcomes = [
            bib.RepoOutcome(repo_url="u1", status="imported", book_id="b1"),
            bib.RepoOutcome(repo_url="u2", status="present", detail="Book Two"),
            bib.RepoOutcome(repo_url="u3", status="error", detail="Clone failed"),
            bib.RepoOutcome(repo_url="u4", status="would_import"),
        ]
        report = bib.render_report(outcomes)
        assert "imported: 1" in report
        assert "present: 1" in report
        assert "would import: 1" in report
        assert "errors: 1" in report
        assert "u3" in report
        assert bib.exit_code(outcomes) == 1
        assert bib.exit_code([outcome for outcome in outcomes if outcome.status != "error"]) == 0
