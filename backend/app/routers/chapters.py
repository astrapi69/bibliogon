from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Chapter, ChapterVersion
from app.repositories.chapters import ChapterRepository, get_chapter_repository
from app.schemas import (
    ChapterCreate,
    ChapterFork,
    ChapterOut,
    ChapterReorder,
    ChapterSnapshotCreate,
    ChapterUpdate,
    ChapterVersionDiff,
    ChapterVersionRead,
    ChapterVersionSummary,
)
from app.services.chapter_snapshots import line_diff, snapshot_plain_text
from app.services.toc_validation import validate_book_toc
from app.services.writing_stats import count_words, record_progress

# Retention: keep at most the last N AUTOMATIC snapshots per chapter.
# Manual (named) snapshots are exempt - they survive until the user
# deletes them. Further auto history is only available via .bgb backups.
VERSION_RETENTION = 20

router = APIRouter(prefix="/books/{book_id}/chapters", tags=["chapters"])


def _ensure_book(book_id: str, repo: ChapterRepository) -> None:
    """Raise 404 when ``book_id`` does not exist."""
    if not repo.book_exists(book_id):
        raise HTTPException(status_code=404, detail="Book not found")


@router.get("", response_model=list[ChapterOut])
def list_chapters(
    book_id: str,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    _ensure_book(book_id, repo)
    return list(repo.list(book_id))


@router.post("", response_model=ChapterOut, status_code=status.HTTP_201_CREATED)
def create_chapter(
    book_id: str,
    payload: ChapterCreate,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    _ensure_book(book_id, repo)

    if payload.position is None:
        payload.position = repo.next_position(book_id)

    chapter = Chapter(book_id=book_id, **payload.model_dump())
    return repo.add(chapter)


@router.get("/{chapter_id}", response_model=ChapterOut)
def get_chapter(
    book_id: str,
    chapter_id: str,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    chapter = repo.get(book_id, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


@router.patch("/{chapter_id}", response_model=ChapterOut)
def update_chapter(
    book_id: str,
    chapter_id: str,
    payload: ChapterUpdate,
    repo: ChapterRepository = Depends(get_chapter_repository),
    db: Session = Depends(get_db),
):
    chapter = repo.get(book_id, chapter_id)
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
    repo.stage_version(snapshot)

    # Word count BEFORE the update, to record the day's net writing
    # delta (WRITING-GOALS-PROGRESS-TRACKING-01) when content changes.
    words_before = count_words(chapter.content)

    updates = payload.model_dump(exclude_unset=True, exclude={"version"})
    for key, value in updates.items():
        setattr(chapter, key, value)
    chapter.version += 1

    if "content" in updates:
        record_progress(
            db,
            count_words(chapter.content) - words_before,
            book_id=chapter.book_id,
            chapter_id=chapter.id,
        )

    repo.commit_refresh(chapter)
    repo.trim_auto_versions(chapter.id, VERSION_RETENTION)

    return chapter


# --- Version history endpoints ---


@router.get("/{chapter_id}/versions", response_model=list[ChapterVersionSummary])
def list_chapter_versions(
    book_id: str,
    chapter_id: str,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    """Return version metadata (no content) for a chapter, newest first."""
    _ensure_book(book_id, repo)
    if repo.get(book_id, chapter_id) is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return list(repo.list_versions(chapter_id))


@router.get(
    "/{chapter_id}/versions/{version_id}",
    response_model=ChapterVersionRead,
)
def get_chapter_version(
    book_id: str,
    chapter_id: str,
    version_id: str,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    _ensure_book(book_id, repo)
    version = repo.get_version(book_id, chapter_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post(
    "/{chapter_id}/versions/{version_id}/restore",
    response_model=ChapterOut,
)
def restore_chapter_version(
    book_id: str,
    chapter_id: str,
    version_id: str,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    """Restore a chapter's content and title from a historic version.

    Snapshots the current state first (just like a normal PATCH), then
    overwrites content + title with the version's values and bumps
    the chapter version counter.
    """
    _ensure_book(book_id, repo)
    chapter = repo.get(book_id, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    version = repo.get_version_in_chapter(chapter_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Snapshot current state before overwriting, same as the PATCH path.
    snapshot = ChapterVersion(
        chapter_id=chapter.id,
        content=chapter.content,
        title=chapter.title,
        version=chapter.version,
    )
    repo.stage_version(snapshot)

    chapter.content = version.content
    chapter.title = version.title
    chapter.version += 1
    repo.commit_refresh(chapter)
    repo.trim_auto_versions(chapter.id, VERSION_RETENTION)

    return chapter


@router.post(
    "/{chapter_id}/snapshots",
    response_model=ChapterVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_chapter_snapshot(
    book_id: str,
    chapter_id: str,
    payload: ChapterSnapshotCreate,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    """Take a Scrivener-style manual snapshot of the chapter's CURRENT
    saved state (CHAPTER-SNAPSHOTS-01).

    Unlike the automatic versions written on every PATCH, a manual
    snapshot is ``is_manual = True`` and carries an optional ``name``.
    It is exempt from the last-20 retention trim, so it survives until
    the user deletes it explicitly.
    """
    _ensure_book(book_id, repo)
    chapter = repo.get(book_id, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    snapshot = ChapterVersion(
        chapter_id=chapter.id,
        content=chapter.content,
        title=chapter.title,
        version=chapter.version,
        name=payload.name,
        is_manual=True,
    )
    return repo.add_version(snapshot)


@router.get(
    "/{chapter_id}/versions/{version_id}/diff",
    response_model=ChapterVersionDiff,
)
def diff_chapter_version(
    book_id: str,
    chapter_id: str,
    version_id: str,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    """Line-oriented diff between a stored version and the chapter's
    CURRENT content (CHAPTER-SNAPSHOTS-01).

    ``added`` lines are present now but not in the snapshot; ``removed``
    lines were in the snapshot but are gone. Both sides are flattened
    from TipTap JSON to line-broken plain text before diffing.
    """
    _ensure_book(book_id, repo)
    chapter = repo.get(book_id, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    version = repo.get_version_in_chapter(chapter_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    snapshot_text = snapshot_plain_text(version.content)
    current_text = snapshot_plain_text(chapter.content)
    return {
        "version_id": version.id,
        "title_changed": version.title != chapter.title,
        "snapshot_title": version.title,
        "current_title": chapter.title,
        "lines": line_diff(snapshot_text, current_text),
    }


@router.delete(
    "/{chapter_id}/versions/{version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_chapter_version(
    book_id: str,
    chapter_id: str,
    version_id: str,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    """Delete a MANUAL snapshot (CHAPTER-SNAPSHOTS-01).

    Only manual snapshots are user-deletable; automatic versions are
    managed by the retention trim and rejected here with a 400 so the
    history stays a faithful record of saves.
    """
    _ensure_book(book_id, repo)
    version = repo.get_version(book_id, chapter_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    if not version.is_manual:
        raise HTTPException(
            status_code=400,
            detail="Only manual snapshots can be deleted",
        )
    repo.delete_version(version)


@router.post(
    "/{chapter_id}/fork",
    response_model=ChapterOut,
    status_code=status.HTTP_201_CREATED,
)
def fork_chapter(
    book_id: str,
    chapter_id: str,
    payload: ChapterFork,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    """PS-13: clone the user's local edit into a NEW chapter inserted
    after the source chapter.

    Used by the conflict-resolution dialog as a third option alongside
    Keep / Discard. The source chapter is left untouched (it keeps the
    server's current content); the new chapter holds the user's
    unsaved draft so nothing is lost. Position of every chapter after
    the source bumps by 1 to make room.

    Returns the newly created chapter, ready for the frontend to
    refresh its list and (optionally) navigate to.
    """
    _ensure_book(book_id, repo)
    source = repo.get(book_id, chapter_id)
    if not source:
        raise HTTPException(status_code=404, detail="Chapter not found")

    new_position = source.position + 1
    # Bump positions of everything below the source to keep the list
    # gap-free + the insert deterministic. One UPDATE ... WHERE ...
    # round-trip regardless of chapter count, staged with the insert
    # so both land in repo.add's commit.
    repo.bump_positions_from(book_id, new_position)

    new_title = (payload.title or "").strip() or f"{source.title} (Local Draft)"
    new_chapter = Chapter(
        book_id=book_id,
        title=new_title,
        content=payload.content,
        position=new_position,
        chapter_type=source.chapter_type,
    )
    return repo.add(new_chapter)


@router.delete("/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter(
    book_id: str,
    chapter_id: str,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    chapter = repo.get(book_id, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    # Cascade: delete AI review files linked to this chapter's slug. The
    # reviews directory is best-effort; a missing dir or unreadable file
    # never blocks the chapter deletion.
    from app.ai.review_store import delete_reviews_for_chapter, slugify

    chapter_slug = slugify(chapter.title or chapter_id)
    delete_reviews_for_chapter(book_id, chapter_slug)

    repo.delete(chapter)


@router.put("/reorder", response_model=list[ChapterOut])
def reorder_chapters(
    book_id: str,
    payload: ChapterReorder,
    repo: ChapterRepository = Depends(get_chapter_repository),
):
    _ensure_book(book_id, repo)
    chapters = repo.list(book_id)
    chapter_map = {c.id: c for c in chapters}

    for position, chapter_id in enumerate(payload.chapter_ids):
        if chapter_id not in chapter_map:
            raise HTTPException(
                status_code=400, detail=f"Chapter {chapter_id} not found in this book"
            )
        chapter_map[chapter_id].position = position

    repo.commit()
    return list(repo.list(book_id))


@router.post("/validate-toc")
def validate_toc(
    book_id: str,
    repo: ChapterRepository = Depends(get_chapter_repository),
) -> dict[str, Any]:
    """Validate TOC links against actual chapter titles.

    Finds all anchor links in TOC chapters and checks if they match
    chapter titles or explicit anchors in the book.
    """
    _ensure_book(book_id, repo)
    chapters = list(repo.list(book_id))
    return validate_book_toc(chapters)
