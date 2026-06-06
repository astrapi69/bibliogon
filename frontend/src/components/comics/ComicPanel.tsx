/**
 * ComicPanel — renders one comic_panels row as a CSS-Grid cell.
 *
 * Comics-Session-2 C5. Editor-side mirror of the walker's
 * ``_render_comic_panel`` in
 * ``plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py``.
 *
 * Each panel hosts N bubbles via N ``ComicBubble`` children. The
 * panel's image (if ``image_asset_id`` is set) fills the cell as
 * the background; bubbles render absolutely on top.
 *
 * The panel itself is ``position: relative`` so its absolutely-
 * positioned bubble children resolve correctly.
 */

import type {CSSProperties} from "react";

import {ComicBubble, type ComicBubbleData} from "./ComicBubble";

export interface ComicPanelData {
    id: string;
    page_id: string;
    position: number;
    image_asset_id?: string | null;
    bounds: Record<string, unknown>;
    panel_config?: Record<string, unknown> | null;
}

interface ComicPanelProps {
    panel: ComicPanelData;
    bubbles: ComicBubbleData[];
    imageUrl?: string | null;
    selected?: boolean;
    onClick?: () => void;
    onBubbleClick?: (bubbleId: string) => void;
    /** Fires once on bubble pointer-up after a drag exceeded the
     *  5px threshold. The receiver should persist the new anchor
     *  via the existing ``getStorage().comics.updateBubble`` path. */
    onBubbleDragEnd?: (bubbleId: string, x_pct: number, y_pct: number) => void;
    /** Fires once on tail-handle pointer-up after a drag exceeded
     *  the 5px threshold. Persists the new (direction, position,
     *  length) triple via the existing getStorage().comics.updateBubble. */
    onBubbleTailDragEnd?: (
        bubbleId: string,
        direction: string,
        positionPct: number,
        lengthPx: number,
    ) => void;
    selectedBubbleId?: string | null;
}

export function ComicPanel({
    panel,
    bubbles,
    imageUrl,
    selected,
    onClick,
    onBubbleClick,
    onBubbleDragEnd,
    onBubbleTailDragEnd,
    selectedBubbleId,
}: ComicPanelProps) {
    const config = panel.panel_config ?? {};
    const borderStyle =
        typeof config.border_style === "string" ? config.border_style : "solid";

    const style: CSSProperties = {
        position: "relative",
        // Editor chrome (NOT the printed comic — the PDF walker keeps
        // black-framed white panels). Theme-aware so empty panels +
        // the panel frame stay visible/legible in all 12 variants.
        border: `1px ${borderStyle} var(--border-strong)`,
        overflow: "hidden",
        boxSizing: "border-box",
        background: "var(--bg-card)",
        outline: selected ? "2px solid var(--accent, #b45309)" : "none",
        outlineOffset: "2px",
        cursor: onClick ? "pointer" : "default",
        width: "100%",
        height: "100%",
    };

    const sortedBubbles = [...bubbles].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );

    return (
        <div
            data-testid={`comic-panel-${panel.id}`}
            style={style}
            onClick={onClick}
            role={onClick ? "button" : undefined}
            aria-label={onClick ? `Comic panel ${panel.position + 1}` : undefined}
        >
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt=""
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                    }}
                />
            ) : null}
            {sortedBubbles.map((bubble) => (
                <ComicBubble
                    key={bubble.id}
                    bubble={bubble}
                    selected={selectedBubbleId === bubble.id}
                    onClick={
                        onBubbleClick ? () => onBubbleClick(bubble.id) : undefined
                    }
                    onDragEnd={
                        onBubbleDragEnd
                            ? (x_pct, y_pct) =>
                                  onBubbleDragEnd(bubble.id, x_pct, y_pct)
                            : undefined
                    }
                    onTailDragEnd={
                        onBubbleTailDragEnd
                            ? (direction, positionPct, lengthPx) =>
                                  onBubbleTailDragEnd(
                                      bubble.id,
                                      direction,
                                      positionPct,
                                      lengthPx,
                                  )
                            : undefined
                    }
                />
            ))}
        </div>
    );
}

export default ComicPanel;
