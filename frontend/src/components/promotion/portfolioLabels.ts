/**
 * Translation keys + badge variants for the board's two closed sets
 * (#810). The backend sends the canonical lowercase names; the UI never
 * hardcodes a German or English word for them, so the mapping lives
 * here rather than inline in the matrix.
 */

/** Fallback labels keyed by canonical format name. */
const FORMAT_FALLBACK: Record<string, string> = {
    ebook: "eBook",
    paperback: "Taschenbuch",
    hardcover: "Hardcover",
};

/** Fallback labels keyed by canonical retail status. */
const STATUS_FALLBACK: Record<string, string> = {
    live: "Im Verkauf",
    draft: "Entwurf",
    missing: "Fehlt",
};

export function formatLabelKey(bookFormat: string): [string, string] {
    return [`ui.portfolio.format.${bookFormat}`, FORMAT_FALLBACK[bookFormat] ?? bookFormat];
}

export function statusLabelKey(status: string): [string, string] {
    return [`ui.portfolio.status.${status}`, STATUS_FALLBACK[status] ?? status];
}
