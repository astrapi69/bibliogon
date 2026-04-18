"""Asset import and image-path rewriting for project imports."""

import re
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Asset, Chapter

_ASSET_TYPE_MAP: dict[str, str] = {
    "covers": "cover",
    "figures": "figure",
    "diagrams": "diagram",
    "tables": "table",
    "logo": "figure",
    "author": "figure",
    "infographics": "figure",
}

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".tiff"}


def _classify_asset_type(rel_path: Path) -> str:
    """Pick an asset_type from a path relative to the project's assets dir.

    The first folder name is the primary signal; subfolders override
    when they match a known type (e.g. ``figures/diagrams/foo.png`` -> diagram).
    """
    parts = rel_path.parts
    folder_name = parts[0].lower() if parts else ""
    asset_type = _ASSET_TYPE_MAP.get(folder_name, "figure")
    if len(parts) > 2:
        subfolder = parts[1].lower()
        if subfolder in _ASSET_TYPE_MAP:
            asset_type = _ASSET_TYPE_MAP[subfolder]
    return asset_type


def import_assets(db: Session, book_id: str, assets_dir: Path) -> int:
    """Import images from the project's assets directory into uploads.

    Walks the assets directory tree, determines asset_type from folder name
    (with subfolder override) and copies files to the configured uploads dir.
    """
    from app.routers.assets import UPLOAD_DIR

    count = 0
    for file_path in assets_dir.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in _IMAGE_EXTENSIONS:
            continue

        asset_type = _classify_asset_type(file_path.relative_to(assets_dir))
        dest_dir = UPLOAD_DIR / book_id / asset_type
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / file_path.name
        shutil.copy2(file_path, dest_path)

        db.add(
            Asset(
                book_id=book_id,
                filename=file_path.name,
                asset_type=asset_type,
                path=str(dest_path),
            )
        )
        count += 1

    return count


def rewrite_image_paths(db: Session, book_id: str) -> None:
    """Rewrite ``<img src=...>`` paths in chapters to point at the asset API.

    Converts paths like::

        assets/figures/diagram.png  ->  /api/books/{id}/assets/file/diagram.png
        assets/logo/logo.png        ->  /api/books/{id}/assets/file/logo.png
    """
    assets = db.query(Asset).filter(Asset.book_id == book_id).all()
    known_filenames = {a.filename for a in assets}
    api_base = f"/api/books/{book_id}/assets/file"

    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).all()
    for ch in chapters:
        if "<img" not in ch.content:
            continue

        def replace_src(match: re.Match[str]) -> str:
            src: str = match.group(1)
            filename = src.rsplit("/", 1)[-1] if "/" in src else src
            if filename in known_filenames:
                return f'src="{api_base}/{filename}"'
            return str(match.group(0))

        new_content = re.sub(r'src="([^"]+)"', replace_src, ch.content)
        if new_content != ch.content:
            ch.content = new_content
