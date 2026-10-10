/**
 * Client-side comic-book PDF (#742, Maximal-Offline).
 *
 * Browser counterpart of the backend WeasyPrint comic renderer
 * (`plugins/bibliogon-plugin-comics/.../comic_book_pdf/`). One PDF page per
 * comic Page: the page's grid template decides the panel rectangles, each
 * panel gets its image and a frame, and each bubble is drawn from the SAME
 * path geometry the editor renders on screen (`bubblePath.ts`), so the PDF
 * shows the page the author laid out rather than a second interpretation
 * of it.
 *
 * Everything here is pure and framework-free so it is unit-testable; the
 * pdfmake render itself is verified in a browser (E2E), mirroring
 * `formatPdf.ts` and `picturebookPdf.ts`. Image bytes arrive as base64 data
 * URLs from `gatherComicPdf.ts`, already cropped to their cell's aspect
 * ratio - see `panelImageDataUrl` below for why the crop belongs there.
 *
 * @example
 * const blob = await comicToPdfBlob(
 *   [{ template: "grid_2x2", panels: [{ bubbles: [] }] }],
 *   "8.5x11",
 * );
 */

import {
    buildBubblePath,
    type BubbleShape,
    type BubbleTailDirection,
} from "../../lib/comics/bubblePath";
import {
    buildBubbleVisualAttrs,
    readBubbleTextConfig,
} from "../../lib/comics/bubbleStyle";
import {
    COMIC_GRID_GUTTER,
    comicPanelRects,
    type ComicGridTemplate,
    type ComicRect,
} from "../../lib/comics/comicGrid";
import { renderPdfDefinition, type PdfDocDefinition } from "../formatPdf";
import { picturebookFormatDims } from "../picturebook/picturebookPdf";

/** 0.5 in page margin, as the picture-book engine uses. */
const MARGIN = 36;

/** Default panel frame, matching the walker's `border: 1pt solid black`. */
const PANEL_BORDER_WIDTH = 1;
const PANEL_BORDER_COLOR = "black";

/** Text inset inside a bubble when `bubble_config.padding` is absent. The
 *  CSS overlay uses the asymmetric `4px 8px`; a PDF text box takes one
 *  number, and the wider value is the one that keeps prose off the
 *  outline's curve. */
const DEFAULT_BUBBLE_PADDING = 8;

/** Point size used when a bubble carries no `font_size`. The editor leaves
 *  it unset and inherits the canvas; a PDF has nothing to inherit from. */
const DEFAULT_BUBBLE_FONT_SIZE = 10;

export interface ComicPdfBubble {
    /** `speech` | `thought` | `narration` | `shout` | `whisper` |
     *  `sound_effect`. Unknown values draw as `speech`. */
    bubbleType: string;
    /** Top-left corner, percent of the panel box. */
    anchor: { x_pct?: number; y_pct?: number } | null;
    widthPct: number;
    heightPct: number;
    tailDirection: string;
    tailPositionPct: number;
    tailLengthPx: number;
    config?: Record<string, unknown> | null;
    text?: string | null;
}

export interface ComicPdfPanel {
    /**
     * base64 data URL of the panel image, cropped by the caller to the
     * cell's aspect ratio.
     *
     * The editor and the walker both use `object-fit: cover`: the image
     * fills the cell and is cropped. pdfmake's `fit` is `contain`, and it
     * has no clip for images, so a cover crop is only reachable by
     * redrawing the bitmap - which belongs in the IO layer that already
     * owns a canvas, not here.
     */
    imageDataUrl?: string | null;
    config?: Record<string, unknown> | null;
    bubbles: ComicPdfBubble[];
}

export interface ComicPdfPage {
    template: ComicGridTemplate;
    /** Panels in position order; extra panels beyond the template's cells
     *  are dropped, which is what the editor's panel cap prevents. */
    panels: ComicPdfPanel[];
}

/**
 * Resolve a trim-size key to its point dimensions.
 *
 * Deliberately the picture-book table, not a comic-specific one: the
 * backend walker reuses the same trim catalogue for comic PDFs (Q4 a), and
 * `PdfExportControls` offers that one list on both surfaces. A separate
 * table here would accept the five keys the dropdown can produce and
 * silently fall back to its own default for any it did not share, so the
 * user would pick a trim and get another.
 */
export function comicFormatDims(format?: string): [number, number] {
    return picturebookFormatDims(format);
}

function clampPct(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.min(100, value))
        : fallback;
}

/** The bubble's rectangle inside its panel, in points. */
export function bubbleRect(bubble: ComicPdfBubble, panel: ComicRect): ComicRect {
    const x = clampPct(bubble.anchor?.x_pct, 0);
    const y = clampPct(bubble.anchor?.y_pct, 0);
    const w = clampPct(bubble.widthPct, 30);
    const h = clampPct(bubble.heightPct, 20);
    return {
        x: panel.x + (x / 100) * panel.width,
        y: panel.y + (y / 100) * panel.height,
        width: (w / 100) * panel.width,
        height: (h / 100) * panel.height,
    };
}

/**
 * How far a bubble's drawing can reach outside its own box, in the 100-unit
 * path space.
 *
 * `buildBubblePath` returns a viewBox equal to the bubble box and lets the
 * tail run past it - on screen `overflow: visible` shows it anyway. An SVG
 * with explicit dimensions clips instead, so the PDF has to widen the
 * viewBox by hand or lose every tail.
 *
 * The bound is derived, not guessed: a tail tip sits `tailLengthPx` along
 * its direction vector with a 6-unit base half-width either side, and a
 * thought chain's outermost circle is centred at `tailLengthPx` with a
 * radius of at most 6 for a 100-unit bubble. 12 units of slack covers
 * both. Being generous costs transparent space; being tight costs a
 * silently amputated tail.
 */
export function bubbleOverflowMargin(tailLengthPx: number): number {
    const length = Number.isFinite(tailLengthPx) ? Math.abs(tailLengthPx) : 0;
    return Math.ceil(length) + 12;
}

/** The `<svg>` markup for one bubble outline, or `null` when the shape
 *  draws none (`sound_effect` is text on the artwork). */
export function bubbleSvg(
    bubble: ComicPdfBubble,
    rect: ComicRect,
): { svg: string; x: number; y: number; width: number; height: number } | null {
    const path = buildBubblePath({
        shape: bubble.bubbleType as BubbleShape,
        width: 100,
        height: 100,
        tailDirection: bubble.tailDirection as BubbleTailDirection,
        tailPositionPct: bubble.tailPositionPct,
        tailLengthPx: bubble.tailLengthPx,
    });
    if (!path.d) return null;

    const { fillColor, strokeColor, strokeWidth, strokeDasharray } =
        buildBubbleVisualAttrs(bubble.bubbleType, bubble.config ?? {});
    const margin = bubbleOverflowMargin(bubble.tailLengthPx);
    const viewBoxSize = 100 + margin * 2;
    // The bubble box occupies the middle of the widened viewBox, so the
    // node is offset by the same fraction of the on-page rectangle. Scale
    // is uniform per axis, so a non-square bubble stays non-square.
    const scaleX = rect.width / 100;
    const scaleY = rect.height / 100;
    const dash = strokeDasharray ? ` stroke-dasharray="${strokeDasharray}"` : "";
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" ` +
        `width="${viewBoxSize * scaleX}" height="${viewBoxSize * scaleY}" ` +
        `viewBox="${-margin} ${-margin} ${viewBoxSize} ${viewBoxSize}" ` +
        `preserveAspectRatio="none">` +
        `<path d="${path.d}" fill="${fillColor}" stroke="${strokeColor}" ` +
        `stroke-width="${strokeWidth}"${dash}/>` +
        `</svg>`;
    return {
        svg,
        x: rect.x - margin * scaleX,
        y: rect.y - margin * scaleY,
        width: viewBoxSize * scaleX,
        height: viewBoxSize * scaleY,
    };
}

/** A pdfmake text node for a bubble's words, or `null` when it has none. */
export function bubbleTextNode(
    bubble: ComicPdfBubble,
    rect: ComicRect,
): Record<string, unknown> | null {
    const text = (bubble.text ?? "").trim();
    if (!text) return null;
    const style = readBubbleTextConfig(bubble.config ?? {});
    const padding = style.padding ?? DEFAULT_BUBBLE_PADDING;
    const fontSize = style.fontSize ?? DEFAULT_BUBBLE_FONT_SIZE;
    const width = Math.max(1, rect.width - padding * 2);
    // pdfmake cannot centre a text box vertically, so the first line is
    // placed where a single line would sit centred and further lines flow
    // down from there. Bubbles hold a sentence or two, which is why this
    // is close enough to be worth more than top-aligning everything; a
    // long bubble will sit low rather than overflow upward into the art.
    const lineHeight = fontSize * 1.2;
    const y = rect.y + Math.max(padding, rect.height / 2 - lineHeight / 2);
    const node: Record<string, unknown> = {
        text,
        absolutePosition: { x: rect.x + padding, y },
        width,
        fontSize,
        alignment: style.textAlign,
        color: style.color,
        lineHeight: 1.2,
    };
    if (style.fontWeight === "bold") node.bold = true;
    if (style.italic) node.italics = true;
    // `font_family` is deliberately dropped: pdfmake renders from the
    // fonts in its virtual filesystem, so naming an arbitrary family here
    // throws at render time instead of falling back. Noted in the help
    // text rather than silently substituted.
    return node;
}

/**
 * Build a pdfmake document definition for a comic book (pure; testable).
 *
 * One PDF page per comic Page. Panel frames are a single canvas node per
 * page - one node with many rectangles rather than many nodes - and every
 * image, bubble outline and bubble text is absolutely positioned. The
 * leading empty text node per page is what carries `pageBreak`: absolutely
 * positioned content does not advance pdfmake's cursor, so without a flow
 * node there is nothing for a page break to attach to and every page would
 * stack onto the first.
 */
export function buildComicPdfDefinition(
    pages: ComicPdfPage[],
    format?: string,
): PdfDocDefinition {
    const [width, height] = comicFormatDims(format);
    const box: ComicRect = {
        x: MARGIN,
        y: MARGIN,
        width: width - MARGIN * 2,
        height: height - MARGIN * 2,
    };
    const content: Record<string, unknown>[] = [];

    pages.forEach((page, index) => {
        const rects = comicPanelRects(page.template, box, COMIC_GRID_GUTTER);
        const frames: Record<string, unknown>[] = [];
        const nodes: Record<string, unknown>[] = [];

        page.panels.slice(0, rects.length).forEach((panel, cell) => {
            const rect = rects[cell];
            const config = panel.config ?? {};
            const borderStyle =
                typeof config.border_style === "string" ? config.border_style : "solid";
            if (borderStyle !== "none") {
                frames.push({
                    type: "rect",
                    x: rect.x,
                    y: rect.y,
                    w: rect.width,
                    h: rect.height,
                    lineWidth: PANEL_BORDER_WIDTH,
                    lineColor: PANEL_BORDER_COLOR,
                });
            }
            if (panel.imageDataUrl) {
                nodes.push({
                    image: panel.imageDataUrl,
                    fit: [rect.width, rect.height],
                    absolutePosition: { x: rect.x, y: rect.y },
                });
            }
            for (const bubble of panel.bubbles) {
                const bRect = bubbleRect(bubble, rect);
                const shape = bubbleSvg(bubble, bRect);
                if (shape) {
                    nodes.push({
                        svg: shape.svg,
                        width: shape.width,
                        height: shape.height,
                        absolutePosition: { x: shape.x, y: shape.y },
                    });
                }
                const textNode = bubbleTextNode(bubble, bRect);
                if (textNode) nodes.push(textNode);
            }
        });

        const flow: Record<string, unknown> = { text: "" };
        if (index > 0) flow.pageBreak = "before";
        content.push(flow);
        // Frames first so a panel image covers its own border's inner edge
        // the way the editor's border-box does, then the absolute content.
        if (frames.length > 0) {
            content.push({ canvas: frames, absolutePosition: { x: 0, y: 0 } });
        }
        content.push(...nodes);
    });

    if (content.length === 0) content.push({ text: "" });

    return {
        pageSize: { width, height },
        pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN],
        content,
    };
}

/** Render a comic-book PDF Blob (lazy pdfmake via the shared renderer). */
export async function comicToPdfBlob(
    pages: ComicPdfPage[],
    format?: string,
): Promise<Blob> {
    return renderPdfDefinition(buildComicPdfDefinition(pages, format));
}
