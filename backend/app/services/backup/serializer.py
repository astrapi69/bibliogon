"""ORM <-> dict serialization for backup files.

Used by both ``backup_export`` (writing) and ``backup_import``
(reading). Books were the original payload (manifest version 1.0);
articles + publications + article-assets join in version 2.0.
"""

from datetime import datetime
from typing import Any

from app.models import Article, ArticleAsset, Book, Publication


def serialize_book_for_backup(book: Book) -> dict[str, Any]:
    """Serialize a Book ORM object to a dict for backup/export."""
    return {
        "id": book.id,
        "title": book.title,
        "subtitle": book.subtitle,
        "author": book.author,
        "language": book.language,
        "series": book.series,
        "series_index": book.series_index,
        "description": book.description,
        "genre": book.genre,
        "edition": book.edition,
        "publisher": book.publisher,
        "publisher_city": book.publisher_city,
        "publish_date": book.publish_date,
        "isbn_ebook": book.isbn_ebook,
        "isbn_paperback": book.isbn_paperback,
        "isbn_hardcover": book.isbn_hardcover,
        "asin_ebook": book.asin_ebook,
        "asin_paperback": book.asin_paperback,
        "asin_hardcover": book.asin_hardcover,
        "keywords": book.keywords,
        "html_description": book.html_description,
        "backpage_description": book.backpage_description,
        "backpage_author_bio": book.backpage_author_bio,
        "cover_image": book.cover_image,
        "custom_css": book.custom_css,
        "ai_assisted": book.ai_assisted,
        "tts_engine": book.tts_engine,
        "tts_voice": book.tts_voice,
        "tts_language": book.tts_language,
        "tts_speed": book.tts_speed,
        "audiobook_merge": book.audiobook_merge,
        "audiobook_filename": book.audiobook_filename,
        "audiobook_overwrite_existing": book.audiobook_overwrite_existing,
        "audiobook_skip_chapter_types": book.audiobook_skip_chapter_types,
        "ms_tools_max_sentence_length": book.ms_tools_max_sentence_length,
        "ms_tools_repetition_window": book.ms_tools_repetition_window,
        "ms_tools_max_filler_ratio": book.ms_tools_max_filler_ratio,
        "created_at": book.created_at.isoformat(),
        "updated_at": book.updated_at.isoformat(),
    }


def serialize_article_for_backup(article: Article) -> dict[str, Any]:
    """Serialize an Article ORM object to a dict for backup/export.

    Includes ``deleted_at`` so trashed articles round-trip with their
    soft-delete status; mirrors how ``serialize_book_for_backup``
    handles the books trash.
    """
    return {
        "id": article.id,
        "title": article.title,
        "subtitle": article.subtitle,
        "author": article.author,
        "language": article.language,
        "content_type": article.content_type,
        "content_json": article.content_json,
        "status": article.status,
        "canonical_url": article.canonical_url,
        "featured_image_url": article.featured_image_url,
        "excerpt": article.excerpt,
        "tags": article.tags,
        "topic": article.topic,
        "seo_title": article.seo_title,
        "seo_description": article.seo_description,
        "ai_tokens_used": article.ai_tokens_used or 0,
        "deleted_at": article.deleted_at.isoformat() if article.deleted_at else None,
        "created_at": article.created_at.isoformat() if article.created_at else None,
        "updated_at": article.updated_at.isoformat() if article.updated_at else None,
    }


def restore_article_from_data(article_data: dict[str, Any]) -> Article:
    """Create an Article ORM object from backup data dict.

    ``deleted_at`` round-trips so restoring a backup taken with
    items in the trash preserves their trashed state.
    """
    deleted_raw = article_data.get("deleted_at")
    deleted_at = (
        datetime.fromisoformat(deleted_raw)
        if isinstance(deleted_raw, str) and deleted_raw
        else None
    )
    return Article(
        id=article_data["id"],
        title=article_data["title"],
        subtitle=article_data.get("subtitle"),
        author=article_data.get("author"),
        language=article_data.get("language", "en"),
        content_type=article_data.get("content_type", "article"),
        content_json=article_data.get("content_json", ""),
        status=article_data.get("status", "draft"),
        canonical_url=article_data.get("canonical_url"),
        featured_image_url=article_data.get("featured_image_url"),
        excerpt=article_data.get("excerpt"),
        tags=article_data.get("tags", "[]"),
        topic=article_data.get("topic"),
        seo_title=article_data.get("seo_title"),
        seo_description=article_data.get("seo_description"),
        ai_tokens_used=article_data.get("ai_tokens_used", 0),
        deleted_at=deleted_at,
    )


def serialize_publication_for_backup(pub: Publication) -> dict[str, Any]:
    """Serialize a Publication ORM object to a dict for backup."""
    return {
        "id": pub.id,
        "article_id": pub.article_id,
        "platform": pub.platform,
        "is_promo": pub.is_promo,
        "status": pub.status,
        "platform_metadata": pub.platform_metadata,
        "content_snapshot_at_publish": pub.content_snapshot_at_publish,
        "scheduled_at": pub.scheduled_at.isoformat() if pub.scheduled_at else None,
        "published_at": pub.published_at.isoformat() if pub.published_at else None,
        "last_verified_at": pub.last_verified_at.isoformat() if pub.last_verified_at else None,
        "notes": pub.notes,
        "created_at": pub.created_at.isoformat() if pub.created_at else None,
        "updated_at": pub.updated_at.isoformat() if pub.updated_at else None,
    }


def restore_publication_from_data(pub_data: dict[str, Any]) -> Publication:
    """Create a Publication ORM object from backup data dict."""

    def _dt(value: Any) -> datetime | None:
        return datetime.fromisoformat(value) if isinstance(value, str) and value else None

    return Publication(
        id=pub_data["id"],
        article_id=pub_data["article_id"],
        platform=pub_data["platform"],
        is_promo=pub_data.get("is_promo", False),
        status=pub_data.get("status", "planned"),
        platform_metadata=pub_data.get("platform_metadata", "{}"),
        content_snapshot_at_publish=pub_data.get("content_snapshot_at_publish"),
        scheduled_at=_dt(pub_data.get("scheduled_at")),
        published_at=_dt(pub_data.get("published_at")),
        last_verified_at=_dt(pub_data.get("last_verified_at")),
        notes=pub_data.get("notes"),
    )


def serialize_article_asset_for_backup(asset: ArticleAsset) -> dict[str, Any]:
    """Serialize an ArticleAsset ORM object to a dict for backup.

    The ``path`` field is intentionally exported even though restore
    will regenerate it; keeping it in the manifest helps debugging
    and matches the books-side ``Asset`` shape.
    """
    return {
        "id": asset.id,
        "article_id": asset.article_id,
        "filename": asset.filename,
        "asset_type": asset.asset_type,
        "path": asset.path,
    }


def restore_book_from_data(book_data: dict[str, Any]) -> Book:
    """Create a Book ORM object from backup data dict."""
    return Book(
        id=book_data["id"],
        title=book_data["title"],
        subtitle=book_data.get("subtitle"),
        author=book_data["author"],
        language=book_data.get("language", "de"),
        series=book_data.get("series"),
        series_index=book_data.get("series_index"),
        description=book_data.get("description"),
        genre=book_data.get("genre"),
        edition=book_data.get("edition"),
        publisher=book_data.get("publisher"),
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
        audiobook_overwrite_existing=book_data.get("audiobook_overwrite_existing", False),
        audiobook_skip_chapter_types=book_data.get("audiobook_skip_chapter_types"),
        ms_tools_max_sentence_length=book_data.get("ms_tools_max_sentence_length"),
        ms_tools_repetition_window=book_data.get("ms_tools_repetition_window"),
        ms_tools_max_filler_ratio=book_data.get("ms_tools_max_filler_ratio"),
    )
