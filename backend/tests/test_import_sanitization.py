"""Tests for M-12: auto-sanitization during import via content_pre_import hook."""

from fastapi.testclient import TestClient

from app.main import app
from app.services.backup.markdown_utils import sanitize_import_markdown


def _cleanup(client: TestClient, book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def test_sanitize_import_markdown_strips_invisible_chars():
    """The helper calls the plugin hook and strips NBSP/ZWSP."""
    with TestClient(app) as client:  # noqa: F841 - triggers lifespan
        dirty = "Hallo\u00a0Welt\u200b!"
        result = sanitize_import_markdown(dirty, "de")
        assert "\u00a0" not in result
        assert "\u200b" not in result
        assert "Hallo" in result and "Welt" in result


def test_sanitize_import_markdown_passthrough_when_clean():
    """Clean content passes through unchanged."""
    with TestClient(app):
        clean = "# Titel\n\nEin sauberer Absatz."
        assert sanitize_import_markdown(clean, "de") == clean


def test_sanitize_import_markdown_handles_empty():
    assert sanitize_import_markdown("", "de") == ""


def test_import_single_markdown_sanitizes_content():
    """Uploading a .md with invisible chars should produce a clean chapter."""
    from tests.import_helpers import import_single_markdown

    with TestClient(app) as client:
        dirty = "# Kapitel\n\nDies\u00a0ist\u200b ein Test."
        book_id = import_single_markdown(client, dirty, filename="chapter.md")["book_id"]
        try:
            chapters = client.get(f"/api/books/{book_id}/chapters").json()
            assert chapters
            content = chapters[0]["content"]
            assert "\u00a0" not in content
            assert "\u200b" not in content
            assert "Test" in content
        finally:
            _cleanup(client, book_id)


def test_import_markdown_folder_sanitizes_all_chapters():
    """Each .md in a folder upload is sanitized (CIO-05: markdown-ZIP
    path replaced by folder-upload flow). The orchestrator's
    markdown-folder handler stages files preserving relative paths."""
    from tests.import_helpers import import_markdown_folder

    with TestClient(app) as client:
        files = [
            ("project/ch1.md", "# Eins\n\nA\u00a0B".encode("utf-8")),
            ("project/ch2.md", "# Zwei\n\nC\u200bD".encode("utf-8")),
        ]
        book_id = import_markdown_folder(client, files)["book_id"]
        try:
            chapters = client.get(f"/api/books/{book_id}/chapters").json()
            assert len(chapters) == 2
            for ch in chapters:
                assert "\u00a0" not in ch["content"]
                assert "\u200b" not in ch["content"]
        finally:
            _cleanup(client, book_id)
