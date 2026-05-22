/**
 * KDP royalty calculator (pure functions, no React imports).
 *
 * Constants are Amazon-dictated, not user-editable. Approximate
 * values for v1; the precise per-region delivery cost path is
 * filed as ``KDP-PRICING-PRECISE-FILE-SIZE-01`` (P5 follow-up).
 *
 * The wizard's PricingStep calls these to compute royalties
 * client-side per ``A15`` (no backend roundtrip). When KDP
 * changes a rule, update HERE — single source of truth on the
 * frontend, paralleling ``KDP_REQ`` in CoverValidation.tsx.
 *
 * Test coverage in pricing.test.ts.
 */

import type {CurrencyCode, RegionCode} from "./machines/types"

export const KDP_REGIONS = ["US", "EU", "UK", "JP", "IN"] as const

export const REGION_CURRENCIES: Record<RegionCode, CurrencyCode> = {
    US: "USD",
    EU: "EUR",
    UK: "GBP",
    JP: "JPY",
    IN: "INR",
}

/** Display labels for each region (used in the PricingStep UI). */
export const REGION_LABELS: Record<RegionCode, string> = {
    US: "United States",
    EU: "Europe",
    UK: "United Kingdom",
    JP: "Japan",
    IN: "India",
}

/** 70%-plan eligibility ranges in each region's local currency.
 *  Outside these ranges, the book falls back to 35%-plan. */
export const ROYALTY_70_PRICE_RANGES: Record<
    RegionCode,
    {min: number; max: number}
> = {
    US: {min: 2.99, max: 9.99},
    EU: {min: 2.99, max: 9.99},
    UK: {min: 1.99, max: 7.99},
    JP: {min: 250, max: 1200},
    IN: {min: 100, max: 999},
}

/** 35%-plan eligibility ranges (broader, lower-end). */
export const ROYALTY_35_PRICE_RANGES: Record<
    RegionCode,
    {min: number; max: number}
> = {
    US: {min: 0.99, max: 200.0},
    EU: {min: 0.99, max: 200.0},
    UK: {min: 0.99, max: 200.0},
    JP: {min: 99, max: 20000},
    IN: {min: 49, max: 20000},
}

/** Delivery cost per MB in each region's local currency
 *  (70%-plan only). Source: KDP help center. v1 approximate. */
export const DELIVERY_COST_PER_MB: Record<RegionCode, number> = {
    US: 0.15,
    EU: 0.12,
    UK: 0.1,
    JP: 1.0,
    IN: 7.0,
}

/** Paperback print costs (US marketplace, B&W standard +
 *  premium color). Other marketplaces ≈ same after FX. */
export const KDP_PAPERBACK_COSTS = {
    bw: {fixed: 0.85, per_page: 0.012},
    color: {fixed: 0.85, per_page: 0.07},
} as const

/** Paperback royalty rate is fixed; no plan choice. */
export const PAPERBACK_ROYALTY_RATE = 0.6

/** KDP enforces a 24-page minimum on paperbacks. */
export const PAPERBACK_MIN_PAGES = 24

/** Default ebook file size used for delivery-cost calc when no
 *  real export size is available. ~1.5 MB matches the typical
 *  Bibliogon-produced EPUB; precise per-export sizing is filed
 *  as ``KDP-PRICING-PRECISE-FILE-SIZE-01`` (P5). */
export const DEFAULT_EBOOK_FILE_SIZE_MB = 1.5

export type PaperbackInkType = "bw" | "color"

/** Is the list price eligible for the 70%-royalty plan in this
 *  region? */
export function isEbookRoyalty70Eligible(
    listPrice: number,
    region: RegionCode,
): boolean {
    const range = ROYALTY_70_PRICE_RANGES[region]
    return listPrice >= range.min && listPrice <= range.max
}

/** Is the list price eligible for the 35%-royalty plan in this
 *  region? */
export function isEbookRoyalty35Eligible(
    listPrice: number,
    region: RegionCode,
): boolean {
    const range = ROYALTY_35_PRICE_RANGES[region]
    return listPrice >= range.min && listPrice <= range.max
}

/** 70%-plan ebook royalty per unit in the region's local
 *  currency. Returns 0 when the price is outside the
 *  70%-eligibility range. */
export function computeEbookRoyalty70(
    listPrice: number,
    fileSizeMb: number,
    region: RegionCode,
): number {
    if (!isEbookRoyalty70Eligible(listPrice, region)) return 0
    const delivery = DELIVERY_COST_PER_MB[region] * fileSizeMb
    return 0.7 * (listPrice - delivery)
}

/** 35%-plan ebook royalty per unit in the region's local
 *  currency. Returns 0 when the price is outside the
 *  35%-eligibility range. */
export function computeEbookRoyalty35(
    listPrice: number,
    region: RegionCode,
): number {
    if (!isEbookRoyalty35Eligible(listPrice, region)) return 0
    return 0.35 * listPrice
}

/** Paperback print cost in USD (KDP's canonical marketplace).
 *  Per-page costs scale with page count; fixed cost is constant. */
export function computePaperbackPrintCost(
    pageCount: number,
    ink: PaperbackInkType = "bw",
): number {
    const c = KDP_PAPERBACK_COSTS[ink]
    return c.fixed + c.per_page * Math.max(PAPERBACK_MIN_PAGES, pageCount)
}

/** Paperback royalty per unit in USD. May be negative if the
 *  list price is too low to recover the print cost. */
export function computePaperbackRoyalty(
    listPrice: number,
    pageCount: number,
    ink: PaperbackInkType = "bw",
): number {
    const printCost = computePaperbackPrintCost(pageCount, ink)
    return PAPERBACK_ROYALTY_RATE * listPrice - printCost
}

/** Estimate paperback page count from a book's chapter count
 *  per A22. Heuristic: ~2500 words/chapter ÷ ~250 words/page =
 *  ~10 pages/chapter. KDP minimum of 24 pages enforced. */
export const WORDS_PER_PAGE = 250
export const ESTIMATED_WORDS_PER_CHAPTER = 2500

export function estimatePageCount(chapterCount: number): number {
    const estimated =
        (chapterCount * ESTIMATED_WORDS_PER_CHAPTER) / WORDS_PER_PAGE
    return Math.max(PAPERBACK_MIN_PAGES, Math.round(estimated))
}
