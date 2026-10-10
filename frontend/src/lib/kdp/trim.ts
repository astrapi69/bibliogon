/**
 * KDP print geometry: the trim sizes the wizard offers and the margin
 * presets that go with them (#741).
 *
 * A mirror of `plugins/bibliogon-plugin-kdp/bibliogon_kdp/manuscript_pdf.py`
 * (`KDP_TRIM_SIZES`, `KDP_MARGINS`, `_BLEED_MM`), kept in inches because
 * that is the unit KDP publishes and the unit the Python side stores. The
 * conversion to PDF points happens at the one place that needs points.
 *
 * Library-grade: no app imports, no i18n. The wizard's own `KdpTrimSize`
 * union lives in `components/kdp-wizard/machines/types.ts`; this module
 * takes a plain string and falls back, so an id the wizard adds before
 * this table does cannot crash a package build.
 *
 * @example
 * resolveTrim("6x9");        // {id: "6x9", widthIn: 6, heightIn: 9}
 * resolveTrim("nonsense");   // {id: "6x9", widthIn: 6, heightIn: 9}
 * trimPoints(resolveTrim("5x8")); // {width: 360, height: 576}
 */

/** Inches per PDF point. pdfmake, like PDF itself, works in points. */
export const POINTS_PER_INCH = 72;

export interface KdpTrim {
    id: string;
    widthIn: number;
    heightIn: number;
}

/** The six KDP standard trims the wizard's FormatStep offers, in inches. */
export const KDP_TRIM_SIZES: Record<string, [number, number]> = {
    "5x8": [5.0, 8.0],
    "5.25x8": [5.25, 8.0],
    "5.5x8.5": [5.5, 8.5],
    "6x9": [6.0, 9.0],
    "7x10": [7.0, 10.0],
    "8.5x11": [8.5, 11.0],
};

export const DEFAULT_KDP_TRIM = "6x9";

/**
 * Margin presets in inches. The Python side's comment is the reason these
 * are conservative: KDP's minimum inside margin scales with page count,
 * and "wide" clears its largest (>550 pages) recommendation.
 */
export const KDP_MARGINS: Record<string, number> = {
    narrow: 0.5,
    normal: 0.75,
    wide: 1.0,
};

export const DEFAULT_KDP_MARGIN = "normal";

/**
 * KDP's bleed is 0.125in (3mm) on every trim. Only meaningful for the
 * print formats; an eBook has no bleed.
 */
export const KDP_BLEED_IN = 0.125;

/** Own-property lookup. A plain `obj[key]` reads the prototype chain, so
 *  `KDP_TRIM_SIZES["constructor"]` is truthy and would be destructured as a
 *  dimension pair - the id comes from a URL-ish selection, not from code. */
function own<T>(table: Record<string, T>, key: string | null | undefined): T | undefined {
    return typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key)
        ? table[key]
        : undefined;
}

/** Resolve a trim id to its dimensions, falling back rather than throwing. */
export function resolveTrim(trimId: string | null | undefined): KdpTrim {
    const entry = own(KDP_TRIM_SIZES, trimId);
    if (entry) return {id: trimId as string, widthIn: entry[0], heightIn: entry[1]};
    const fallback = KDP_TRIM_SIZES[DEFAULT_KDP_TRIM];
    return {id: DEFAULT_KDP_TRIM, widthIn: fallback[0], heightIn: fallback[1]};
}

/** Resolve a margin preset to inches, falling back rather than throwing. */
export function resolveMarginIn(marginId: string | null | undefined): number {
    return own(KDP_MARGINS, marginId) ?? KDP_MARGINS[DEFAULT_KDP_MARGIN];
}

/** A trim's page box in PDF points. */
export function trimPoints(trim: KdpTrim): {width: number; height: number} {
    return {
        width: trim.widthIn * POINTS_PER_INCH,
        height: trim.heightIn * POINTS_PER_INCH,
    };
}

/**
 * Grow the page box by the bleed on all four sides.
 *
 * WeasyPrint keeps the trim box at the trim size and puts the bleed
 * outside it, because CSS `@page { bleed }` is a real concept. pdfmake has
 * no bleed box at all: its page size IS the media box. So a bled page here
 * is the trim plus 2x the bleed, and whatever is drawn to the edge has to
 * be drawn to the edge of that larger box. The difference is documented in
 * the step UI rather than hidden - it is why the client PDF is a proof, not
 * a press-ready file.
 */
export function bledPoints(trim: KdpTrim): {width: number; height: number} {
    const box = trimPoints(trim);
    const bleed = KDP_BLEED_IN * POINTS_PER_INCH;
    return {width: box.width + bleed * 2, height: box.height + bleed * 2};
}
