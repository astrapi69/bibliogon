import { request } from "../http";

/**
 * Promotion-plugin client: the portfolio board's read + write surface
 * (#810, backend #782/#784).
 *
 * Mirrors `bibliogon_promotion.routes` one-for-one. Desktop-only: the
 * board is a server table with no Dexie mirror, so the caller gates the
 * surface through the feature registry (`FEATURES.PORTFOLIO_BOARD`)
 * rather than relying on the offline `guardedFetch` backstop.
 */

/** One format of one book, as the board presents it. */
export interface PortfolioFormatEntry {
    /** Canonical format name: `ebook` | `paperback` | `hardcover`. */
    book_format: string;
    /** `live` on sale, `draft` uploaded, `missing` not created yet. */
    status: string;
    store_url: string | null;
    /** Read from the book's own `asin_*` column, not stored per format. */
    asin: string | null;
}

/** One book row: retail identity plus one entry per canonical format. */
export interface PortfolioBookRow {
    book_id: string;
    title: string;
    author: string | null;
    language: string | null;
    /** The book's publication lifecycle status, not a retail status. */
    status: string | null;
    universal_link: string | null;
    source_identifier: string | null;
    formats: PortfolioFormatEntry[];
    /** Formats that are not on sale, in canonical order. */
    gaps: string[];
}

/** The whole board: the canonical axes plus the rows. */
export interface PortfolioBoard {
    formats: string[];
    statuses: string[];
    books: PortfolioBookRow[];
}

/** Partial write for one format's retail state. */
export interface PortfolioFormatStateUpdate {
    status?: string;
    store_url?: string | null;
    asin?: string | null;
}

/** Board filters. Blank strings are dropped rather than sent empty. */
export interface PortfolioFilters {
    language?: string;
    author?: string;
    gapsOnly?: boolean;
}

function portfolioQuery(filters?: PortfolioFilters): string {
    const params = new URLSearchParams();
    const language = filters?.language?.trim();
    const author = filters?.author?.trim();
    if (language) params.set("language", language);
    if (author) params.set("author", author);
    if (filters?.gapsOnly) params.set("gaps_only", "true");
    const query = params.toString();
    return query ? `?${query}` : "";
}

export const promotion = {
    /** The board, optionally narrowed by language / author / gaps. */
    portfolio: (filters?: PortfolioFilters): Promise<PortfolioBoard> =>
        request<PortfolioBoard>(`/promotion/portfolio${portfolioQuery(filters)}`),

    /** Upsert one format's retail state; returns the updated row. */
    setFormatState: (
        bookId: string,
        bookFormat: string,
        payload: PortfolioFormatStateUpdate,
    ): Promise<PortfolioBookRow> =>
        request<PortfolioBookRow>(
            `/promotion/portfolio/${bookId}/formats/${bookFormat}`,
            { method: "PUT", body: JSON.stringify(payload) },
        ),

    /**
     * Set (or clear) the book-level universal link.
     *
     * An empty string clears it: the backend treats `""` as "no link"
     * and only skips the write when the field is absent, so sending
     * `null` would be indistinguishable from not sending it at all.
     */
    setUniversalLink: (bookId: string, universalLink: string): Promise<PortfolioBookRow> =>
        request<PortfolioBookRow>(`/promotion/portfolio/${bookId}`, {
            method: "PATCH",
            body: JSON.stringify({ universal_link: universalLink }),
        }),
};
