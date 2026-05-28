/**
 * ComicPanelGrid — renders a comic-book page as a CSS-Grid of
 * panels using the page's ``layout_config.comic_grid_template``.
 *
 * Comics-Session-2 C5. Editor-side mirror of the walker's
 * ``_render_comic_page`` in
 * ``plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py``.
 *
 * 3 grid templates (Q1 β decision):
 * - ``single_panel``: 1×1 (one panel fills the page)
 * - ``grid_2x2``: 2 cols × 2 rows (4 cells)
 * - ``grid_3x3``: 3 cols × 3 rows (9 cells)
 *
 * Unknown / missing templates fall back to ``single_panel``
 * (gamma-shim default-on-read).
 *
 * Panels fill cells in ``position`` order; cells beyond the panel
 * count remain empty.
 */

import type {CSSProperties} from "react";

import {ComicPanel, type ComicPanelData} from "./ComicPanel";
import type {ComicBubbleData} from "./ComicBubble";

export type ComicGridTemplate =
    | "single_panel"
    | "grid_1x2"
    | "grid_2x1"
    | "grid_2x2"
    | "grid_2x3"
    | "grid_3x2"
    | "grid_3x3";

// Standard Layouts shipped in Phase 1 (PLUGIN-COMICS-PHASE-1-
// MULTI-PANEL-LAYOUTS-01, 2026-05-20). Must mirror walker's
// COMIC_GRID_TEMPLATES tuple in
// plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py.
export const COMIC_GRID_TEMPLATES: readonly ComicGridTemplate[] = [
    "single_panel",  // 1 panel (Splash)
    "grid_1x2",      // 2 panels side-by-side
    "grid_2x1",      // 2 panels stacked
    "grid_2x2",      // 4 panels standard grid
    "grid_2x3",      // 6 panels two-tier (2 rows × 3 cols)
    "grid_3x2",      // 6 panels three-tier (3 rows × 2 cols)
    "grid_3x3",      // 9 panels (legacy / advanced; not in default picker)
];

// User-facing subset surfaced by ComicGridTemplatePicker. grid_3x3
// stays available for backward-compat but is not in the default
// picker (per Q4 audit decision).
export const COMIC_GRID_TEMPLATE_PICKER_OPTIONS: readonly ComicGridTemplate[] = [
    "single_panel",
    "grid_1x2",
    "grid_2x1",
    "grid_2x2",
    "grid_2x3",
    "grid_3x2",
];

export const DEFAULT_COMIC_GRID_TEMPLATE: ComicGridTemplate = "single_panel";

// Maximum panel count per grid template. Each template defines a
// fixed cell count; the editor disables ``Add panel`` once the
// page has that many panels. Mirrors the comment hints next to
// COMIC_GRID_TEMPLATES above. Must mirror the walker's expected
// counts in ``plugins/bibliogon-plugin-comics/bibliogon_comics/
// comic_book_pdf.py``.
export const COMIC_GRID_MAX_PANELS: Record<ComicGridTemplate, number> = {
    single_panel: 1,
    grid_1x2: 2,
    grid_2x1: 2,
    grid_2x2: 4,
    grid_2x3: 6,
    grid_3x2: 6,
    grid_3x3: 9,
};

const GRID_TEMPLATE_CSS: Record<ComicGridTemplate, CSSProperties> = {
    single_panel: {
        gridTemplateColumns: "1fr",
        gridTemplateRows: "1fr",
    },
    grid_1x2: {
        gridTemplateColumns: "repeat(2, 1fr)",
        gridTemplateRows: "1fr",
    },
    grid_2x1: {
        gridTemplateColumns: "1fr",
        gridTemplateRows: "repeat(2, 1fr)",
    },
    grid_2x2: {
        gridTemplateColumns: "repeat(2, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
    },
    grid_2x3: {
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
    },
    grid_3x2: {
        gridTemplateColumns: "repeat(2, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
    },
    grid_3x3: {
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
    },
};

export function resolveComicGridTemplate(
    layoutConfig: Record<string, unknown> | null,
): ComicGridTemplate {
    if (layoutConfig && typeof layoutConfig === "object") {
        const candidate = layoutConfig.comic_grid_template;
        if (
            typeof candidate === "string" &&
            (COMIC_GRID_TEMPLATES as readonly string[]).includes(candidate)
        ) {
            return candidate as ComicGridTemplate;
        }
    }
    return DEFAULT_COMIC_GRID_TEMPLATE;
}

interface ComicPanelGridProps {
    layoutConfig: Record<string, unknown> | null;
    panels: ComicPanelData[];
    panelBubblesMap: Record<string, ComicBubbleData[]>;
    assetUrls?: Record<string, string>;
    selectedPanelId?: string | null;
    selectedBubbleId?: string | null;
    onPanelClick?: (panelId: string) => void;
    onBubbleClick?: (bubbleId: string) => void;
    onBubbleDragEnd?: (bubbleId: string, x_pct: number, y_pct: number) => void;
    onBubbleTailDragEnd?: (
        bubbleId: string,
        direction: string,
        positionPct: number,
        lengthPx: number,
    ) => void;
}

export function ComicPanelGrid({
    layoutConfig,
    panels,
    panelBubblesMap,
    assetUrls,
    selectedPanelId,
    selectedBubbleId,
    onPanelClick,
    onBubbleClick,
    onBubbleDragEnd,
    onBubbleTailDragEnd,
}: ComicPanelGridProps) {
    const templateId = resolveComicGridTemplate(layoutConfig);
    const gridCss = GRID_TEMPLATE_CSS[templateId];

    const sortedPanels = [...panels].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );

    return (
        <section
            data-testid="comic-page-grid"
            data-grid-template={templateId}
            style={{
                display: "grid",
                ...gridCss,
                gap: "6px",
                width: "100%",
                height: "100%",
                aspectRatio: "1 / 1",
                background: "white",
                padding: "0",
                boxSizing: "border-box",
            }}
        >
            {sortedPanels.map((panel) => {
                const imageUrl = panel.image_asset_id
                    ? (assetUrls?.[String(panel.image_asset_id)] ?? null)
                    : null;
                return (
                    <ComicPanel
                        key={panel.id}
                        panel={panel}
                        bubbles={panelBubblesMap[panel.id] ?? []}
                        imageUrl={imageUrl}
                        selected={selectedPanelId === panel.id}
                        selectedBubbleId={selectedBubbleId ?? null}
                        onClick={
                            onPanelClick ? () => onPanelClick(panel.id) : undefined
                        }
                        onBubbleClick={onBubbleClick}
                        onBubbleDragEnd={onBubbleDragEnd}
                        onBubbleTailDragEnd={onBubbleTailDragEnd}
                    />
                );
            })}
        </section>
    );
}

export default ComicPanelGrid;
