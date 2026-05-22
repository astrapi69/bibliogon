"""FastAPI routes for the KDP plugin."""

import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book
from app.schemas import (
    ArcReviewerCreate,
    ArcReviewerOut,
    ArcReviewerUpdate,
    BookPublishingStateGetResponse,
    BookPublishingStateRead,
    BookPublishingStateUpdate,
)

from .changelog import add_entry, export_changelog_markdown, get_changelog
from .cover_validator import (
    KDP_COVER_REQUIREMENTS,
    generate_kdp_metadata,
    validate_cover,
)
from .metadata_checker import check_metadata_completeness
from .package import KdpPackageError, build_kdp_package
from .publishing_state_service import (
    create_reviewer,
    delete_publishing_state,
    delete_reviewer,
    get_publishing_state,
    list_reviewers,
    update_reviewer,
    upsert_publishing_state,
)

router = APIRouter(prefix="/kdp", tags=["kdp"])

# ``KDP_COVER_REQUIREMENTS`` re-exported from cover_validator for the
# in-process consumers that import it from here (plugin-export's
# preview pipeline, plus the soon-to-ship Phase 2 ARC step).


# --- Amazon KDP category catalog ---
#
# The canonical KDP top-level category names. Dictated by Amazon, NOT
# user-editable - the same rationale as KDP_COVER_REQUIREMENTS above.
# Sourced from the KDP category browser; alphabetical order matches
# Amazon's own UI listing.
#
# KDP-CATEGORIES-CATALOG-SYNC-01 (2026-05-18) collapsed three drifted
# sources into this constant: routes.py had a 10-entry subset, the
# bundled plugins/bibliogon-plugin-kdp/config/kdp.yaml had 26 entries,
# and the canonical backend/config/plugins/kdp.yaml had none. The
# bundled YAML's settings block was stripped in the same commit; the
# canonical YAML never carried categories because they are not a user
# preference.
KDP_CATEGORIES: list[str] = [
    "Arts & Photography",
    "Biographies & Memoirs",
    "Business & Money",
    "Children's eBooks",
    "Comics & Graphic Novels",
    "Computers & Technology",
    "Cookbooks, Food & Wine",
    "Education & Teaching",
    "Engineering & Transportation",
    "Health, Fitness & Dieting",
    "History",
    "Humor & Entertainment",
    "Law",
    "Literature & Fiction",
    "Mystery, Thriller & Suspense",
    "Parenting & Relationships",
    "Politics & Social Sciences",
    "Reference",
    "Religion & Spirituality",
    "Romance",
    "Science & Math",
    "Science Fiction & Fantasy",
    "Self-Help",
    "Sports & Outdoors",
    "Teen & Young Adult",
    "Travel",
]


class MetadataRequest(BaseModel):
    title: str
    subtitle: str | None = None
    author: str
    description: str | None = None
    language: str = "de"
    series: str | None = None
    series_index: int | None = None
    categories: list[str] = []
    keywords: list[str] = []


@router.post("/metadata")
def generate_metadata(request: MetadataRequest) -> dict[str, Any]:
    """Generate KDP-compatible metadata from book data."""
    book_data = {
        "title": request.title,
        "subtitle": request.subtitle,
        "author": request.author,
        "description": request.description,
        "language": request.language,
        "series": request.series,
        "series_index": request.series_index,
    }
    return generate_kdp_metadata(
        book_data,
        categories=request.categories,
        keywords=request.keywords,
    )


@router.post("/validate-cover")
def validate_cover_endpoint(file: UploadFile) -> dict[str, Any]:
    """Validate a cover image against KDP requirements."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    tmp_dir = Path(tempfile.mkdtemp(prefix="kdp_cover_"))
    try:
        tmp_file = tmp_dir / file.filename
        with open(tmp_file, "wb") as f:
            shutil.copyfileobj(file.file, f)

        result = validate_cover(tmp_file, KDP_COVER_REQUIREMENTS)
        return result.to_dict()
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@router.get("/categories")
def list_categories() -> list[str]:
    """List available KDP categories."""
    return list(KDP_CATEGORIES)


class CheckMetadataRequest(BaseModel):
    title: str = ""
    subtitle: str | None = None
    author: str = ""
    description: str | None = None
    html_description: str | None = None
    language: str = ""
    keywords: str | None = None
    cover_image: str | None = None
    isbn_ebook: str | None = None
    isbn_paperback: str | None = None
    publisher: str | None = None
    backpage_description: str | None = None
    chapters: list[dict] = []
    # Bug 9: Books-only subject categorisation. Surfaced through
    # the checker so the "Check metadata for KDP" panel can flag
    # missing / over-cap / malformed BISAC codes before the user
    # uploads to KDP and Amazon rejects the listing.
    categories: list[str] = []
    bisac_codes: list[str] = []


@router.post("/check-metadata")
def check_metadata(request: CheckMetadataRequest) -> dict[str, Any]:
    """Check if book metadata is complete for KDP publishing.

    Returns completeness status with errors (blocks publishing)
    and warnings (recommended improvements).
    """
    result = check_metadata_completeness(request.model_dump())
    return result.to_dict()


class ChangelogEntry(BaseModel):
    book_id: str
    version: str
    format: str = "epub"
    book_type: str = "ebook"
    notes: str = ""


@router.post("/changelog")
def add_changelog_entry(entry: ChangelogEntry) -> dict[str, str]:
    """Record a publication event in the book's changelog."""
    return add_entry(
        book_id=entry.book_id,
        version=entry.version,
        format=entry.format,
        book_type=entry.book_type,
        notes=entry.notes,
    )


@router.get("/changelog/{book_id}")
def get_book_changelog(book_id: str) -> list[dict[str, str]]:
    """Get the publication changelog for a book."""
    return get_changelog(book_id)


@router.get("/changelog/{book_id}/export")
def export_book_changelog(book_id: str, title: str = "") -> dict[str, str]:
    """Export the changelog as Markdown text."""
    md = export_changelog_markdown(book_id, title)
    return {"markdown": md, "book_id": book_id}


@router.post("/package/{book_id}")
def build_package(book_id: str) -> FileResponse:
    """Build the KDP-ready ZIP package for a book.

    Endpoint shape from KDP-PUBLISHING-WIZARD-01 Phase 1 MVP
    (A1 adjudication: 3-step wizard ships checklist + cover
    validation + this package step). Returns a streamed ZIP
    that the wizard's Step 3 triggers the user to download.

    Architectural notes:
    - Per A3, manuscript generation reaches into plugin-export
      + plugin-comics via direct Python import. plugin-kdp
      already ``depends_on=["export"]``; the comics import is
      lazy + gated on the book_type discriminator so the
      package builder still works when plugin-comics is absent.
    - Per A4, ZIP layout: metadata.json + cover.{ext} +
      cover-validation-report.json + manuscript-*.{ext} +
      publishing-state-snapshot.json + README.txt.
    - Per A5 (Phase 1 MVP), wizard state is session-scoped —
      no BookPublishingState row read/written. The
      publishing-state-snapshot.json is built from the Book
      record only.

    Defence-in-depth: the package builder re-runs the
    metadata-completeness check server-side so a bypassed
    client gate (e.g. direct curl) still gets blocked by the
    same rules the wizard's Step 1 enforced.
    """
    try:
        zip_path = build_kdp_package(book_id)
    except KdpPackageError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=zip_path.name,
    )


# --- KDP Publishing Wizard Phase 2 (C5) ---------------------------
#
# Per-book commercial / launch state for the wizard. Auto-save
# target from the wizard's transition handlers in C11. 1:1 with
# Book via UNIQUE(book_id); upsert semantics.


@router.get(
    "/publishing-state/{book_id}",
    response_model=BookPublishingStateGetResponse,
)
def get_book_publishing_state(
    book_id: str, db: Session = Depends(get_db)
) -> BookPublishingStateGetResponse:
    """Load the publishing-state row for ``book_id`` plus the
    related Book's ``updated_at`` (for client-side conflict
    detection per Track 5).

    Returns ``state=None`` when no row exists yet — the wizard
    treats this as "first run" + populates defaults locally.
    """
    book = (
        db.query(Book)
        .filter(Book.id == book_id, Book.deleted_at.is_(None))
        .first()
    )
    if not book:
        raise HTTPException(
            status_code=404, detail=f"Book {book_id} not found"
        )
    row = get_publishing_state(db, book_id)
    return BookPublishingStateGetResponse(
        book_id=book_id,
        book_updated_at=book.updated_at,
        state=(BookPublishingStateRead.model_validate(row) if row else None),
    )


@router.patch(
    "/publishing-state/{book_id}",
    response_model=BookPublishingStateRead,
)
def upsert_book_publishing_state(
    book_id: str,
    payload: BookPublishingStateUpdate,
    db: Session = Depends(get_db),
) -> BookPublishingStateRead:
    """Create-or-update the publishing-state row for ``book_id``.

    PATCH semantics: missing row → created with defaults +
    payload overrides; existing row → updated with the
    explicitly-set payload fields (Pydantic's ``exclude_unset``
    distinguishes "absent" from "null").
    """
    row = upsert_publishing_state(
        db, book_id, payload.model_dump(exclude_unset=True)
    )
    return BookPublishingStateRead.model_validate(row)


@router.delete("/publishing-state/{book_id}", status_code=204)
def delete_book_publishing_state(
    book_id: str, db: Session = Depends(get_db)
) -> None:
    """Hard-delete the publishing-state row + cascade ARC reviewers.

    No-op if no row exists. Returns 204 either way (idempotent).
    """
    delete_publishing_state(db, book_id)


# --- ARC Reviewer CRUD (C6) ---------------------------------------
#
# Per-book ARC (Advance Reader Copy) reviewer tracking. Attached
# to the publishing-state row; auto-created on first reviewer add
# so the user can manage reviewers without first touching the
# wizard's other steps.


@router.get(
    "/publishing-state/{book_id}/reviewers",
    response_model=list[ArcReviewerOut],
)
def list_book_reviewers(
    book_id: str, db: Session = Depends(get_db)
) -> list[ArcReviewerOut]:
    """List ARC reviewers for the book, ordered by created_at
    ascending. Empty list when no reviewers have been added yet."""
    rows = list_reviewers(db, book_id)
    return [ArcReviewerOut.model_validate(r) for r in rows]


@router.post(
    "/publishing-state/{book_id}/reviewers",
    response_model=ArcReviewerOut,
    status_code=201,
)
def create_book_reviewer(
    book_id: str,
    payload: ArcReviewerCreate,
    db: Session = Depends(get_db),
) -> ArcReviewerOut:
    """Add a reviewer to the book's ARC list. Server-assigns
    ``review_status="invited"`` + ``invited_at=now``."""
    reviewer = create_reviewer(db, book_id, payload.model_dump())
    return ArcReviewerOut.model_validate(reviewer)


@router.patch(
    "/publishing-state/{book_id}/reviewers/{reviewer_id}",
    response_model=ArcReviewerOut,
)
def update_book_reviewer(
    book_id: str,
    reviewer_id: str,
    payload: ArcReviewerUpdate,
    db: Session = Depends(get_db),
) -> ArcReviewerOut:
    """Partial update on an ARC reviewer (status transitions,
    permalink, copy version). Auto-stamps ``reviewed_at`` when
    status transitions to ``reviewed`` and the payload didn't
    supply an explicit timestamp."""
    reviewer = update_reviewer(
        db, book_id, reviewer_id, payload.model_dump(exclude_unset=True)
    )
    return ArcReviewerOut.model_validate(reviewer)


@router.delete(
    "/publishing-state/{book_id}/reviewers/{reviewer_id}",
    status_code=204,
)
def delete_book_reviewer(
    book_id: str,
    reviewer_id: str,
    db: Session = Depends(get_db),
) -> None:
    """Hard-delete an ARC reviewer (per A25; no soft-delete).
    404 if the reviewer doesn't exist or belongs to a different
    book."""
    delete_reviewer(db, book_id, reviewer_id)
