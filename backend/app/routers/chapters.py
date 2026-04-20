import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Chapter, ChapterVersion
from app.schemas import (
    ChapterCreate,
    ChapterOut,
    ChapterReorder,
    ChapterUpdate,
    ChapterVersionRead,
    ChapterVersionSummary,
)

# Retention: keep at most the last N snapshots per chapter. Further
# history is only available via .bgb backups.
VERSION_RETENTION = 20

router = APIRouter(prefix="/books/{book_id}/chapters", tags=["chapters"])


def _get_book_or_404(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.get("", response_model=list[ChapterOut])
def list_chapters(book_id: str, db: Session = Depends(get_db)):
    _get_book_or_404(book_id, db)
    return db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.position).all()


@router.post("", response_model=ChapterOut, status_code=status.HTTP_201_CREATED)
def create_chapter(book_id: str, payload: ChapterCreate, db: Session = Depends(get_db)):
    _get_book_or_404(book_id, db)

    if payload.position is None:
        max_pos = (
            db.query(Chapter.position)
            .filter(Chapter.book_id == book_id)
            .order_by(Chapter.position.desc())
            .first()
        )
        payload.position = (max_pos[0] + 1) if max_pos else 0

    chapter = Chapter(book_id=book_id, **payload.model_dump())
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.get("/{chapter_id}", response_model=ChapterOut)
def get_chapter(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.book_id == book_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


@router.patch("/{chapter_id}", response_model=ChapterOut)
def update_chapter(
    book_id: str, chapter_id: str, payload: ChapterUpdate, db: Session = Depends(get_db)
):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.book_id == book_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    # Optimistic lock: reject if the client's expected version does not
    # match the server. The 409 payload includes the current server
    # state so the frontend can offer a conflict resolution dialog.
    if chapter.version != payload.version:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "version_conflict",
                "message": (
                    f"Chapter was updated elsewhere "
                    f"(expected v{payload.version}, server has v{chapter.version})"
                ),
                "current_version": chapter.version,
                "server_content": chapter.content,
                "server_title": chapter.title,
                "server_updated_at": chapter.updated_at.isoformat(),
            },
        )
    # Snapshot the PRE-update state into chapter_versions so restore
    # can bring back what the user had before this change.
    snapshot = ChapterVersion(
        chapter_id=chapter.id,
        content=chapter.content,
        title=chapter.title,
        version=chapter.version,
    )
    db.add(snapshot)

    updates = payload.model_dump(exclude_unset=True, exclude={"version"})
    for key, value in updates.items():
        setattr(chapter, key, value)
    chapter.version += 1
    db.commit()
    db.refresh(chapter)

    # Retention: keep only the last N versions per chapter. Done after
    # the commit above so the snapshot we just wrote is never a candidate
    # for deletion.
    db.execute(
        text(
            "DELETE FROM chapter_versions "
            "WHERE chapter_id = :cid AND id NOT IN ("
            "  SELECT id FROM chapter_versions "
            "  WHERE chapter_id = :cid "
            "  ORDER BY created_at DESC, version DESC "
            "  LIMIT :keep"
            ")"
        ),
        {"cid": chapter.id, "keep": VERSION_RETENTION},
    )
    db.commit()

    return chapter


# --- Version history endpoints ---


@router.get("/{chapter_id}/versions", response_model=list[ChapterVersionSummary])
def list_chapter_versions(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    """Return version metadata (no content) for a chapter, newest first."""
    _get_book_or_404(book_id, db)
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.book_id == book_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return (
        db.query(ChapterVersion)
        .filter(ChapterVersion.chapter_id == chapter_id)
        .order_by(ChapterVersion.version.desc())
        .all()
    )


@router.get(
    "/{chapter_id}/versions/{version_id}",
    response_model=ChapterVersionRead,
)
def get_chapter_version(
    book_id: str, chapter_id: str, version_id: str, db: Session = Depends(get_db)
):
    _get_book_or_404(book_id, db)
    version = (
        db.query(ChapterVersion)
        .join(Chapter, ChapterVersion.chapter_id == Chapter.id)
        .filter(
            ChapterVersion.id == version_id,
            ChapterVersion.chapter_id == chapter_id,
            Chapter.book_id == book_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post(
    "/{chapter_id}/versions/{version_id}/restore",
    response_model=ChapterOut,
)
def restore_chapter_version(
    book_id: str, chapter_id: str, version_id: str, db: Session = Depends(get_db)
):
    """Restore a chapter's content and title from a historic version.

    Snapshots the current state first (just like a normal PATCH), then
    overwrites content + title with the version's values and bumps
    the chapter version counter.
    """
    _get_book_or_404(book_id, db)
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.book_id == book_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    version = (
        db.query(ChapterVersion)
        .filter(
            ChapterVersion.id == version_id,
            ChapterVersion.chapter_id == chapter_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Snapshot current state before overwriting, same as the PATCH path.
    snapshot = ChapterVersion(
        chapter_id=chapter.id,
        content=chapter.content,
        title=chapter.title,
        version=chapter.version,
    )
    db.add(snapshot)

    chapter.content = version.content
    chapter.title = version.title
    chapter.version += 1
    db.commit()
    db.refresh(chapter)

    # Retention trim (same query as PATCH).
    db.execute(
        text(
            "DELETE FROM chapter_versions "
            "WHERE chapter_id = :cid AND id NOT IN ("
            "  SELECT id FROM chapter_versions "
            "  WHERE chapter_id = :cid "
            "  ORDER BY created_at DESC, version DESC "
            "  LIMIT :keep"
            ")"
        ),
        {"cid": chapter.id, "keep": VERSION_RETENTION},
    )
    db.commit()

    return chapter


@router.delete("/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.book_id == book_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    # Cascade: delete AI review files linked to this chapter's slug. The
    # reviews directory is best-effort; a missing dir or unreadable file
    # never blocks the chapter deletion.
    from app.ai.review_store import delete_reviews_for_chapter, slugify

    chapter_slug = slugify(chapter.title or chapter_id)
    delete_reviews_for_chapter(book_id, chapter_slug)

    db.delete(chapter)
    db.commit()


@router.put("/reorder", response_model=list[ChapterOut])
def reorder_chapters(book_id: str, payload: ChapterReorder, db: Session = Depends(get_db)):
    _get_book_or_404(book_id, db)
    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).all()
    chapter_map = {c.id: c for c in chapters}

    for position, chapter_id in enumerate(payload.chapter_ids):
        if chapter_id not in chapter_map:
            raise HTTPException(
                status_code=400, detail=f"Chapter {chapter_id} not found in this book"
            )
        chapter_map[chapter_id].position = position

    db.commit()
    return db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.position).all()


# Common alternative anchors for special chapter types (write-book-template
# convention). Used by _collect_chapter_anchors below.
_TYPE_ANCHORS: dict[str, list[str]] = {
    "about_author": ["about-the-author"],
    "next_in_series": ["next-in-series", "next-in-the-series", "other-publications"],
    "bibliography": ["bibliography", "further-reading"],
    "acknowledgments": ["acknowledgments"],
    "glossary": ["glossary", "glossary-of-key-terms", "glossary-of-key-concepts"],
    "epilogue": ["epilogue"],
    "imprint": ["imprint"],
    "toc": ["table-of-contents", "toc"],
    "preface": ["preface", "introduction"],
    "foreword": ["foreword"],
}


@router.post("/validate-toc")
def validate_toc(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Validate TOC links against actual chapter titles.

    Finds all anchor links in TOC chapters and checks if they match
    chapter titles or explicit anchors in the book.
    """
    _get_book_or_404(book_id, db)
    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.position).all()

    toc_chapters = [c for c in chapters if c.chapter_type == "toc"]
    if not toc_chapters:
        return {
            "valid": True,
            "toc_found": False,
            "links": [],
            "broken": [],
            "message": "Kein Inhaltsverzeichnis gefunden.",
        }

    valid_anchors = _collect_valid_anchors(chapters)
    all_links, broken = _check_toc_links(toc_chapters, valid_anchors)

    return {
        "valid": len(broken) == 0,
        "toc_found": True,
        "total_links": len(all_links),
        "broken_count": len(broken),
        "links": all_links,
        "broken": broken,
        "valid_anchors": sorted(valid_anchors),
    }


# --- validate_toc step helpers ---


def _collect_valid_anchors(chapters: list[Chapter]) -> set[str]:
    """Build the set of all anchors a TOC link is allowed to point at."""
    anchors: set[str] = set()
    for ch in chapters:
        if ch.chapter_type == "toc":
            continue
        _collect_chapter_anchors(ch, anchors)
    return anchors


def _collect_chapter_anchors(ch: Chapter, anchors: set[str]) -> None:
    """Add every anchor that one chapter contributes (title, headings, ids)."""
    _add_title_anchors(ch.title, anchors)
    for alt in _TYPE_ANCHORS.get(ch.chapter_type, []):
        anchors.add(alt)
    _add_heading_anchors(ch.content, anchors)
    _add_explicit_id_anchors(ch.content, anchors)


def _add_title_anchors(title: str, anchors: set[str]) -> None:
    """Anchors derived from the chapter title (GitHub + Pandoc slug + explicit)."""
    anchors.add(_slugify(title))
    # Pandoc removes apostrophes entirely instead of replacing with hyphen
    anchors.add(_slugify(title.replace("'", "").replace("\u2019", "")))
    explicit = re.search(r"\{#([\w-]+)\}", title)
    if explicit:
        anchors.add(explicit.group(1))


def _add_heading_anchors(content: str, anchors: set[str]) -> None:
    """Anchors derived from markdown ``# ...`` and HTML ``<h*>`` headings."""
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#"):
            heading_text = re.sub(r"^#+\s*", "", stripped)
            _add_slug_variants(heading_text, anchors)
        for hmatch in re.finditer(r"<h[1-6][^>]*>([^<]+)</h[1-6]>", stripped):
            _add_slug_variants(hmatch.group(1), anchors)


def _add_explicit_id_anchors(content: str, anchors: set[str]) -> None:
    """Anchors from ``{#my-anchor}`` markers and HTML ``id="..."`` attributes."""
    for match in re.finditer(r"\{#([\w-]+)\}", content):
        anchors.add(match.group(1))
    for match in re.finditer(r'id="([\w-]+)"', content):
        anchors.add(match.group(1))


def _check_toc_links(
    toc_chapters: list[Chapter],
    valid_anchors: set[str],
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Extract every link from each TOC chapter; return ``(all, broken)``."""
    all_links: list[dict[str, str]] = []
    broken: list[dict[str, str]] = []
    for toc_ch in toc_chapters:
        for link in _iter_toc_links(toc_ch):
            all_links.append(link)
            if link["anchor"] not in valid_anchors:
                broken.append(link)
    return all_links, broken


def _iter_toc_links(toc_ch: Chapter):
    """Yield ``{text, anchor, toc_chapter_id}`` for every link in one TOC chapter."""
    content = toc_ch.content
    for match in re.finditer(r"\[([^\]]+)\]\(#([\w-]+)\)", content):
        yield {"text": match.group(1), "anchor": match.group(2), "toc_chapter_id": toc_ch.id}
    for match in re.finditer(r'<a\s+href="#([\w-]+)"[^>]*>([^<]+)</a>', content):
        yield {"text": match.group(2), "anchor": match.group(1), "toc_chapter_id": toc_ch.id}


def _add_slug_variants(text: str, anchors: set[str]) -> None:
    """Add both GitHub and Pandoc style slug variants."""
    slug = _slugify(text)
    if slug:
        anchors.add(slug)
    # Pandoc removes apostrophes entirely
    cleaned = text.replace("'", "").replace("\u2019", "")
    if cleaned != text:
        slug2 = _slugify(cleaned)
        if slug2:
            anchors.add(slug2)


def _slugify(text: str) -> str:
    """Convert text to a URL-friendly anchor slug (GitHub-style).

    Handles Unicode, HTML entities, em-dashes, and apostrophes.
    """
    import html
    import unicodedata

    # Decode HTML entities: &amp; -> &, &#39; -> '
    text = html.unescape(text)
    # Remove explicit anchor markers {#...}
    text = re.sub(r"\s*\{#[\w-]+\}", "", text)
    # Replace em-dash and en-dash with hyphen
    text = text.replace("\u2014", "-").replace("\u2013", "-")
    # Replace apostrophes and quotes with hyphen (GitHub-style: We've -> we-ve)
    text = re.sub(r"['\u2018\u2019\u201c\u201d]", "-", text)
    # Normalize Unicode (NFD), strip combining marks for transliteration
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    # Lowercase, replace spaces/special chars with hyphens
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)  # collapse multiple hyphens
    slug = slug.strip("-")
    return slug
