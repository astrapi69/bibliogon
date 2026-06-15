"""Asset resolution for comic-book PDF rendering.

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

    Same shape as picture-book's ``_build_assets_map``; duplicated
    here so the comic walker is self-contained (no need to expose
    the picture-book helper as a public symbol just for this).
    Missing files are skipped silently.
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
