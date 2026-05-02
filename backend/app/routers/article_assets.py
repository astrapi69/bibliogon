"""UX-FU-02: article-scoped asset router.

Mirrors the book asset router in ``assets.py`` but for articles.
Featured-image uploads from the ArticleEditor land here; the
article's ``featured_image_url`` column points at the served URL
so existing downstream consumers (Open-Graph snippets,
publication platform_metadata fallbacks) keep working.
"""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Article, ArticleAsset
from app.paths import get_upload_dir
from app.schemas import ArticleAssetOut

router = APIRouter(prefix="/articles/{article_id}/assets", tags=["article-assets"])

_ALLOWED_ASSET_TYPES = ("featured_image",)
_ALLOWED_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif")


@router.get("", response_model=list[ArticleAssetOut])
def list_assets(article_id: str, db: Session = Depends(get_db)) -> list[ArticleAsset]:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return db.query(ArticleAsset).filter(ArticleAsset.article_id == article_id).all()


@router.post("", response_model=ArticleAssetOut, status_code=status.HTTP_201_CREATED)
def upload_asset(
    article_id: str,
    file: UploadFile,
    asset_type: str = "featured_image",
    db: Session = Depends(get_db),
) -> ArticleAsset:
    """Upload an asset for an article (featured-image only for now)."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if asset_type not in _ALLOWED_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset_type")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported extension {ext!r}; allowed: {_ALLOWED_EXTENSIONS}",
        )

    article_dir = get_upload_dir() / "articles" / article_id / asset_type
    article_dir.mkdir(parents=True, exist_ok=True)
    file_path = article_dir / file.filename

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    asset = ArticleAsset(
        article_id=article_id,
        filename=file.filename,
        asset_type=asset_type,
        path=str(file_path),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.get("/file/{filename}")
def serve_asset_by_name(
    article_id: str,
    filename: str,
    db: Session = Depends(get_db),
) -> FileResponse:
    """Serve an article asset by filename. Used by the editor's
    image preview + the published article's social-media meta tags."""
    asset = (
        db.query(ArticleAsset)
        .filter(ArticleAsset.article_id == article_id, ArticleAsset.filename == filename)
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    file_path = Path(asset.path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(path=file_path, filename=asset.filename)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(article_id: str, asset_id: str, db: Session = Depends(get_db)) -> None:
    asset = (
        db.query(ArticleAsset)
        .filter(ArticleAsset.id == asset_id, ArticleAsset.article_id == article_id)
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    file_path = Path(asset.path)
    if file_path.exists():
        file_path.unlink()

    db.delete(asset)
    db.commit()
