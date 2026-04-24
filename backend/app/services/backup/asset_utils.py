"""Asset import and image-path rewriting for project imports."""

import re
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Asset, Chapter

_ASSET_TYPE_MAP: dict[str, str] = {
    "cover": "cover",
    "covers": "cover",
    "back-cover": "cover",
    "figures": "figure",
    "images": "figure",
    "diagrams": "diagram",
    "tables": "table",
    "logo": "figure",
    # author portrait / signature / bio images. Classified as
    # "author-asset" so the Design tab of the metadata editor can
    # render them separately from chapter figures.
    "author": "author-asset",
    "authors": "author-asset",
    "about-author": "author-asset",
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


# Matches a src attribute on an <img> (HTML) or a "src" key (TipTap JSON).
# Accepts ASCII straight quotes and Unicode curly quotes in either direction.
# Each quote family is matched in its own alternative so that a straight-
# quoted outer (from TipTap JSON) can still contain curly quotes inside the
# captured value (e.g. `"src":"“assets/chapter_01_flimmern."` which TipTap's
# HTML parser produced when the source HTML used smart quotes).
_SRC_RE = re.compile(
    r"""(?P<prefix>src\s*=\s*|"src"\s*:\s*)"""
    r"""(?:"(?P<v_dq>[^"]*)"|'(?P<v_sq>[^']*)'"""
    r"""|[“”](?P<v_cd>[^“”]*)[“”]|[‘’](?P<v_cs>[^‘’]*)[‘’])"""
)


def _extract_filename(value: str, known: set[str]) -> str | None:
    """Derive the asset filename from a raw src attribute value.

    Handles:
    - leading/trailing whitespace and stray curly-quote leftovers
    - internal whitespace inserted by Markdown line-wrapping (e.g.
      ``foo. jpg`` -> ``foo.jpg``)
    - the leading ``“`` that HTML parsers sometimes leave on a truncated
      value (chapter 1 of the regression book had ``"src":"“assets/..."``
      because TipTap's setContent parsed a smart-quoted <img> tag badly)
    - bare basenames as well as ``assets/<type>/<name>`` paths
    """
    cleaned = value.strip("“”‘’\"' \t\n")
    collapsed = re.sub(r"\s+", "", cleaned)
    basename = collapsed.rsplit("/", 1)[-1] if "/" in collapsed else collapsed
    if basename in known:
        return basename
    # Partial match: some chapters ended up with a truncated src such as
    # "assets/chapter_01_flimmern." (missing extension) after TipTap parsed a
    # smart-quoted <img>. Best-effort: match by stem against known filenames.
    stem_match = re.match(r"([A-Za-z0-9_\-]+)\.?", basename)
    if stem_match:
        stem = stem_match.group(1)
        for filename in known:
            if filename.rsplit(".", 1)[0] == stem:
                return filename
    return None


def rewrite_image_paths(db: Session, book_id: str) -> int:
    """Rewrite img src paths in chapters to point at the asset API.

    Converts paths like::

        assets/figures/diagram.png  ->  /api/books/{id}/assets/file/diagram.png
        assets/logo/logo.png        ->  /api/books/{id}/assets/file/logo.png

    Handles both HTML (``<img src="...">``) and TipTap JSON
    (``"src":"..."``) chapter content, and tolerates smart quotes plus
    whitespace-in-filename artefacts produced by Markdown exports from
    typography-aware editors.

    Returns the number of chapter rows that were modified. Idempotent:
    running again on an already-rewritten book leaves content unchanged.
    """
    assets = db.query(Asset).filter(Asset.book_id == book_id).all()
    known_filenames = {a.filename for a in assets}
    api_base = f"/api/books/{book_id}/assets/file"

    def replace_src(match: re.Match[str]) -> str:
        prefix = match.group("prefix")
        value = next(
            (
                match.group(name)
                for name in ("v_dq", "v_sq", "v_cd", "v_cs")
                if match.group(name) is not None
            ),
            None,
        )
        if value is None:
            return match.group(0)
        filename = _extract_filename(value, known_filenames)
        if not filename:
            return match.group(0)
        if prefix.startswith('"src"'):
            return f'"src":"{api_base}/{filename}"'
        return f'src="{api_base}/{filename}"'

    modified = 0
    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).all()
    for ch in chapters:
        if "src" not in ch.content:
            continue
        new_content = _SRC_RE.sub(replace_src, ch.content)
        if new_content != ch.content:
            ch.content = new_content
            modified += 1
    return modified


def backfill_image_paths(db: Session, book_id: str) -> int:
    """Repair image paths in an already-imported book.

    Public entry point for re-running the import-time rewrite against a book
    whose chapters still contain raw ``assets/...`` references (typically
    imports from before this fix landed). Commits on success.

    Returns the number of chapters updated.
    """
    count = rewrite_image_paths(db, book_id)
    if count:
        db.commit()
    return count
