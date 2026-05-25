"""Tests for Book.repository_url (BOOK-REPOSITORY-URL-FIELD-01).

Covers:
- BookUpdate accepts the field on PATCH
- BookOut serialises the field (None default for pre-migration rows)
- PATCH round-trip: server stores in String(2000), GET reads it back
- Field is nullable; omitting it on PATCH leaves the stored value alone
- Long URL (close to 2000 char cap) round-trips cleanly
- Distinct from GitSyncMapping.repo_url (orthogonal storage; see
  BookMetadataEditor for the read-precedence rule)
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import BookOut, BookUpdate

client = TestClient(app)


def _make_book() -> str:
    resp = client.post(
        "/api/books", json={"title": "Repo URL Test Book", "author": "Aster"}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# --- Pydantic-level ---


def test_book_update_accepts_repository_url() -> None:
    p = BookUpdate(repository_url="https://github.com/astrapi69/my-book.git")
    assert p.repository_url == "https://github.com/astrapi69/my-book.git"


def test_book_update_repository_url_optional() -> None:
    p = BookUpdate()
    assert p.repository_url is None


def test_book_update_repository_url_accepts_none() -> None:
    """Explicit None clears the field on PATCH (vs unset → leave alone)."""
    p = BookUpdate(repository_url=None)
    dumped = p.model_dump(exclude_unset=True)
    assert "repository_url" in dumped
    assert dumped["repository_url"] is None


def test_book_out_serialises_repository_url_default_none() -> None:
    """ORM rows missing the column (pre-migration) serialise as None."""

    class _FakeBook:
        id = "x" * 32
        title = "T"
        subtitle = None
        author = None
        language = "de"
        series = None
        series_index = None
        description = None
        book_idea = None
        expose = None
        book_type = "prose"
        edition = None
        publisher = None
        publisher_city = None
        publish_date = None
        isbn_ebook = None
        isbn_paperback = None
        isbn_hardcover = None
        asin_ebook = None
        asin_paperback = None
        asin_hardcover = None
        keywords = None
        categories = None
        bisac_codes = None
        html_description = None
        backpage_description = None
        backpage_author_bio = None
        cover_image = None
        custom_css = None
        repository_url = None
        cover_image_prompt = None
        chapter_summaries = "[]"
        ai_assisted = False
        ai_tokens_used = 0
        tts_engine = None
        tts_voice = None
        tts_language = None
        tts_speed = None
        audiobook_merge = None
        audiobook_filename = None
        audiobook_overwrite_existing = False
        audiobook_skip_chapter_types = None
        ms_tools_max_sentence_length = None
        ms_tools_repetition_window = None
        ms_tools_max_filler_ratio = None
        from datetime import datetime

        created_at = datetime(2026, 1, 1)
        updated_at = datetime(2026, 1, 1)

    serialised = BookOut.model_validate(_FakeBook())
    assert serialised.repository_url is None


# --- Endpoint round-trip ---


def test_patch_repository_url_round_trips() -> None:
    book_id = _make_book()
    url = "https://github.com/astrapi69/sample-book.git"
    resp = client.patch(f"/api/books/{book_id}", json={"repository_url": url})
    assert resp.status_code == 200, resp.text
    assert resp.json()["repository_url"] == url

    # GET reads the same value back
    resp = client.get(f"/api/books/{book_id}")
    assert resp.status_code == 200
    assert resp.json()["repository_url"] == url


def test_patch_repository_url_clears_to_null() -> None:
    book_id = _make_book()
    client.patch(
        f"/api/books/{book_id}",
        json={"repository_url": "https://example.com/repo.git"},
    )
    # Now clear it
    resp = client.patch(f"/api/books/{book_id}", json={"repository_url": None})
    assert resp.status_code == 200
    assert resp.json()["repository_url"] is None


def test_patch_omitting_repository_url_leaves_value_intact() -> None:
    book_id = _make_book()
    url = "https://gitlab.com/user/book.git"
    client.patch(f"/api/books/{book_id}", json={"repository_url": url})

    # PATCH a different field; repository_url should be untouched
    resp = client.patch(f"/api/books/{book_id}", json={"subtitle": "New Subtitle"})
    assert resp.status_code == 200
    assert resp.json()["repository_url"] == url
    assert resp.json()["subtitle"] == "New Subtitle"


def test_patch_repository_url_accepts_long_value() -> None:
    """Storage cap is String(2000); long URL with query params + fragment."""
    book_id = _make_book()
    # Build a ~1800-char URL (well within the 2000 cap)
    long_url = "https://example.com/repo.git?" + "&".join(
        f"q{i}=value{i}" for i in range(140)
    )
    assert 1500 < len(long_url) < 2000
    resp = client.patch(f"/api/books/{book_id}", json={"repository_url": long_url})
    assert resp.status_code == 200
    assert resp.json()["repository_url"] == long_url


def test_book_create_omits_repository_url() -> None:
    """``repository_url`` is not on BookCreate — it's optional and
    edit-only. New books start with NULL; the field is set later
    through the metadata editor."""
    book_id = _make_book()
    resp = client.get(f"/api/books/{book_id}")
    assert resp.status_code == 200
    assert resp.json()["repository_url"] is None
