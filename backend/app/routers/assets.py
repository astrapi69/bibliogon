import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Asset, Book
from app.schemas import AssetOut

router = APIRouter(prefix="/books/{book_id}/assets", tags=["assets"])

UPLOAD_DIR = Path("uploads")


@router.get("", response_model=list[AssetOut])
def list_assets(book_id: str, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return db.query(Asset).filter(Asset.book_id == book_id).all()


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def upload_asset(
    book_id: str,
    file: UploadFile,
    asset_type: str = "figure",
    db: Session = Depends(get_db),
):
    """Upload an asset (cover, figure, diagram, table) for a book."""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if asset_type not in ("cover", "figure", "diagram", "table"):
        raise HTTPException(status_code=400, detail="Invalid asset_type")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Store file
    book_dir = UPLOAD_DIR / book_id / asset_type
    book_dir.mkdir(parents=True, exist_ok=True)
    file_path = book_dir / file.filename

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    asset = Asset(
        book_id=book_id,
        filename=file.filename,
        asset_type=asset_type,
        path=str(file_path),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.get("/{asset_id}/file")
def serve_asset(book_id: str, asset_id: str, db: Session = Depends(get_db)):
    """Serve an asset file by ID."""
    asset = (
        db.query(Asset)
        .filter(Asset.id == asset_id, Asset.book_id == book_id)
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    file_path = Path(asset.path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(path=file_path, filename=asset.filename)


@router.get("/file/{filename}")
def serve_asset_by_name(book_id: str, filename: str, db: Session = Depends(get_db)):
    """Serve an asset file by filename (used by img tags in editor)."""
    asset = (
        db.query(Asset)
        .filter(Asset.book_id == book_id, Asset.filename == filename)
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    file_path = Path(asset.path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(path=file_path, filename=asset.filename)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(book_id: str, asset_id: str, db: Session = Depends(get_db)):
    asset = (
        db.query(Asset)
        .filter(Asset.id == asset_id, Asset.book_id == book_id)
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Remove file from disk
    file_path = Path(asset.path)
    if file_path.exists():
        file_path.unlink()

    db.delete(asset)
    db.commit()
