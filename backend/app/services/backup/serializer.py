"""Book ORM <-> dict serialization for backup files.

Used by both ``backup_export`` (writing) and ``backup_import`` (reading).
"""

from typing import Any

from app.models import Book


def serialize_book_for_backup(book: Book) -> dict[str, Any]:
    """Serialize a Book ORM object to a dict for backup/export."""
    return {
        "id": book.id, "title": book.title, "subtitle": book.subtitle,
        "author": book.author, "language": book.language,
        "series": book.series, "series_index": book.series_index,
        "description": book.description, "genre": book.genre,
        "edition": book.edition, "publisher": book.publisher,
        "publisher_city": book.publisher_city, "publish_date": book.publish_date,
        "isbn_ebook": book.isbn_ebook, "isbn_paperback": book.isbn_paperback,
        "isbn_hardcover": book.isbn_hardcover,
        "asin_ebook": book.asin_ebook, "asin_paperback": book.asin_paperback,
        "asin_hardcover": book.asin_hardcover,
        "keywords": book.keywords, "html_description": book.html_description,
        "backpage_description": book.backpage_description,
        "backpage_author_bio": book.backpage_author_bio,
        "cover_image": book.cover_image, "custom_css": book.custom_css,
        "ai_assisted": book.ai_assisted,
        "tts_engine": book.tts_engine, "tts_voice": book.tts_voice,
        "tts_language": book.tts_language, "tts_speed": book.tts_speed,
        "audiobook_merge": book.audiobook_merge,
        "audiobook_filename": book.audiobook_filename,
        "ms_tools_max_sentence_length": book.ms_tools_max_sentence_length,
        "ms_tools_repetition_window": book.ms_tools_repetition_window,
        "ms_tools_max_filler_ratio": book.ms_tools_max_filler_ratio,
        "created_at": book.created_at.isoformat(),
        "updated_at": book.updated_at.isoformat(),
    }


def restore_book_from_data(book_data: dict[str, Any]) -> Book:
    """Create a Book ORM object from backup data dict."""
    return Book(
        id=book_data["id"], title=book_data["title"],
        subtitle=book_data.get("subtitle"), author=book_data["author"],
        language=book_data.get("language", "de"),
        series=book_data.get("series"), series_index=book_data.get("series_index"),
        description=book_data.get("description"), genre=book_data.get("genre"),
        edition=book_data.get("edition"), publisher=book_data.get("publisher"),
        publisher_city=book_data.get("publisher_city"),
        publish_date=book_data.get("publish_date"),
        isbn_ebook=book_data.get("isbn_ebook"),
        isbn_paperback=book_data.get("isbn_paperback"),
        isbn_hardcover=book_data.get("isbn_hardcover"),
        asin_ebook=book_data.get("asin_ebook"),
        asin_paperback=book_data.get("asin_paperback"),
        asin_hardcover=book_data.get("asin_hardcover"),
        keywords=book_data.get("keywords"),
        html_description=book_data.get("html_description"),
        backpage_description=book_data.get("backpage_description"),
        backpage_author_bio=book_data.get("backpage_author_bio"),
        cover_image=book_data.get("cover_image"),
        custom_css=book_data.get("custom_css"),
        ai_assisted=book_data.get("ai_assisted", False),
        tts_engine=book_data.get("tts_engine"),
        tts_voice=book_data.get("tts_voice"),
        tts_language=book_data.get("tts_language"),
        tts_speed=book_data.get("tts_speed"),
        audiobook_merge=book_data.get("audiobook_merge"),
        audiobook_filename=book_data.get("audiobook_filename"),
        ms_tools_max_sentence_length=book_data.get("ms_tools_max_sentence_length"),
        ms_tools_repetition_window=book_data.get("ms_tools_repetition_window"),
        ms_tools_max_filler_ratio=book_data.get("ms_tools_max_filler_ratio"),
    )
