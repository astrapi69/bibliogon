"""Cover image upload service.

Validates and stores book cover uploads. Keeps a single cover Asset per
book: replacing the cover removes the old file from disk and the old
Asset row before writing the new one. ``Book.cover_image`` is updated to
the new file's relative path so the existing
``/api/books/{id}/assets/file/{filename}`` serving endpoint just works.
"""

from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models import Asset, Book
from app.routers.assets import UPLOAD_DIR

# Whitelisted extensions (KDP-friendly raster formats only)
ALLOWED_EXTENSIONS: set[str] = {".jpg", ".jpeg", ".png", ".webp"}

# 10 MB cap matches the KDP cover upload limit
MAX_COVER_BYTES: int = 10 * 1024 * 1024

# Pillow format names that map to allowed extensions
_PILLOW_FORMATS: set[str] = {"JPEG", "PNG", "WEBP", "MPO"}  # MPO = JPEG variant


@dataclass
class CoverUploadResult:
    """Outcome of a successful cover upload."""

    filename: str
    relative_path: str  # Stored in Book.cover_image
    width: int
    height: int
    aspect_ratio: float
    size_bytes: int


# --- Public API ---


def upload_cover(db: Session, book_id: str, file: UploadFile) -> CoverUploadResult:
    """Validate, store, and register a new cover for the given book.

    Replaces any existing cover (file on disk + Asset row) and updates
    ``book.cover_image``. Returns the metadata the frontend needs to
    refresh its preview and trigger any KDP warnings.
    """
    book = _get_book_or_404(db, book_id)
    extension = _validate_extension(file.filename)
    payload = _read_within_limit(file)
    width, height = _validate_image_format(payload)

    _delete_existing_covers(db, book_id)

    target_filename = _build_cover_filename(book_id, extension)
    relative_path = _write_cover_file(book_id, target_filename, payload)

    asset = Asset(
        book_id=book_id,
        filename=target_filename,
        asset_type="cover",
        path=str(UPLOAD_DIR / book_id / "cover" / target_filename),
    )
    db.add(asset)
    book.cover_image = relative_path
    db.commit()

    return CoverUploadResult(
        filename=target_filename,
        relative_path=relative_path,
        width=width,
        height=height,
        aspect_ratio=round(height / width, 4) if width else 0.0,
        size_bytes=len(payload),
    )


def delete_cover(db: Session, book_id: str) -> bool:
    """Remove the cover Asset(s) and clear ``book.cover_image``.

    Returns ``True`` if something was removed, ``False`` if there was
    no cover to delete (the endpoint still returns 204 in that case).
    """
    book = _get_book_or_404(db, book_id)
    removed = _delete_existing_covers(db, book_id)
    if book.cover_image is not None or removed:
        book.cover_image = None
        db.commit()
    return removed


# --- Validation helpers ---


def _get_book_or_404(db: Session, book_id: str) -> Book:
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def _validate_extension(filename: str | None) -> str:
    """Return the lowercased extension (with dot) or raise 400."""
    if not filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported cover format '{suffix or filename}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )
    return suffix


def _read_within_limit(file: UploadFile) -> bytes:
    """Read the upload into memory, rejecting anything over the size cap.

    Reads in chunks so we can fail fast on a 1 GB file without loading
    the whole thing.
    """
    chunks: list[bytes] = []
    total = 0
    chunk_size = 64 * 1024
    while True:
        chunk = file.file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_COVER_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Cover too large. Max {MAX_COVER_BYTES // (1024 * 1024)} MB.",
            )
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return b"".join(chunks)


def _validate_image_format(payload: bytes) -> tuple[int, int]:
    """Verify the bytes are actually a supported raster image; return ``(w, h)``."""
    from io import BytesIO

    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(BytesIO(payload)) as img:
            img.verify()  # raises if data is corrupt
        # verify() consumes the stream; reopen for size + format
        with Image.open(BytesIO(payload)) as img:
            fmt = (img.format or "").upper()
            if fmt not in _PILLOW_FORMATS:
                raise HTTPException(
                    status_code=400,
                    detail=f"File is not a supported image (detected: {fmt or 'unknown'})",
                )
            return img.width, img.height
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="File is not a valid image")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image validation failed: {e}")


# --- Storage helpers ---


def _delete_existing_covers(db: Session, book_id: str) -> bool:
    """Delete every cover Asset for the book and the file on disk."""
    existing = db.query(Asset).filter(
        Asset.book_id == book_id, Asset.asset_type == "cover",
    ).all()
    if not existing:
        return False
    for asset in existing:
        path = Path(asset.path)
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass  # leave orphaned file rather than blocking the upload
        db.delete(asset)
    return True


def _build_cover_filename(book_id: str, extension: str) -> str:
    """Stable filename so the served URL is predictable across replacements."""
    return f"cover-{book_id}{extension}"


def _write_cover_file(book_id: str, filename: str, payload: bytes) -> str:
    """Write the bytes under ``uploads/{book_id}/cover/{filename}``.

    Returns the relative path used as ``Book.cover_image``.
    """
    cover_dir = UPLOAD_DIR / book_id / "cover"
    cover_dir.mkdir(parents=True, exist_ok=True)
    target = cover_dir / filename
    with open(target, "wb") as f:
        f.write(payload)
    # Frontend extracts the trailing filename and serves it via
    # /api/books/{id}/assets/file/{filename}, so any path that ends in
    # the filename works. We store the canonical relative form here.
    return f"assets/covers/{filename}"


# Re-export for the router
__all__ = [
    "ALLOWED_EXTENSIONS",
    "MAX_COVER_BYTES",
    "CoverUploadResult",
    "upload_cover",
    "delete_cover",
]
