"""Asset resolution for picture-book PDF rendering.

Maps persisted asset ids to ``file://`` URIs that WeasyPrint can load.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


def _build_assets_map(
    assets: list[dict[str, Any]],
    upload_dir: Path,
) -> dict[str, str]:
    """Resolve each asset_id to a file:// URL for WeasyPrint.

    The persisted assets table carries 'path' (filesystem location
    relative to the book's upload dir, or absolute). For
    file://-loading the path must be absolute. Empty entries are
    skipped silently — pages with image_asset_id pointing at a
    missing asset render as placeholder-less (no <img> emitted).
    """
    out: dict[str, str] = {}
    for asset in assets:
        asset_id = asset.get("id")
        path_str = asset.get("path") or ""
        if not asset_id or not path_str:
            continue
        path = Path(path_str)
        if not path.is_absolute():
            path = upload_dir / path
        if path.exists():
            out[str(asset_id)] = path.resolve().as_uri()
    return out
