/**
 * Unit tests for the pure royalty calculator (pricing.ts).
 *
 * Covers each region's 70%/35%-plan eligibility ranges + the
 * royalty / print-cost / page-count helpers. KDP rule changes
 * propagate through the constants HERE — these tests pin the
 * current values + the formula semantics.
 */

import {describe, it, expect} from "vitest"

import {
    DEFAULT_EBOOK_FILE_SIZE_MB,
    DELIVERY_COST_PER_MB,
    KDP_PAPERBACK_COSTS,
    KDP_REGIONS,
    PAPERBACK_MIN_PAGES,
    PAPERBACK_ROYALTY_RATE,
    REGION_CURRENCIES,
    ROYALTY_70_PRICE_RANGES,
    computeEbookRoyalty35,
    computeEbookRoyalty70,
    computePaperbackPrintCost,
    computePaperbackRoyalty,
    estimatePageCount,
    isEbookRoyalty35Eligible,
    isEbookRoyalty70Eligible,
} from "./pricing"

describe("KDP_REGIONS constants", () => {
    it("ships 5 regions per A14", () => {
        expect(KDP_REGIONS).toEqual(["US", "EU", "UK", "JP", "IN"])
    })

    it("every region has a currency + delivery rate + 70-plan range", () => {
        for (const r of KDP_REGIONS) {
            expect(REGION_CURRENCIES[r]).toBeDefined()
            expect(DELIVERY_COST_PER_MB[r]).toBeGreaterThan(0)
            expect(ROYALTY_70_PRICE_RANGES[r]).toBeDefined()
        }
    })
})

describe("70%-plan eligibility", () => {
    it("US: $2.99 is the lower bound (inclusive)", () => {
        expect(isEbookRoyalty70Eligible(2.99, "US")).toBe(true)
        expect(isEbookRoyalty70Eligible(2.98, "US")).toBe(false)
    })

    it("US: $9.99 is the upper bound (inclusive)", () => {
        expect(isEbookRoyalty70Eligible(9.99, "US")).toBe(true)
        expect(isEbookRoyalty70Eligible(10.0, "US")).toBe(false)
    })

    it("JP uses local-currency bounds (250–1200 JPY)", () => {
        expect(isEbookRoyalty70Eligible(250, "JP")).toBe(true)
        expect(isEbookRoyalty70Eligible(1200, "JP")).toBe(true)
        expect(isEbookRoyalty70Eligible(249, "JP")).toBe(false)
        expect(isEbookRoyalty70Eligible(1201, "JP")).toBe(false)
    })
})

describe("35%-plan eligibility", () => {
    it("US: $0.99 is the lower bound", () => {
        expect(isEbookRoyalty35Eligible(0.99, "US")).toBe(true)
        expect(isEbookRoyalty35Eligible(0.98, "US")).toBe(false)
    })

    it("US: $200.00 is the upper bound", () => {
        expect(isEbookRoyalty35Eligible(200.0, "US")).toBe(true)
        expect(isEbookRoyalty35Eligible(200.01, "US")).toBe(false)
    })
})

describe("ebook royalty computation", () => {
    it("70%-plan: $4.99 at 1.5MB returns 0.70 * (4.99 - 0.225) = 3.34", () => {
        const royalty = computeEbookRoyalty70(4.99, 1.5, "US")
        expect(royalty).toBeCloseTo(0.7 * (4.99 - 0.225), 2)
    })

    it("70%-plan: returns 0 when price is outside the range", () => {
        expect(computeEbookRoyalty70(1.99, 1.5, "US")).toBe(0)
        expect(computeEbookRoyalty70(10.0, 1.5, "US")).toBe(0)
    })

    it("35%-plan: $1.99 returns 0.35 * 1.99 = 0.697 (price below 70-eligibility)", () => {
        expect(computeEbookRoyalty35(1.99, "US")).toBeCloseTo(0.6965, 4)
    })

    it("35%-plan: returns 0 outside the wider 35%-range", () => {
        expect(computeEbookRoyalty35(0.5, "US")).toBe(0)
        expect(computeEbookRoyalty35(250, "US")).toBe(0)
    })

    it("default file size constant is documented", () => {
        expect(DEFAULT_EBOOK_FILE_SIZE_MB).toBeGreaterThan(0)
        expect(DEFAULT_EBOOK_FILE_SIZE_MB).toBeLessThan(10)
    })
})

describe("paperback print cost", () => {
    it("B&W: 100 pages = $0.85 + $0.012*100 = $2.05", () => {
        expect(computePaperbackPrintCost(100, "bw")).toBeCloseTo(2.05, 2)
    })

    it("Color: 100 pages = $0.85 + $0.07*100 = $7.85", () => {
        expect(computePaperbackPrintCost(100, "color")).toBeCloseTo(7.85, 2)
    })

    it("clamps to KDP's 24-page minimum even when given fewer", () => {
        expect(computePaperbackPrintCost(10, "bw")).toBeCloseTo(
            KDP_PAPERBACK_COSTS.bw.fixed +
                KDP_PAPERBACK_COSTS.bw.per_page * PAPERBACK_MIN_PAGES,
            2,
        )
    })

    it("default ink is B&W", () => {
        expect(computePaperbackPrintCost(100)).toBe(
            computePaperbackPrintCost(100, "bw"),
        )
    })
})

describe("paperback royalty", () => {
    it("$9.99 / 100 pages B&W: 0.60 * 9.99 - 2.05 = $3.944", () => {
        const royalty = computePaperbackRoyalty(9.99, 100, "bw")
        const expected = PAPERBACK_ROYALTY_RATE * 9.99 - 2.05
        expect(royalty).toBeCloseTo(expected, 2)
    })

    it("returns negative when list price < print cost", () => {
        // $1.00 / 500 pages B&W: 0.60 * 1.00 - (0.85 + 6.00) = -6.25
        const royalty = computePaperbackRoyalty(1.0, 500, "bw")
        expect(royalty).toBeLessThan(0)
    })
})

describe("page-count estimator (A22)", () => {
    it("clamps to KDP's 24-page minimum on small books", () => {
        expect(estimatePageCount(0)).toBe(PAPERBACK_MIN_PAGES)
        expect(estimatePageCount(1)).toBe(PAPERBACK_MIN_PAGES)
    })

    it("10 chapters ≈ 100 pages (10 chapters * 2500 words / 250 words/page)", () => {
        expect(estimatePageCount(10)).toBe(100)
    })

    it("20 chapters ≈ 200 pages", () => {
        expect(estimatePageCount(20)).toBe(200)
    })
})
