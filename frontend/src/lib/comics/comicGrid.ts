/**
 * The comic page-level grid templates and the geometry they imply.
 *
 * `Page.layout_config.comic_grid_template` names one of seven symmetric
 * grids (Q1 beta JSON storage, no schema enum). The table is the shared
 * part: the editor renders it as CSS Grid, the PDF engines compute cell
 * rectangles from it, and the backend walker mirrors the same ids in
 * `plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf/layout.py`.
 * Keep all three in step - a template this module does not know falls back
 * to `single_panel`, so a drift shows up as a one-panel page rather than an
 * error.
 *
 * Library-grade: no React, no storage, no i18n. The CSS declarations stay
 * in `components/comics/ComicPanelGrid.tsx`, which re-exports the names
 * below for its existing importers.
 *
 * @example
 * comicPanelRects("grid_2x2", { x: 36, y: 36, width: 540, height: 540 });
 * // four 267x267 cells with the 6pt gutter between them
 */

/** A page-level comic grid, as stored in `layout_config`. */
export type ComicGridTemplate =
    | "single_panel"
    | "grid_1x2"
    | "grid_2x1"
    | "grid_2x2"
    | "grid_2x3"
    | "grid_3x2"
    | "grid_3x3";

/** Every template, in picker order. `grid_3x3` is legacy: still honoured
 *  on read, not offered by the picker (Q4 audit decision). */
export const COMIC_GRID_TEMPLATES: readonly ComicGridTemplate[] = [
    "single_panel", // 1 panel (Splash)
    "grid_1x2", // 2 panels side-by-side
    "grid_2x1", // 2 panels stacked
    "grid_2x2", // 4 panels standard grid
    "grid_2x3", // 6 panels two-tier (2 rows x 3 cols)
    "grid_3x2", // 6 panels three-tier (3 rows x 2 cols)
    "grid_3x3", // 9 panels (legacy / advanced; not in the default picker)
];

/** The user-facing subset the picker offers. */
export const COMIC_GRID_TEMPLATE_PICKER_OPTIONS: readonly ComicGridTemplate[] = [
    "single_panel",
    "grid_1x2",
    "grid_2x1",
    "grid_2x2",
    "grid_2x3",
    "grid_3x2",
];

export const DEFAULT_COMIC_GRID_TEMPLATE: ComicGridTemplate = "single_panel";

/** Rows x columns per template. `grid_RxC` is R rows by C columns, which
 *  is why `grid_1x2` is side-by-side and `grid_2x1` is stacked. */
export const COMIC_GRID_DIMENSIONS: Record<
    ComicGridTemplate,
    { rows: number; cols: number }
> = {
    single_panel: { rows: 1, cols: 1 },
    grid_1x2: { rows: 1, cols: 2 },
    grid_2x1: { rows: 2, cols: 1 },
    grid_2x2: { rows: 2, cols: 2 },
    grid_2x3: { rows: 2, cols: 3 },
    grid_3x2: { rows: 3, cols: 2 },
    grid_3x3: { rows: 3, cols: 3 },
};

/** Cells per template. The editor disables "Add panel" at this count. */
export const COMIC_GRID_MAX_PANELS: Record<ComicGridTemplate, number> = {
    single_panel: 1,
    grid_1x2: 2,
    grid_2x1: 2,
    grid_2x2: 4,
    grid_2x3: 6,
    grid_3x2: 6,
    grid_3x3: 9,
};

/**
 * The template stored on a page, or `single_panel`.
 *
 * Unknown and missing values both fall back rather than throw: a page
 * written by a newer build, or one that never had a template, is a
 * one-panel page and not a failed export.
 */
export function resolveComicGridTemplate(
    layoutConfig: Record<string, unknown> | null | undefined,
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

/** A rectangle in whatever unit the caller's box is in. */
export interface ComicRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Gutter between cells. 6 units, matching the editor's `gap: 6px` and the
 *  backend walker's `gap: 6pt`, so a page looks the same in all three. */
export const COMIC_GRID_GUTTER = 6;

/**
 * The cell rectangles of a template inside `box`, in reading order
 * (left to right, then top to bottom - the order panels are stored in).
 *
 * The gutter is interior only: `n` columns have `n - 1` gaps, so the outer
 * edges sit flush against the box and the caller's margin is the only
 * padding. A box too small for its gutters yields zero-width cells rather
 * than negative ones, because a negative width silently flips a rectangle
 * in most renderers instead of failing.
 */
export function comicPanelRects(
    template: ComicGridTemplate,
    box: ComicRect,
    gutter: number = COMIC_GRID_GUTTER,
): ComicRect[] {
    const { rows, cols } = COMIC_GRID_DIMENSIONS[template];
    const cellWidth = Math.max(0, (box.width - gutter * (cols - 1)) / cols);
    const cellHeight = Math.max(0, (box.height - gutter * (rows - 1)) / rows);
    const rects: ComicRect[] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            rects.push({
                x: box.x + col * (cellWidth + gutter),
                y: box.y + row * (cellHeight + gutter),
                width: cellWidth,
                height: cellHeight,
            });
        }
    }
    return rects;
}
