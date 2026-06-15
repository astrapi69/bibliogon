"""Layout-config readers for picture-book PDF rendering.

Pure helpers that read the per-page ``layout_config`` JSON namespace
(Fix B), resolve secondary-image / speech-bubble sub-configs, and map
layout ids to CSS classes. No rendering, no styling, no IO.
"""

from __future__ import annotations

from typing import Any


def _layout_class(layout: str) -> str:
    """Map the PageLayout enum string to its CSS class."""
    valid = {
        "speech_bubble",
        "image_top_text_bottom",
        "image_left_text_right",
        "image_full_text_overlay",
        "text_only",
        # Phase 1 C3 (2026-05-28). Mirrors + full-bleed-no-text.
        "image_bottom_text_top",
        "image_right_text_left",
        "image_full_no_text",
        # Phase 2 C2 (2026-05-28). Multi-image layout.
        "two_images_text_center",
        # Phase 2 C3 (2026-05-28). split_horizontal.
        "split_horizontal",
        # Phase 2 C4 (2026-05-28). split_vertical.
        "split_vertical",
        # Phase 2 C5 (2026-05-28). image_border_text_center.
        "image_border_text_center",
        # Phase 3 C1 (2026-05-28). Collage layout. Walker
        # rendering branch (absolute-positioned images + text
        # regions) lands in C5. C1 only registers the layout
        # class so the namespace whitelist + ``_layout_class``
        # accept the new string.
        "collage",
    }
    if layout not in valid:
        # Defensive default: fall back to the most generic layout.
        return "page--image_top_text_bottom"
    return f"page--{layout}"


# Picture-Book Layout Expansion Phase 2 C2 (2026-05-28). Multi-image
# layouts use the M1 storage strategy: PRIMARY image stays on
# Page.image_asset_id; SECONDARY image lives in
# layout_config[layout].secondary_image_asset_id via
# _read_secondary_image_asset_id. The walker emits a second
# .region-image-secondary block after the text region for these
# layouts. C2 ships two_images_text_center; C3..C5 extend this set
# as each layout's CSS + dispatch lands.
_MULTI_IMAGE_LAYOUTS: frozenset[str] = frozenset(
    {
        "two_images_text_center",
        # Phase 2 C3 (2026-05-28). split_horizontal.
        "split_horizontal",
        # Phase 2 C4 (2026-05-28). split_vertical.
        "split_vertical",
    }
)


# --- Fix B (PICTURE-BOOK-TEXT-CONFIGURATION-01, 4c-B sub-item) ---
#
# Per-layout namespace helpers. Mirror the TypeScript
# ``frontend/src/utils/layoutConfig.ts`` exactly so in-editor render
# + PDF render resolve the same per-layout settings.
#
# Pre-Fix-B layout_config was a flat dict accumulating cross-layout
# keys. Fix B namespaces by layout: layout_config[layout] holds the
# layout's settings; sibling layouts' namespaces survive switches.
# Legacy-flat configs are transparently treated as the current
# layout's namespace (auto-migrated on next write through the
# frontend's writeLayoutNamespace).

_KNOWN_LAYOUTS: frozenset[str] = frozenset(
    {
        "speech_bubble",
        "image_top_text_bottom",
        "image_left_text_right",
        "image_full_text_overlay",
        "text_only",
        "comic_panel_grid",
        # Picture-Book Layout Expansion Phase 1 (2026-05-28).
        # Per-layout CSS rules + ``_render_page`` branches arrive
        # in C3; this commit only extends the namespace whitelist
        # so layout_config namespaces survive layout switches into
        # these new layouts without the legacy-flat back-compat
        # path treating them as unknown.
        "image_bottom_text_top",
        "image_right_text_left",
        "image_full_no_text",
        # Picture-Book Layout Expansion Phase 2 C1 (2026-05-28).
        # Multi-image layouts using the M1 storage strategy: PRIMARY
        # image stays on Page.image_asset_id (unchanged); SECONDARY
        # image lives in layout_config[layout].secondary_image_asset_id
        # via _read_secondary_image_asset_id (below). Subsequent
        # commits add the per-layout CSS rules + _image_layout_style
        # branches + _render_page branches; this commit only extends
        # the namespace whitelist so layout_config namespaces survive
        # layout switches into these new layouts.
        "two_images_text_center",
        "split_horizontal",
        "split_vertical",
        "image_border_text_center",
        # Phase 3 C1 (2026-05-28). Collage namespace whitelist
        # so layout_config.collage survives namespace switches.
        # Walker rendering branch arrives in C5.
        "collage",
    }
)


def _looks_namespaced(config: dict[str, Any] | None) -> bool:
    """True iff at least one top-level key matches a known layout
    name AND its value is a dict. Mirrors ``looksNamespaced`` in
    frontend/src/utils/layoutConfig.ts."""
    if not isinstance(config, dict):
        return False
    for key, value in config.items():
        if key not in _KNOWN_LAYOUTS:
            continue
        if isinstance(value, dict):
            return True
    return False


def _read_layout_namespace(
    config: dict[str, Any] | None,
    layout: str,
) -> dict[str, Any] | None:
    """Extract the active layout's namespace. Mirrors
    ``readLayoutNamespace`` in frontend/src/utils/layoutConfig.ts.

    - Namespaced config: returns ``config[layout]`` if present + dict.
    - Legacy-flat config: returns the whole flat dict (back-compat).
    - None / not-a-dict / namespaced-but-layout-absent: returns None.
    """
    if not isinstance(config, dict):
        return None
    if _looks_namespaced(config):
        namespaced = config.get(layout)
        if isinstance(namespaced, dict):
            return namespaced
        return None
    # Legacy flat shape: treat the whole config as the current
    # layout's namespace. The frontend's writeLayoutNamespace
    # migrates it on next write.
    return config


def _read_secondary_image_asset_id(
    config: dict[str, Any] | None,
    layout: str,
) -> str | None:
    """Extract the SECONDARY image asset id from a multi-image
    layout's namespace (Picture-Book Layout Expansion Phase 2 — M1
    storage). Mirrors the TypeScript ``readSecondaryImageAssetId`` in
    ``frontend/src/utils/layoutConfig.ts``.

    Phase 2 multi-image layouts (``two_images_text_center``,
    ``split_horizontal``, ``split_vertical``,
    ``image_border_text_center``) keep the PRIMARY image on
    ``Page.image_asset_id`` (unchanged from single-image layouts) and
    store the SECONDARY image's asset id under
    ``layout_config[layout].secondary_image_asset_id``.

    Returns ``None`` when:
    - config is None or not a dict
    - layout has no namespace
    - namespace has no ``secondary_image_asset_id`` key
    - the stored value is not a string (defensive shape-drift guard)
    """
    namespace = _read_layout_namespace(config, layout)
    if namespace is None:
        return None
    value = namespace.get("secondary_image_asset_id")
    return value if isinstance(value, str) else None


def _read_bubble_config(config: dict[str, Any] | None) -> dict[str, Any]:
    """4c-B-2 C1 read-path shim. Mirrors the TypeScript
    ``readBubbleConfig`` in ``frontend/src/components/PageCanvas.tsx``
    and ``LayoutConfigSpeechBubble.tsx``: per-bubble fields live
    under ``layout_config.bubbles[0]``; flat top-level keys are
    honoured as a legacy fallback. ``bubbles[0]`` precedence is
    enforced by spreading it AFTER the flat keys.
    """
    if not isinstance(config, dict):
        return {}
    flat = {k: v for k, v in config.items() if k != "bubbles"}
    bubbles = config.get("bubbles")
    bubbles_zero: dict[str, Any] = {}
    if isinstance(bubbles, list) and bubbles and isinstance(bubbles[0], dict):
        bubbles_zero = bubbles[0]
    return {**flat, **bubbles_zero}
