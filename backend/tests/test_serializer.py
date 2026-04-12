"""Tests for backup serializer (Book ORM <-> dict conversion)."""

from datetime import datetime, timezone

from app.models import Book
from app.services.backup.serializer import restore_book_from_data, serialize_book_for_backup

import pytest


def _make_book(**overrides) -> Book:
    """Create a Book ORM object with sensible defaults for testing."""
    now = datetime(2025, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
    defaults = {
        "id": "abc123",
        "title": "Test Book",
        "author": "Test Author",
        "language": "en",
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return Book(**defaults)


def _full_book_data() -> dict:
    """Return a dict with every field populated, as serialize would produce."""
    return {
        "id": "full123",
        "title": "Full Book",
        "subtitle": "A Subtitle",
        "author": "Full Author",
        "language": "en",
        "series": "Epic Series",
        "series_index": 3,
        "description": "A full description.",
        "genre": "Fantasy",
        "edition": "2nd",
        "publisher": "Big Publisher",
        "publisher_city": "Berlin",
        "publish_date": "2025-01-01",
        "isbn_ebook": "978-0-1234-5678-0",
        "isbn_paperback": "978-0-1234-5678-1",
        "isbn_hardcover": "978-0-1234-5678-2",
        "asin_ebook": "B00TEST1234",
        "asin_paperback": "B00TEST5678",
        "asin_hardcover": "B00TEST9012",
        "keywords": '["fantasy", "epic"]',
        "html_description": "<p>HTML desc</p>",
        "backpage_description": "Backpage text",
        "backpage_author_bio": "Author bio",
        "cover_image": "covers/cover.jpg",
        "custom_css": "body { font-size: 14px; }",
        "ai_assisted": True,
        "tts_engine": "edge-tts",
        "tts_voice": "de-DE-ConradNeural",
        "tts_language": "de",
        "tts_speed": "1.0",
        "audiobook_merge": "merged",
        "audiobook_filename": "full-book-audio",
        "audiobook_overwrite_existing": True,
        "audiobook_skip_chapter_types": '["toc", "imprint"]',
        "ms_tools_max_sentence_length": 25,
        "ms_tools_repetition_window": 200,
        "ms_tools_max_filler_ratio": 0.05,
        "created_at": "2025-06-15T12:00:00+00:00",
        "updated_at": "2025-06-15T12:00:00+00:00",
    }


# --- serialize ---


def test_serialize_all_fields_present():
    """Serialized dict contains every expected key with correct values."""
    book = _make_book(
        subtitle="Sub",
        series="Series",
        series_index=1,
        description="Desc",
        genre="Sci-Fi",
        edition="1st",
        publisher="Pub",
        publisher_city="Munich",
        publish_date="2025-01-01",
        isbn_ebook="978-0-0000-0000-0",
        isbn_paperback="978-0-0000-0000-1",
        isbn_hardcover="978-0-0000-0000-2",
        asin_ebook="B00ASIN1",
        asin_paperback="B00ASIN2",
        asin_hardcover="B00ASIN3",
        keywords='["kw1"]',
        html_description="<p>html</p>",
        backpage_description="bp desc",
        backpage_author_bio="bp bio",
        cover_image="cover.jpg",
        custom_css="p {}",
        ai_assisted=True,
        tts_engine="edge-tts",
        tts_voice="de-DE-ConradNeural",
        tts_language="de",
        tts_speed="1.0",
        audiobook_merge="merged",
        audiobook_filename="my-audio",
        audiobook_overwrite_existing=True,
        audiobook_skip_chapter_types='["toc"]',
        ms_tools_max_sentence_length=25,
        ms_tools_repetition_window=200,
        ms_tools_max_filler_ratio=0.05,
    )

    result = serialize_book_for_backup(book)

    assert result["id"] == "abc123"
    assert result["title"] == "Test Book"
    assert result["subtitle"] == "Sub"
    assert result["author"] == "Test Author"
    assert result["language"] == "en"
    assert result["series"] == "Series"
    assert result["series_index"] == 1
    assert result["genre"] == "Sci-Fi"
    assert result["isbn_ebook"] == "978-0-0000-0000-0"
    assert result["asin_ebook"] == "B00ASIN1"
    assert result["keywords"] == '["kw1"]'
    assert result["ai_assisted"] is True
    assert result["tts_engine"] == "edge-tts"
    assert result["audiobook_merge"] == "merged"
    assert result["audiobook_overwrite_existing"] is True
    assert result["ms_tools_max_sentence_length"] == 25
    assert result["ms_tools_max_filler_ratio"] == 0.05
    # 39 keys total (all model fields minus deleted_at, chapters, assets, relationships)
    assert len(result) == 39


def test_serialize_timestamps_are_iso_strings():
    """created_at and updated_at are serialized as ISO 8601 strings."""
    now = datetime(2025, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
    book = _make_book(created_at=now, updated_at=now)

    result = serialize_book_for_backup(book)

    assert result["created_at"] == "2025-06-15T12:00:00+00:00"
    assert result["updated_at"] == "2025-06-15T12:00:00+00:00"
    assert isinstance(result["created_at"], str)
    assert isinstance(result["updated_at"], str)


def test_serialize_does_not_include_deleted_at():
    """Soft-delete timestamp is intentionally excluded from backups."""
    deleted = datetime(2025, 7, 1, 0, 0, 0, tzinfo=timezone.utc)
    book = _make_book(deleted_at=deleted)

    result = serialize_book_for_backup(book)

    assert "deleted_at" not in result


def test_serialize_none_optional_fields():
    """Optional fields that are None appear as None in the dict, not as missing keys."""
    book = _make_book()

    result = serialize_book_for_backup(book)

    assert result["subtitle"] is None
    assert result["series"] is None
    assert result["genre"] is None
    assert result["isbn_ebook"] is None
    assert result["tts_engine"] is None
    assert result["audiobook_merge"] is None
    assert result["ms_tools_max_sentence_length"] is None
    # Key must be present even when value is None
    assert "subtitle" in result
    assert "tts_engine" in result


# --- restore ---


def test_roundtrip_full_book():
    """Serialize -> restore preserves all data fields except timestamps."""
    now = datetime(2025, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
    original = _make_book(
        subtitle="Sub",
        series="Series",
        series_index=2,
        description="Desc",
        genre="Thriller",
        edition="3rd",
        publisher="Pub",
        publisher_city="Vienna",
        publish_date="2025-03-01",
        isbn_ebook="978-1",
        isbn_paperback="978-2",
        isbn_hardcover="978-3",
        asin_ebook="B001",
        asin_paperback="B002",
        asin_hardcover="B003",
        keywords='["suspense"]',
        html_description="<b>bold</b>",
        backpage_description="back desc",
        backpage_author_bio="bio",
        cover_image="cover.png",
        custom_css=".ch {}",
        ai_assisted=True,
        tts_engine="google-tts",
        tts_voice="en-US-Standard-A",
        tts_language="en",
        tts_speed="0.75",
        audiobook_merge="both",
        audiobook_filename="thriller-audio",
        audiobook_overwrite_existing=True,
        audiobook_skip_chapter_types='["imprint"]',
        ms_tools_max_sentence_length=30,
        ms_tools_repetition_window=150,
        ms_tools_max_filler_ratio=0.03,
    )

    serialized = serialize_book_for_backup(original)
    restored = restore_book_from_data(serialized)

    # Data fields must match
    assert restored.id == original.id
    assert restored.title == original.title
    assert restored.subtitle == original.subtitle
    assert restored.author == original.author
    assert restored.language == original.language
    assert restored.series == original.series
    assert restored.series_index == original.series_index
    assert restored.description == original.description
    assert restored.genre == original.genre
    assert restored.edition == original.edition
    assert restored.publisher == original.publisher
    assert restored.isbn_ebook == original.isbn_ebook
    assert restored.asin_ebook == original.asin_ebook
    assert restored.keywords == original.keywords
    assert restored.ai_assisted == original.ai_assisted
    assert restored.tts_engine == original.tts_engine
    assert restored.tts_voice == original.tts_voice
    assert restored.audiobook_merge == original.audiobook_merge
    assert restored.audiobook_overwrite_existing == original.audiobook_overwrite_existing
    assert restored.audiobook_skip_chapter_types == original.audiobook_skip_chapter_types
    assert restored.ms_tools_max_sentence_length == original.ms_tools_max_sentence_length
    assert restored.ms_tools_max_filler_ratio == original.ms_tools_max_filler_ratio

    # Timestamps are NOT preserved (restore creates fresh ORM defaults)
    assert restored.created_at != now


def test_restore_minimal_data():
    """Restore with only required fields succeeds with correct defaults."""
    minimal = {"id": "min1", "title": "Minimal", "author": "A"}

    book = restore_book_from_data(minimal)

    assert book.id == "min1"
    assert book.title == "Minimal"
    assert book.author == "A"
    assert book.language == "de"  # default
    assert book.ai_assisted is False  # default
    assert book.audiobook_overwrite_existing is False  # default
    assert book.subtitle is None
    assert book.series is None
    assert book.tts_engine is None
    assert book.audiobook_merge is None
    assert book.ms_tools_max_sentence_length is None


@pytest.mark.parametrize("missing_field", ["id", "title", "author"])
def test_restore_missing_required_field_raises(missing_field: str):
    """Missing required fields (id, title, author) raise KeyError."""
    data = {"id": "x", "title": "T", "author": "A"}
    del data[missing_field]

    with pytest.raises(KeyError, match=missing_field):
        restore_book_from_data(data)


def test_restore_legacy_backup_without_audiobook_fields():
    """Older backups without audiobook/ms-tools fields restore cleanly."""
    legacy_data = {
        "id": "legacy1",
        "title": "Old Book",
        "author": "Old Author",
        "language": "en",
        "subtitle": None,
        "series": None,
        "series_index": None,
        "description": "An old book.",
        "genre": "History",
        # No tts_*, audiobook_*, ms_tools_* fields at all
    }

    book = restore_book_from_data(legacy_data)

    assert book.id == "legacy1"
    assert book.title == "Old Book"
    assert book.language == "en"
    assert book.genre == "History"
    # All newer fields default to None or False
    assert book.tts_engine is None
    assert book.tts_voice is None
    assert book.tts_language is None
    assert book.tts_speed is None
    assert book.audiobook_merge is None
    assert book.audiobook_filename is None
    assert book.audiobook_overwrite_existing is False
    assert book.audiobook_skip_chapter_types is None
    assert book.ms_tools_max_sentence_length is None
    assert book.ms_tools_repetition_window is None
    assert book.ms_tools_max_filler_ratio is None
    assert book.ai_assisted is False
