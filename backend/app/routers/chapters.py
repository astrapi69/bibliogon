import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Chapter
from app.schemas import ChapterCreate, ChapterOut, ChapterReorder, ChapterUpdate

router = APIRouter(prefix="/books/{book_id}/chapters", tags=["chapters"])


def _get_book_or_404(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.get("", response_model=list[ChapterOut])
def list_chapters(book_id: str, db: Session = Depends(get_db)):
    _get_book_or_404(book_id, db)
    return (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.position)
        .all()
    )


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
    chapter = (
        db.query(Chapter)
        .filter(Chapter.id == chapter_id, Chapter.book_id == book_id)
        .first()
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


@router.patch("/{chapter_id}", response_model=ChapterOut)
def update_chapter(
        book_id: str, chapter_id: str, payload: ChapterUpdate, db: Session = Depends(get_db)
):
    chapter = (
        db.query(Chapter)
        .filter(Chapter.id == chapter_id, Chapter.book_id == book_id)
        .first()
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(chapter, key, value)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.delete("/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    chapter = (
        db.query(Chapter)
        .filter(Chapter.id == chapter_id, Chapter.book_id == book_id)
        .first()
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    db.delete(chapter)
    db.commit()


@router.put("/reorder", response_model=list[ChapterOut])
def reorder_chapters(
        book_id: str, payload: ChapterReorder, db: Session = Depends(get_db)
):
    _get_book_or_404(book_id, db)
    chapters = (
        db.query(Chapter).filter(Chapter.book_id == book_id).all()
    )
    chapter_map = {c.id: c for c in chapters}

    for position, chapter_id in enumerate(payload.chapter_ids):
        if chapter_id not in chapter_map:
            raise HTTPException(
                status_code=400, detail=f"Chapter {chapter_id} not found in this book"
            )
        chapter_map[chapter_id].position = position

    db.commit()
    return (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.position)
        .all()
    )


@router.post("/validate-toc")
def validate_toc(book_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Validate TOC links against actual chapter titles.

    Finds all anchor links in TOC chapters and checks if they match
    chapter titles or explicit anchors in the book.
    """
    _get_book_or_404(book_id, db)
    chapters = (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.position)
        .all()
    )

    # Find TOC chapters
    toc_chapters = [c for c in chapters if c.chapter_type == "toc"]
    if not toc_chapters:
        return {"valid": True, "toc_found": False, "links": [], "broken": [], "message": "Kein Inhaltsverzeichnis gefunden."}

    # Build set of valid anchors from all non-TOC chapters
    valid_anchors: set[str] = set()
    for ch in chapters:
        if ch.chapter_type == "toc":
            continue
        # Generate anchor from title - both GitHub and Pandoc style
        slug = _slugify(ch.title)
        valid_anchors.add(slug)
        # Pandoc removes apostrophes entirely instead of replacing with hyphen
        slug_pandoc = _slugify(ch.title.replace("'", "").replace("\u2019", ""))
        valid_anchors.add(slug_pandoc)
        # Also check for explicit anchors like {#my-anchor} in title
        explicit = re.search(r"\{#([\w-]+)\}", ch.title)
        if explicit:
            valid_anchors.add(explicit.group(1))
        # Add common alternative anchors for special chapter types
        _TYPE_ANCHORS = {
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
        for alt in _TYPE_ANCHORS.get(ch.chapter_type, []):
            valid_anchors.add(alt)
        # Extract anchors from all headings in content
        for line in ch.content.split("\n"):
            stripped = line.strip()
            # Markdown headings: ## Title
            if stripped.startswith("#"):
                heading_text = re.sub(r"^#+\s*", "", stripped)
                _add_slug_variants(heading_text, valid_anchors)
            # HTML headings: <h2>Title</h2> or <h3>Title</h3>
            for hmatch in re.finditer(r"<h[1-6][^>]*>([^<]+)</h[1-6]>", stripped):
                _add_slug_variants(hmatch.group(1), valid_anchors)
        # Check content for explicit heading anchors {#my-anchor}
        for match in re.finditer(r"\{#([\w-]+)\}", ch.content):
            valid_anchors.add(match.group(1))
        # Check HTML id attributes: <h2 id="my-anchor">
        for match in re.finditer(r'id="([\w-]+)"', ch.content):
            valid_anchors.add(match.group(1))

    # Extract all links from TOC chapters
    all_links: list[dict[str, str]] = []
    broken: list[dict[str, str]] = []

    for toc_ch in toc_chapters:
        content = toc_ch.content
        # Match markdown links: [text](#anchor)
        for match in re.finditer(r"\[([^\]]+)\]\(#([\w-]+)\)", content):
            text = match.group(1)
            anchor = match.group(2)
            link_info = {"text": text, "anchor": anchor, "toc_chapter_id": toc_ch.id}
            all_links.append(link_info)
            if anchor not in valid_anchors:
                broken.append(link_info)
        # Match HTML links: <a href="#anchor">text</a>
        for match in re.finditer(r'<a\s+href="#([\w-]+)"[^>]*>([^<]+)</a>', content):
            anchor = match.group(1)
            text = match.group(2)
            link_info = {"text": text, "anchor": anchor, "toc_chapter_id": toc_ch.id}
            all_links.append(link_info)
            if anchor not in valid_anchors:
                broken.append(link_info)

    return {
        "valid": len(broken) == 0,
        "toc_found": True,
        "total_links": len(all_links),
        "broken_count": len(broken),
        "links": all_links,
        "broken": broken,
        "valid_anchors": sorted(valid_anchors),
    }


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
