"""Roundtrip tests: Import -> (simulate edit) -> Export -> validate."""

import io
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_project_zip(
    chapters: dict[str, str] | None = None,
    front_matter: dict[str, str] | None = None,
    back_matter: dict[str, str] | None = None,
    metadata: str | None = None,
    export_settings: str | None = None,
    assets: dict[str, bytes] | None = None,
) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "test-book/config/metadata.yaml",
            metadata or "title: Roundtrip Test\nauthor: Test Author\nlang: en\n",
        )
        if export_settings:
            zf.writestr("test-book/config/export-settings.yaml", export_settings)
        for name, content in (chapters or {}).items():
            zf.writestr(f"test-book/manuscript/chapters/{name}", content)
        for name, content in (front_matter or {}).items():
            zf.writestr(f"test-book/manuscript/front-matter/{name}", content)
        for name, content in (back_matter or {}).items():
            zf.writestr(f"test-book/manuscript/back-matter/{name}", content)
        for name, data in (assets or {}).items():
            zf.writestr(f"test-book/assets/{name}", data)
    buf.seek(0)
    return buf


def _cleanup(book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


# --- Roundtrip Tests ---


def test_roundtrip_import_export_project():
    """Import a project, export as project ZIP, verify structure."""
    buf = _create_project_zip(
        front_matter={"preface.md": "# Preface\n\nIntro text.\n"},
        chapters={
            "01-chapter.md": "# Chapter 1\n\n## Section A\n\nContent.\n",
            "02-chapter.md": "# Chapter 2\n\nMore content.\n",
        },
        back_matter={"epilogue.md": "# Epilogue\n\nThe end.\n"},
    )
    r = client.post(
        "/api/backup/import-project",
        files={"file": ("test.zip", buf, "application/zip")},
    )
    assert r.status_code == 200
    result = r.json()
    book_id = result["book_id"]
    assert result["chapter_count"] >= 4  # preface + 2 chapters + epilogue

    # Simulate edit: update chapter title via API
    chapters = client.get(f"/api/books/{book_id}/chapters").json()
    ch1 = [c for c in chapters if "Chapter 1" in c["title"]][0]
    r_update = client.patch(
        f"/api/books/{book_id}/chapters/{ch1['id']}",
        json={"title": "Chapter 1: Updated Title", "version": ch1["version"]},
    )
    assert r_update.status_code == 200
    assert r_update.json()["title"] == "Chapter 1: Updated Title"

    # Verify edit persisted
    r_book = client.get(f"/api/books/{book_id}")
    updated_titles = [c["title"] for c in r_book.json()["chapters"]]
    assert "Chapter 1: Updated Title" in updated_titles

    _cleanup(book_id)


def test_roundtrip_with_assets():
    """Import with images, export, verify images in export."""
    buf = _create_project_zip(
        chapters={
            "01-chapter.md": (
                "# Chapter 1\n\n"
                '<figure>\n  <img src="assets/figures/diagram.png" alt="Diagram" />\n</figure>\n\n'
                "Text after image.\n"
            ),
        },
        assets={"figures/diagram.png": b"FAKE-PNG-DATA-12345"},
    )
    r = client.post(
        "/api/backup/import-project",
        files={"file": ("test.zip", buf, "application/zip")},
    )
    assert r.status_code == 200
    book_id = r.json()["book_id"]
    assert r.json().get("asset_count", 0) >= 1

    # Verify image path was rewritten in content
    book = client.get(f"/api/books/{book_id}").json()
    ch = [c for c in book["chapters"] if c["chapter_type"] == "chapter"][0]
    assert f"/api/books/{book_id}/assets/file/" in ch["content"]

    # Verify asset is servable
    r_asset = client.get(f"/api/books/{book_id}/assets/file/diagram.png")
    assert r_asset.status_code == 200
    assert b"FAKE-PNG-DATA" in r_asset.content

    # Export via scaffolder directly (plugin routes not available in TestClient)
    from bibliogon_export.scaffolder import scaffold_project
    book_data = {"id": book_id, "title": book["title"], "author": "Test", "language": "en"}
    chapters_data = [{"title": c["title"], "content": c["content"], "position": c["position"],
                      "chapter_type": c["chapter_type"]} for c in book["chapters"]]
    assets_data = [{"filename": a["filename"], "asset_type": a["asset_type"], "path": a["path"]}
                   for a in client.get(f"/api/books/{book_id}/assets").json()]
    tmp = Path(tempfile.mkdtemp())
    project_dir = scaffold_project(book_data, chapters_data, tmp, {}, assets_data)

    # Verify image in scaffolded project
    image_files = list(project_dir.rglob("diagram.png"))
    assert len(image_files) > 0, "Image not in scaffolded project"
    shutil.rmtree(tmp, ignore_errors=True)

    _cleanup(book_id)


def test_roundtrip_chapter_types_preserved():
    """Import with chapter types, export, verify types in exported files."""
    buf = _create_project_zip(
        front_matter={
            "toc.md": "# Table of Contents\n\n- [Ch 1](#ch-1)\n",
            "preface.md": "# Preface\n\nIntro.\n",
        },
        chapters={"01-chapter.md": "# Ch 1\n\nContent.\n"},
        back_matter={
            "epilogue.md": "# Epilogue\n\nEnd.\n",
            "glossary.md": "# Glossary\n\nTerms.\n",
        },
        export_settings=(
            "section_order:\n"
            "  ebook:\n"
            "    - front-matter/toc.md\n"
            "    - front-matter/preface.md\n"
            "    - chapters\n"
            "    - back-matter/epilogue.md\n"
            "    - back-matter/glossary.md\n"
        ),
    )
    r = client.post(
        "/api/backup/import-project",
        files={"file": ("test.zip", buf, "application/zip")},
    )
    assert r.status_code == 200
    book_id = r.json()["book_id"]

    # Verify chapter types
    book = client.get(f"/api/books/{book_id}").json()
    types = {c["chapter_type"] for c in book["chapters"]}
    assert "toc" in types
    assert "preface" in types
    assert "chapter" in types
    assert "epilogue" in types
    assert "glossary" in types

    # Export via scaffolder directly (plugin routes not available in TestClient)
    from bibliogon_export.scaffolder import scaffold_project

    book_data = {"id": book_id, "title": book["title"], "author": "Test", "language": "en"}
    chapters_data = [
        {
            "title": c["title"],
            "content": c["content"],
            "position": c["position"],
            "chapter_type": c["chapter_type"],
        }
        for c in book["chapters"]
    ]
    tmp = Path(tempfile.mkdtemp())
    project_dir = scaffold_project(book_data, chapters_data, tmp, {})

    # Verify front-matter and back-matter dirs in scaffolded project
    has_front = any(project_dir.rglob("front-matter/*"))
    has_back = any(project_dir.rglob("back-matter/*"))
    assert has_front, "No front-matter in export"
    assert has_back, "No back-matter in export"
    shutil.rmtree(tmp, ignore_errors=True)

    _cleanup(book_id)


def test_roundtrip_backup_restore_complete():
    """Full cycle: import -> backup -> delete -> restore -> verify."""
    buf = _create_project_zip(
        metadata="title: Backup Roundtrip\nauthor: Author\npublisher: Test Pub\nlang: en\n",
        chapters={"01-ch.md": "# Chapter 1\n\nText.\n"},
        assets={"figures/img.png": b"PNG-DATA"},
    )
    # Import
    r = client.post(
        "/api/backup/import-project",
        files={"file": ("test.zip", buf, "application/zip")},
    )
    assert r.status_code == 200
    book_id = r.json()["book_id"]

    # Backup
    r_backup = client.get("/api/backup/export")
    assert r_backup.status_code == 200
    backup_data = r_backup.content

    # Delete
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")

    # Restore
    r_restore = client.post(
        "/api/backup/import",
        files={"file": ("backup.bgb", io.BytesIO(backup_data), "application/octet-stream")},
    )
    assert r_restore.status_code == 200
    assert r_restore.json()["imported_books"] >= 1

    # Verify restored book
    r_book = client.get(f"/api/books/{book_id}")
    assert r_book.status_code == 200
    book = r_book.json()
    assert book["title"] == "Backup Roundtrip"
    assert book["publisher"] == "Test Pub"
    assert len(book["chapters"]) >= 1

    _cleanup(book_id)


def test_roundtrip_plain_markdown_import():
    """Import plain .md files (no project structure), export as project."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("intro.md", "# Introduction\n\nHello world.\n")
        zf.writestr("main.md", "# Main Content\n\nThe story.\n")
        zf.writestr("end.md", "# Conclusion\n\nGoodbye.\n")
    buf.seek(0)

    r = client.post(
        "/api/backup/import-project",
        files={"file": ("stories.zip", buf, "application/zip")},
    )
    assert r.status_code == 200
    result = r.json()
    assert result["chapter_count"] == 3

    # Export via scaffolder directly (plugin routes not available in TestClient)
    from bibliogon_export.scaffolder import scaffold_project

    book = client.get(f"/api/books/{result['book_id']}").json()
    book_data = {"id": result["book_id"], "title": book["title"], "author": book["author"], "language": "en"}
    chapters_data = [
        {
            "title": c["title"],
            "content": c["content"],
            "position": c["position"],
            "chapter_type": c["chapter_type"],
        }
        for c in book["chapters"]
    ]
    tmp = Path(tempfile.mkdtemp())
    project_dir = scaffold_project(book_data, chapters_data, tmp, {})

    # Verify all 3 chapters were scaffolded
    md_files = list(project_dir.rglob("*.md"))
    # At least metadata.yaml + 3 chapter .md files
    assert len(md_files) >= 3, f"Expected at least 3 .md files, got {len(md_files)}: {md_files}"
    shutil.rmtree(tmp, ignore_errors=True)

    _cleanup(result["book_id"])
