"""Regression tests for the three backup/import 500 paths fixed in
issue #9 smoke-failure triage.

Each test covers a specific user flow the Playwright smoke suite
exercises:

1. Soft-deleted books are restored (not silently skipped) on backup
   import.
2. Batch export survives manuscripta's output/ cleanup between
   formats (was FileNotFoundError on zf.write).
3. smart-import handles Pandoc-style multi-document metadata.yaml
   (was yaml.ComposerError).
"""

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Fix 1: import revives soft-deleted books
# ---------------------------------------------------------------------------


def test_backup_import_revives_soft_deleted_book(client, tmp_path, monkeypatch):
    """Soft-delete then import must restore the book (not skip as
    'already exists'). Regression for smoke/backup-roundtrip.spec.ts:23.
    """
    monkeypatch.chdir(tmp_path)

    # Create a book and export a backup.
    book = client.post("/api/books", json={"title": "Alpha", "author": "A"}).json()
    book_id = book["id"]
    client.post(f"/api/books/{book_id}/chapters", json={"title": "Ch", "content": "{}"})

    backup = client.get("/api/backup/export")
    assert backup.status_code == 200
    backup_bytes = backup.content

    # Soft-delete (moves to trash, not purge).
    client.delete(f"/api/books/{book_id}")
    assert len(client.get("/api/books").json()) == 0

    # Import the backup.
    resp = client.post(
        "/api/backup/import",
        files={"file": ("bk.bgb", backup_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 200
    assert resp.json()["imported_books"] == 1

    # Book is back with its original id and title.
    books = client.get("/api/books").json()
    assert len(books) == 1
    assert books[0]["id"] == book_id
    assert books[0]["title"] == "Alpha"


def test_backup_import_skips_live_book_idempotent(client, tmp_path, monkeypatch):
    """When the same backup is imported twice against a live DB, the
    second import is a no-op (idempotent)."""
    monkeypatch.chdir(tmp_path)

    client.post("/api/books", json={"title": "Live", "author": "A"})
    backup = client.get("/api/backup/export").content

    # First import: book already present, skip.
    resp = client.post(
        "/api/backup/import",
        files={"file": ("bk.bgb", backup, "application/octet-stream")},
    )
    assert resp.status_code == 200
    assert resp.json()["imported_books"] == 0
    assert len(client.get("/api/books").json()) == 1


def test_backup_import_merges_with_existing_non_empty_db(client, tmp_path, monkeypatch):
    """Existing + soft-deleted-then-imported coexist after restore.
    Regression for smoke/backup-roundtrip.spec.ts:139.
    """
    monkeypatch.chdir(tmp_path)

    # Existing, stays live.
    client.post("/api/books", json={"title": "Existing", "author": "A"})
    # Second, gets backed up + soft-deleted + restored.
    to_backup = client.post("/api/books", json={"title": "Backed Up", "author": "B"}).json()
    client.post(
        f"/api/books/{to_backup['id']}/chapters",
        json={"title": "Ch", "content": "{}"},
    )

    backup = client.get("/api/backup/export").content
    client.delete(f"/api/books/{to_backup['id']}")
    assert len(client.get("/api/books").json()) == 1

    resp = client.post(
        "/api/backup/import",
        files={"file": ("bk.bgb", backup, "application/octet-stream")},
    )
    assert resp.status_code == 200

    titles = sorted(b["title"] for b in client.get("/api/books").json())
    assert titles == ["Backed Up", "Existing"]


# ---------------------------------------------------------------------------
# Fix 3: smart-import handles Pandoc-style multi-doc metadata.yaml
# ---------------------------------------------------------------------------


def test_read_metadata_yaml_handles_pandoc_delimiters(tmp_path):
    """Regression for smoke/import-flows.spec.ts:67. The exporter writes
    metadata.yaml wrapped in --- / --- markers (Pandoc style); the
    importer must treat that as one document, not error out."""
    from app.services.backup.project_import import _read_metadata_yaml

    path = tmp_path / "metadata.yaml"
    path.write_text(
        "---\n"
        "title: ExportTest\n"
        "author: A\n"
        "lang: de\n"
        "---\n",
        encoding="utf-8",
    )

    result = _read_metadata_yaml(path)
    assert result["title"] == "ExportTest"
    assert result["author"] == "A"
    assert result["lang"] == "de"


def test_read_metadata_yaml_bare_document(tmp_path):
    """Non-delimited metadata.yaml still parses as before."""
    from app.services.backup.project_import import _read_metadata_yaml

    path = tmp_path / "metadata.yaml"
    path.write_text("title: Plain\nauthor: P\n", encoding="utf-8")
    assert _read_metadata_yaml(path)["title"] == "Plain"


def test_read_metadata_yaml_empty_file(tmp_path):
    from app.services.backup.project_import import _read_metadata_yaml

    path = tmp_path / "metadata.yaml"
    path.write_text("", encoding="utf-8")
    assert _read_metadata_yaml(path) == {}


def test_read_metadata_yaml_missing_file(tmp_path):
    from app.services.backup.project_import import _read_metadata_yaml

    assert _read_metadata_yaml(tmp_path / "does-not-exist.yaml") == {}


def test_smart_import_roundtrips_project_with_pandoc_metadata(
    client, tmp_path, monkeypatch
):
    """Export a project ZIP, then smart-import it back. Regression
    against the ComposerError crash on metadata.yaml."""
    monkeypatch.chdir(tmp_path)

    book = client.post("/api/books", json={"title": "Roundtrip", "author": "R"}).json()
    book_id = book["id"]
    client.post(f"/api/books/{book_id}/chapters", json={"title": "Ch", "content": "{}"})

    project = client.get(f"/api/books/{book_id}/export/project")
    assert project.status_code == 200

    # CIO-05: legacy smart-import replaced by orchestrator detect +
    # execute. The exported project lands through the WBT handler
    # which runs the same metadata parser - the regression pin
    # (pandoc-style --- markers in metadata.yaml) is preserved.
    import io

    from tests.import_helpers import import_wbt_zip

    result = import_wbt_zip(
        client, io.BytesIO(project.content), filename="proj.zip"
    )
    assert result["book_id"]


# ---------------------------------------------------------------------------
# Fix 2: batch export survives manuscripta's output/ cleanup
# ---------------------------------------------------------------------------
#
# This sits in plugins/bibliogon-plugin-export/tests/ but is added here
# as an API-level check that exercises the full route. Pandoc is
# required on the test host; the test is skipped otherwise.


def _pandoc_available() -> bool:
    import shutil

    return shutil.which("pandoc") is not None


@pytest.mark.skipif(not _pandoc_available(), reason="pandoc not installed")
def test_batch_export_produces_multi_format_zip(client, tmp_path, monkeypatch):
    """Regression for smoke/export-download.spec.ts:81 (FileNotFoundError
    on zf.write because manuscripta's run_export wipes output/ between
    formats). The fix stashes each format into a stable dir."""
    monkeypatch.chdir(tmp_path)

    book = client.post("/api/books", json={"title": "Batch", "author": "A"}).json()
    client.post(
        f"/api/books/{book['id']}/chapters", json={"title": "Ch", "content": "{}"}
    )

    resp = client.get(f"/api/books/{book['id']}/export/batch")
    assert resp.status_code == 200

    # The response body should be a valid zip containing >1 files.
    zbuf = io.BytesIO(resp.content)
    with zipfile.ZipFile(zbuf) as zf:
        names = zf.namelist()
    assert len(names) >= 2
    # At least EPUB + one other format survives into the final ZIP.
    assert any(n.endswith(".epub") for n in names)
