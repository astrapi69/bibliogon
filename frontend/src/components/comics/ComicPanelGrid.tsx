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

export type ComicGridTemplate = "single_panel" | "grid_2x2" | "grid_3x3";

const COMIC_GRID_TEMPLATES: readonly ComicGridTemplate[] = [
    "single_panel",
    "grid_2x2",
    "grid_3x3",
];

const DEFAULT_COMIC_GRID_TEMPLATE: ComicGridTemplate = "single_panel";

const GRID_TEMPLATE_CSS: Record<ComicGridTemplate, CSSProperties> = {
    single_panel: {
        gridTemplateColumns: "1fr",
        gridTemplateRows: "1fr",
    },
    grid_2x2: {
        gridTemplateColumns: "repeat(2, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
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
                    />
                );
            })}
        </section>
    );
}

export default ComicPanelGrid;
