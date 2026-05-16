import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Article, Book, BookTemplate, Chapter
from app.schemas import (
    BookCreate,
    BookDetail,
    BookFromArticlesBackMatter,
    BookFromArticlesCreate,
    BookFromArticlesFrontMatter,
    BookFromArticlesSortStrategy,
    BookFromTemplateCreate,
    BookOut,
    BookUpdate,
)
from app.schemas import ChapterType as ChapterTypeEnum

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


def _is_permanent_delete() -> bool:
    """Check app config for delete_permanently setting."""
    from pathlib import Path

    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
    if not config_path.exists():
        return False
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        return bool(config.get("app", {}).get("delete_permanently", False))
    except Exception:
        return False


def _allow_books_without_author() -> bool:
    """Check the advanced toggle that gates the NULL-author code path.

    Default off — keeps the historical mandatory-author UX. When the
    user enables it in Settings, the import wizard's defer option
    appears and PATCH/POST against ``books`` accept null/empty as
    'no author yet'.
    """
    from pathlib import Path

    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
    if not config_path.exists():
        return False
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        return bool(config.get("app", {}).get("allow_books_without_author", False))
    except Exception:
        return False


def _validate_author(value: str | None, allow_null: bool) -> str | None:
    """Reject NULL/blank author when the toggle is off; coerce blank
    to None when on."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if allow_null:
            return None
        raise HTTPException(
            status_code=400,
            detail=(
                "Author is required. Enable 'Allow books without author' "
                "in Settings to import/save without one."
            ),
        )
    return value.strip() if isinstance(value, str) else value


def _get_trash_auto_delete_config() -> tuple[bool, int]:
    """Get trash auto-delete settings: (enabled, days)."""
    from pathlib import Path

    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
    if not config_path.exists():
        return False, 30
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        app = config.get("app", {})
        enabled = bool(app.get("trash_auto_delete_enabled", False))
        days = int(app.get("trash_auto_delete_days", 30))
        return enabled, days
    except Exception:
        return False, 30


def cleanup_expired_trash() -> int:
    """Permanently delete books that have been in the trash longer than the configured days.

    Returns the number of deleted books.
    """
    enabled, days = _get_trash_auto_delete_config()
    if not enabled or days <= 0:
        return 0

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        cutoff = datetime.now(UTC) - timedelta(days=days)
        expired = (
            db.query(Book)
            .filter(
                Book.deleted_at.is_not(None),
                Book.deleted_at < cutoff,
            )
            .all()
        )
        count = len(expired)
        for book in expired:
            logger.info(
                "Auto-deleting book: id=%s title=%s deleted_at=%s",
                book.id,
                book.title,
                book.deleted_at,
            )
            db.delete(book)
        if count > 0:
            db.commit()
            logger.info("Auto-deleted %d expired trash items (older than %d days)", count, days)
        return count
    finally:
        db.close()


@router.get("", response_model=list[BookOut])
def list_books(db: Session = Depends(get_db)):
    """List all active (non-deleted) books."""
    return db.query(Book).filter(Book.deleted_at.is_(None)).order_by(Book.updated_at.desc()).all()


@router.post("", response_model=BookOut, status_code=status.HTTP_201_CREATED)
def create_book(payload: BookCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["author"] = _validate_author(data.get("author"), _allow_books_without_author())
    book = Book(**data)
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


@router.post(
    "/from-template",
    response_model=BookDetail,
    status_code=status.HTTP_201_CREATED,
)
def create_book_from_template(payload: BookFromTemplateCreate, db: Session = Depends(get_db)):
    """Create a new book with chapters pre-filled from a template.

    The book and all its chapters are persisted in a single commit -
    if any chapter insert fails the book insert rolls back with it.
    """
    template = db.query(BookTemplate).filter(BookTemplate.id == payload.template_id).first()
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    description = payload.description if payload.description is not None else template.description

    book = Book(
        title=payload.title,
        subtitle=payload.subtitle,
        author=payload.author,
        language=payload.language,
        genre=payload.genre if payload.genre is not None else template.genre,
        series=payload.series,
        series_index=payload.series_index,
        description=description,
    )
    db.add(book)
    db.flush()  # assign book.id for the chapter FKs

    for tpl_chapter in sorted(template.chapters, key=lambda c: c.position):
        db.add(
            Chapter(
                book_id=book.id,
                title=tpl_chapter.title,
                chapter_type=tpl_chapter.chapter_type,
                position=tpl_chapter.position,
                content=tpl_chapter.content or "",
            )
        )

    db.commit()
    db.refresh(book)
    return book


# --- Article-to-book conversion (Phase 1) ---


def _wrap_text_as_tiptap_doc(text: str | None) -> str:
    """Wrap a plain-text string as a single-paragraph TipTap JSON doc.

    Empty / None input becomes an empty content string so the user
    sees an empty editor in the Book-Editor and fills it in.
    """
    if not text:
        return ""
    return json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": text}],
                }
            ],
        }
    )


def _resolve_articles_or_422(article_ids: list[str], db: Session) -> list[Article]:
    """Load articles and validate every input id.

    All offending ids surface in a single 422 (Q10 + Q11 confirmation:
    "surface ALL offending IDs in single response, not first-found-
    first-failed"). Returned articles are ordered by the input
    ``article_ids`` so downstream sort logic can rely on a stable
    starting permutation when ``sort_strategy=manual`` reuses the
    input order.
    """
    rows = db.query(Article).filter(Article.id.in_(article_ids)).all()
    by_id: dict[str, Article] = {a.id: a for a in rows}

    not_found_ids = [aid for aid in article_ids if aid not in by_id]
    trashed = [a for a in rows if a.deleted_at is not None]
    non_article = [a for a in rows if a.content_type != "article"]

    if not_found_ids or trashed or non_article:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_articles",
                "message": "Some articles cannot be converted.",
                "not_found_ids": not_found_ids,
                "trashed": [{"id": a.id, "title": a.title} for a in trashed],
                "non_article": [
                    {
                        "id": a.id,
                        "title": a.title,
                        "content_type": a.content_type,
                    }
                    for a in non_article
                ],
            },
        )

    return [by_id[aid] for aid in article_ids]


def _validate_manual_order_or_422(
    article_ids: list[str], manual_order: list[str] | None
) -> list[str]:
    """For ``sort_strategy=manual``, ensure ``manual_order`` is a
    permutation of ``article_ids`` and return it. Raise 422 otherwise.
    """
    if manual_order is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "manual_order_required",
                "message": (
                    "sort_strategy=manual requires a manual_order list "
                    "containing every article id exactly once."
                ),
            },
        )
    if set(manual_order) != set(article_ids) or len(manual_order) != len(article_ids):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "manual_order_mismatch",
                "message": (
                    "manual_order must be a permutation of article_ids "
                    "(same set, same length, no duplicates)."
                ),
                "expected_ids": sorted(article_ids),
                "received_ids": sorted(manual_order),
            },
        )
    return manual_order


def _sort_articles(
    articles: list[Article],
    sort_strategy: BookFromArticlesSortStrategy,
    manual_order: list[str] | None,
) -> list[Article]:
    """Apply the chosen sort strategy. ``date_*`` falls back to
    ``created_at`` when ``original_published_at`` is None (native
    Bibliogon articles with no publications)."""
    if sort_strategy is BookFromArticlesSortStrategy.MANUAL:
        # manual_order is already validated as a permutation; index lookup
        # is faster than repeated .index() calls for large selections.
        order_index = {aid: i for i, aid in enumerate(manual_order or [])}
        return sorted(articles, key=lambda a: order_index[a.id])

    if sort_strategy is BookFromArticlesSortStrategy.DATE_ASC:
        return sorted(articles, key=lambda a: a.original_published_at or a.created_at)
    if sort_strategy is BookFromArticlesSortStrategy.DATE_DESC:
        return sorted(
            articles,
            key=lambda a: a.original_published_at or a.created_at,
            reverse=True,
        )
    if sort_strategy is BookFromArticlesSortStrategy.TITLE_ASC:
        return sorted(articles, key=lambda a: a.title.casefold())
    if sort_strategy is BookFromArticlesSortStrategy.TITLE_DESC:
        return sorted(articles, key=lambda a: a.title.casefold(), reverse=True)

    return articles  # pragma: no cover - exhaustive enum match


def _generate_front_matter_chapters(
    front_matter: BookFromArticlesFrontMatter | None,
    book: Book,
    start_position: int,
) -> list[Chapter]:
    """Build front-matter Chapter rows in standard publishing order:
    Title-Page -> Dedication -> Introduction.

    Title-Page has no ``*_text`` field — the user customises the
    cover/title chapter in the Book-Editor after conversion. The
    chapter title defaults to the book title when not provided.
    """
    if front_matter is None:
        return []

    chapters: list[Chapter] = []
    pos = start_position

    if front_matter.include_title_page:
        chapters.append(
            Chapter(
                book_id=book.id,
                title=front_matter.title_page_title or book.title,
                content="",
                position=pos,
                chapter_type=ChapterTypeEnum.TITLE_PAGE.value,
            )
        )
        pos += 1

    if front_matter.include_dedication:
        chapters.append(
            Chapter(
                book_id=book.id,
                title=front_matter.dedication_title or "Dedication",
                content=_wrap_text_as_tiptap_doc(front_matter.dedication_text),
                position=pos,
                chapter_type=ChapterTypeEnum.DEDICATION.value,
            )
        )
        pos += 1

    if front_matter.include_introduction:
        chapters.append(
            Chapter(
                book_id=book.id,
                title=front_matter.introduction_title or "Introduction",
                content=_wrap_text_as_tiptap_doc(front_matter.introduction_text),
                position=pos,
                chapter_type=ChapterTypeEnum.INTRODUCTION.value,
            )
        )
        pos += 1

    return chapters


def _generate_back_matter_chapters(
    back_matter: BookFromArticlesBackMatter | None,
    book: Book,
    start_position: int,
) -> list[Chapter]:
    """Build back-matter Chapter rows: Acknowledgments -> Author Bio."""
    if back_matter is None:
        return []

    chapters: list[Chapter] = []
    pos = start_position

    if back_matter.include_acknowledgments:
        chapters.append(
            Chapter(
                book_id=book.id,
                title=back_matter.acknowledgments_title or "Acknowledgments",
                content=_wrap_text_as_tiptap_doc(back_matter.acknowledgments_text),
                position=pos,
                chapter_type=ChapterTypeEnum.ACKNOWLEDGMENTS.value,
            )
        )
        pos += 1

    if back_matter.include_author_bio:
        chapters.append(
            Chapter(
                book_id=book.id,
                title=back_matter.author_bio_title or "About the Author",
                content=_wrap_text_as_tiptap_doc(back_matter.author_bio_text),
                position=pos,
                chapter_type=ChapterTypeEnum.ABOUT_AUTHOR.value,
            )
        )
        pos += 1

    return chapters


def _decode_tags_to_list(tags_json: str) -> list[str]:
    """Article.tags is a JSON-encoded Text column. Return list[str]."""
    if not tags_json:
        return []
    try:
        parsed = json.loads(tags_json)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(t) for t in parsed]


def _aggregate_keywords(explicit_keywords: list[str], articles: list[Article]) -> list[str]:
    """Build the Book.keywords list as the deduped union of the
    explicit keywords from the wizard plus every Article.tags entry.

    Order: explicit-keywords first (user intent), then article tags in
    first-seen order. Case-insensitive deduplication, original casing
    preserved.
    """
    seen: set[str] = set()
    out: list[str] = []

    for kw in list(explicit_keywords) + [
        t for article in articles for t in _decode_tags_to_list(article.tags)
    ]:
        text = kw.strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)

    return out


def _shared_series(articles: list[Article]) -> str | None:
    """Return the series shared by every article, or None if mixed."""
    series_values = {a.series for a in articles if a.series}
    if len(series_values) == 1 and len(articles) == len([a for a in articles if a.series]):
        return series_values.pop()
    return None


@router.post(
    "/from-articles",
    response_model=BookDetail,
    status_code=status.HTTP_201_CREATED,
)
def create_book_from_articles(payload: BookFromArticlesCreate, db: Session = Depends(get_db)):
    """Create a Book by copying selected Articles into Chapters.

    Article-to-book conversion (Phase 1). Original Articles are left
    untouched - the new Book holds an independent copy of each
    Article's ``content_json`` as ``Chapter.content``. Optional
    front-matter / back-matter chapters frame the article chapters.
    The whole creation is one transaction: any failure rolls the
    entire Book + Chapters insert back.

    Validation gates run before the Book is created so the user can
    fix the entire selection in one pass (Q10 + Q11 confirmation):

    - 404-ish "not found" article ids,
    - articles in the trash (``deleted_at IS NOT NULL``),
    - articles with ``content_type != "article"``,
    - ``sort_strategy=manual`` with missing / mismatched
      ``manual_order``.

    All offending ids surface in a single 422 ``detail`` payload.
    """
    author = _validate_author(payload.author, _allow_books_without_author())

    articles = _resolve_articles_or_422(payload.article_ids, db)

    manual_order = (
        _validate_manual_order_or_422(payload.article_ids, payload.manual_order)
        if payload.sort_strategy is BookFromArticlesSortStrategy.MANUAL
        else None
    )

    sorted_articles = _sort_articles(articles, payload.sort_strategy, manual_order)
    single_article = articles[0] if len(articles) == 1 else None

    book = Book(
        title=payload.title,
        # Q13: pre-fill subtitle from the single source article when the
        # wizard did not override it.
        subtitle=(
            payload.subtitle
            if payload.subtitle is not None
            else (single_article.subtitle if single_article else None)
        ),
        author=author,
        language=payload.language,
        # Series auto-fill: explicit wizard value wins; otherwise the
        # shared series across every selected article (None if mixed).
        series=payload.series if payload.series is not None else _shared_series(articles),
        series_index=payload.series_index,
        keywords=json.dumps(_aggregate_keywords(payload.keywords, articles)),
        # Q15: pre-fill cover_image from the single source article's
        # featured_image_url when the wizard did not override it.
        cover_image=(
            payload.cover_image
            if payload.cover_image is not None
            else (single_article.featured_image_url if single_article else None)
        ),
    )
    db.add(book)
    db.flush()  # assign book.id for chapter FKs

    use_article_title = payload.chapter_settings.use_article_title_as_chapter_title

    chapters: list[Chapter] = _generate_front_matter_chapters(
        payload.front_matter, book, start_position=0
    )

    article_start = len(chapters)
    for offset, article in enumerate(sorted_articles):
        chapters.append(
            Chapter(
                book_id=book.id,
                title=article.title if use_article_title else f"Chapter {offset + 1}",
                content=article.content_json or "",
                position=article_start + offset,
                chapter_type=ChapterTypeEnum.CHAPTER.value,
            )
        )

    chapters.extend(
        _generate_back_matter_chapters(payload.back_matter, book, start_position=len(chapters))
    )

    for chapter in chapters:
        db.add(chapter)

    db.commit()
    db.refresh(book)
    return book


@router.get("/{book_id}", response_model=BookDetail)
def get_book(book_id: str, include_content: bool = True, db: Session = Depends(get_db)):
    """Get a single book with its chapters.

    When include_content=false, chapter content is replaced with an empty
    string to reduce payload size for large books (100+ chapters). The
    frontend fetches individual chapter content on demand.
    """
    book = db.query(Book).options(joinedload(Book.chapters)).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if not include_content:
        # Serialize through Pydantic (handles keywords/skip_types JSON decoding),
        # then strip chapter content to reduce payload.
        result = BookDetail.model_validate(book).model_dump()
        for ch in result.get("chapters", []):
            ch["content"] = ""
        return result
    return book


_IMMUTABLE_BOOK_FIELDS = ("book_type",)


@router.patch("/{book_id}", response_model=BookOut)
def update_book(
    book_id: str,
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    # Phase-4 immutability guard. book_type is set at book creation
    # and never changes. The BookUpdate Pydantic schema deliberately
    # omits it, so Pydantic's default extra='ignore' would silently
    # drop it. A loud 400 instead so callers learn the rule rather
    # than being puzzled by missing effects.
    forbidden = [key for key in _IMMUTABLE_BOOK_FIELDS if key in payload]
    if forbidden:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Fields {forbidden} are immutable after book creation. "
                "Books cannot change book_type; create a new book of the "
                "desired type instead."
            ),
        )

    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    # The router validates the payload manually (instead of via a
    # ``payload: BookUpdate`` dependency) so the immutability guard
    # above can fire BEFORE Pydantic touches the dict. A Pydantic
    # ``ValidationError`` raised here would otherwise propagate as
    # a 500 because we are outside FastAPI's auto-422 path; translate
    # it back to a 422 so callers see the validator's message
    # (e.g. Bug 9 BISAC format errors carry the offending code).
    try:
        update = BookUpdate.model_validate(payload)
    except ValidationError as exc:
        # ``exc.errors()`` includes a ``ctx`` field referencing the
        # raw ValueError instance, which is NOT JSON-serializable.
        # ``exc.errors(include_url=False)`` still carries ctx; the
        # cleanest path is to flatten to {loc, msg, type} per error
        # which matches FastAPI's own auto-422 shape exactly.
        raise HTTPException(
            status_code=422,
            detail=[
                {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()
            ],
        ) from exc
    update_data = update.model_dump(exclude_unset=True)
    if "author" in update_data:
        update_data["author"] = _validate_author(
            update_data["author"], _allow_books_without_author()
        )
    for key, value in update_data.items():
        # ``audiobook_skip_chapter_types``, ``keywords``, ``categories``
        # and ``bisac_codes`` are exposed as list[str] in the API but
        # stored as JSON-encoded Text columns. Encode here so the rest
        # of the loop stays generic.
        if key in (
            "audiobook_skip_chapter_types",
            "keywords",
            "categories",
            "bisac_codes",
        ) and isinstance(value, list):
            value = json.dumps(value)
        setattr(book, key, value)
    db.commit()
    db.refresh(book)
    return book


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(book_id: str, db: Session = Depends(get_db)):
    """Delete a book. Moves to trash by default, permanently if configured."""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if _is_permanent_delete():
        db.delete(book)
    else:
        book.deleted_at = datetime.now(UTC)
    db.commit()


# --- Trash ---


@router.get("/trash/list", response_model=list[BookOut])
def list_trash(db: Session = Depends(get_db)):
    """List all books in the trash."""
    return (
        db.query(Book).filter(Book.deleted_at.is_not(None)).order_by(Book.deleted_at.desc()).all()
    )


@router.post("/trash/{book_id}/restore", response_model=BookOut)
def restore_book(book_id: str, db: Session = Depends(get_db)):
    """Restore a book from the trash."""
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_not(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found in trash")
    book.deleted_at = None
    db.commit()
    db.refresh(book)
    return book


@router.delete("/trash/empty", status_code=status.HTTP_204_NO_CONTENT)
def empty_trash(db: Session = Depends(get_db)):
    """Permanently delete all books in the trash."""
    db.query(Book).filter(Book.deleted_at.is_not(None)).delete()
    db.commit()


@router.delete("/trash/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def permanent_delete(book_id: str, db: Session = Depends(get_db)):
    """Permanently delete a book from the trash."""
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_not(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found in trash")
    db.delete(book)
    db.commit()
