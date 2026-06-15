"""Comic page-level grid-template layout for comic-book PDF.

Reads the page-level grid template from ``Page.layout_config``
(JSON-storage decision Q1 beta) and maps template ids to CSS Grid
declarations. Pure config reading, no rendering.
"""

from __future__ import annotations

from typing import Any

# --- Comic page-level grid templates (Q1 β JSON storage) ---

# Page-level layout for comic pages lives in
# ``Page.layout_config.comic_grid_template`` (JSON-storage decision
# Q1 β; no new schema enum). Valid template ids:
#
# Standard Layouts shipped by Phase 1 (PLUGIN-COMICS-PHASE-1-
# MULTI-PANEL-LAYOUTS-01, 2026-05-20). 6 user-facing + 1 legacy.
# Symmetric-only per α decision (asymmetric + variable deferred).
COMIC_GRID_TEMPLATES = (
    "single_panel",  # 1 panel (Splash)
    "grid_1x2",  # 2 panels side-by-side
    "grid_2x1",  # 2 panels stacked
    "grid_2x2",  # 4 panels standard grid
    "grid_2x3",  # 6 panels two-tier (2 rows × 3 cols)
    "grid_3x2",  # 6 panels three-tier (3 rows × 2 cols)
    "grid_3x3",  # 9 panels (legacy / advanced; not in default picker)
)
DEFAULT_COMIC_GRID_TEMPLATE = "single_panel"

# CSS Grid template per layout id. Each value pairs with the
# expected number of panels (N): single_panel = 1, grid_1x2 = 2,
# grid_2x1 = 2, grid_2x2 = 4, grid_2x3 = 6, grid_3x2 = 6,
# grid_3x3 = 9. The walker doesn't enforce panel-count match —
# it renders whatever ``comic_panels`` rows exist, sorted by
# position, into the grid cells in order.
_GRID_TEMPLATE_CSS: dict[str, str] = {
    "single_panel": ("grid-template-columns: 1fr;\n    grid-template-rows: 1fr;"),
    "grid_1x2": ("grid-template-columns: repeat(2, 1fr);\n    grid-template-rows: 1fr;"),
    "grid_2x1": ("grid-template-columns: 1fr;\n    grid-template-rows: repeat(2, 1fr);"),
    "grid_2x2": ("grid-template-columns: repeat(2, 1fr);\n    grid-template-rows: repeat(2, 1fr);"),
    "grid_2x3": ("grid-template-columns: repeat(3, 1fr);\n    grid-template-rows: repeat(2, 1fr);"),
    "grid_3x2": ("grid-template-columns: repeat(2, 1fr);\n    grid-template-rows: repeat(3, 1fr);"),
    "grid_3x3": ("grid-template-columns: repeat(3, 1fr);\n    grid-template-rows: repeat(3, 1fr);"),
}


def _resolve_comic_grid_template(layout_config: dict[str, Any] | None) -> str:
    """Pick the comic page-level grid template from ``Page.layout_config``.

    Per Q1 β: the comic page-level template lives in the existing
    picture-book ``layout_config`` JSON column under key
    ``comic_grid_template``. Missing / null / unknown values fall
    back to ``single_panel`` (one-panel full-bleed) — the gamma-shim
    default-on-read pattern reused everywhere in this codebase.
    """
    if isinstance(layout_config, dict):
        candidate = layout_config.get("comic_grid_template")
        if isinstance(candidate, str) and candidate in COMIC_GRID_TEMPLATES:
            return candidate
    return DEFAULT_COMIC_GRID_TEMPLATE
