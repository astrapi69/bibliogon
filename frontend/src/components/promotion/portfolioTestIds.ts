/**
 * The portfolio board's test-id namespace, in one place (#810).
 *
 * Every interactive surface of the board addresses itself through this
 * map, so the E2E spec's positive-coverage walk and the component specs
 * read from the same contract instead of repeating string literals.
 *
 * Note for selector authors: the per-cell ids share a prefix with the
 * controls inside them (`…-cell-b1-ebook` vs `…-cell-status-b1-ebook`),
 * so a `[data-testid^="portfolio-board-cell-"]` selector overmatches.
 * Address them exactly, as the specs do.
 *
 * @example
 * screen.getByTestId(portfolioTestId.cell("b1", "ebook"));
 */

export const PORTFOLIO_NS = "portfolio-board";

const ns = (suffix: string) => `${PORTFOLIO_NS}-${suffix}`;

export const portfolioTestId = {
    page: PORTFOLIO_NS,
    loading: ns("loading"),
    disabled: ns("disabled"),
    empty: ns("empty"),
    noMatches: ns("no-matches"),
    reload: ns("reload"),
    matrix: ns("matrix"),
    filterAuthor: ns("filter-author"),
    filterLanguage: ns("filter-language"),
    filterGaps: ns("filter-gaps"),
    filterReset: ns("filter-reset"),
    column: (bookFormat: string) => ns(`column-${bookFormat}`),
    row: (bookId: string) => ns(`row-${bookId}`),
    title: (bookId: string) => ns(`title-${bookId}`),
    gaps: (bookId: string) => ns(`gaps-${bookId}`),
    cell: (bookId: string, bookFormat: string) => ns(`cell-${bookId}-${bookFormat}`),
    cellStatus: (bookId: string, bookFormat: string) => ns(`cell-status-${bookId}-${bookFormat}`),
    cellLink: (bookId: string, bookFormat: string) => ns(`cell-link-${bookId}-${bookFormat}`),
    cellAsin: (bookId: string, bookFormat: string) => ns(`cell-asin-${bookId}-${bookFormat}`),
    cellEdit: (bookId: string, bookFormat: string) => ns(`cell-edit-${bookId}-${bookFormat}`),
    cellUrl: (bookId: string, bookFormat: string) => ns(`cell-url-${bookId}-${bookFormat}`),
    cellUrlSave: (bookId: string, bookFormat: string) =>
        ns(`cell-url-save-${bookId}-${bookFormat}`),
    cellUrlCancel: (bookId: string, bookFormat: string) =>
        ns(`cell-url-cancel-${bookId}-${bookFormat}`),
    universalLink: (bookId: string) => ns(`universal-link-${bookId}`),
    universalLinkSave: (bookId: string) => ns(`universal-link-save-${bookId}`),
} as const;
