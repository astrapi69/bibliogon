/**
 * PricingStep component tests (C8).
 *
 * Covers the controlled-component contract: ``pricing`` prop is
 * the source of truth; user interactions fire ``onChange`` with
 * partial updates. Royalty math is centralized in pricing.ts +
 * unit-tested there; this file pins the UI wiring (correct
 * inputs / outputs / book-type gating).
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {
    render as rtlRender,
    screen,
    fireEvent,
    type RenderOptions,
} from "@testing-library/react"

import PricingStep from "./PricingStep"
import {BookDetail, type BookTypeDef} from "../../api/client"
import type {PricingState} from "./machines/types"
import {BookTypesProvider} from "../../hooks/useBookTypes"

// BOOK-TYPES-SSOT-YAML-01 C7: PricingStep now reads
// capabilities.ebook_export from the registry instead of the
// hardcoded isEbookSupported helper.
const TEST_BOOK_TYPES: Record<string, BookTypeDef> = {
    prose: {
        id: "prose",
        label_key: "ui.get_started.book_type_prose_title",
        description_key: "ui.get_started.book_type_prose_desc",
        icon: "BookOpen",
        content_model: "chapters",
        editor_component: "BookEditor",
        capabilities: {
            ebook_export: true,
            paperback_export: true,
            hardcover_export: true,
            audiobook_export: true,
            template_catalog: true,
            kdp_package_supported: true,
        },
        dashboard_create_visible: true,
        immutable_after_create: true,
        default_page_size: null,
    },
    picture_book: {
        id: "picture_book",
        label_key: "ui.get_started.book_type_picture_title",
        description_key: "ui.get_started.book_type_picture_desc",
        icon: "Image",
        content_model: "pages",
        editor_component: "PageEditor",
        capabilities: {
            ebook_export: false,
            paperback_export: true,
            hardcover_export: false,
            audiobook_export: false,
            template_catalog: false,
            kdp_package_supported: true,
        },
        dashboard_create_visible: true,
        immutable_after_create: true,
        default_page_size: "8.5x8.5",
    },
    comic_book: {
        id: "comic_book",
        label_key: "ui.get_started.book_type_comic_title",
        description_key: "ui.get_started.book_type_comic_desc",
        icon: "Layers",
        content_model: "pages",
        editor_component: "ComicBookEditor",
        capabilities: {
            ebook_export: false,
            paperback_export: true,
            hardcover_export: false,
            audiobook_export: false,
            template_catalog: false,
            kdp_package_supported: true,
        },
        dashboard_create_visible: true,
        immutable_after_create: true,
        default_page_size: "7x10",
    },
}

function render(ui: React.ReactElement, options?: RenderOptions) {
    return rtlRender(ui, {
        wrapper: ({children}) => (
            <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                {children}
            </BookTypesProvider>
        ),
        ...options,
    })
}

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

function makeBook(overrides: Partial<BookDetail> = {}): BookDetail {
    return {
        id: "book-1",
        title: "Test Book",
        subtitle: null,
        author: "Test Author",
        language: "en",
        series: null,
        series_index: null,
        description: null,
        book_idea: null,
        expose: null,
        genre: null,
        book_type: "prose",
        edition: null,
        publisher: null,
        publisher_city: null,
        publish_date: null,
        isbn_ebook: null,
        isbn_paperback: null,
        isbn_hardcover: null,
        asin_ebook: null,
        asin_paperback: null,
        asin_hardcover: null,
        keywords: [],
        categories: [],
        bisac_codes: [],
        html_description: null,
        backpage_description: null,
        backpage_author_bio: null,
        cover_image: null,
        custom_css: null,
        cover_image_prompt: null,
        chapter_summaries: [],
        ai_assisted: false,
        ai_tokens_used: 0,
        tts_engine: null,
        tts_voice: null,
        tts_language: null,
        tts_speed: null,
        audiobook_merge: null,
        audiobook_filename: null,
        audiobook_overwrite_existing: false,
        audiobook_skip_chapter_types: [],
        translation_group_id: null,
        ms_tools_max_sentence_length: null,
        ms_tools_repetition_window: null,
        ms_tools_max_filler_ratio: null,
        created_at: "2026-05-22T00:00:00",
        updated_at: "2026-05-22T00:00:00",
        chapters: [
            {id: "c1", title: "Ch 1", position: 1, chapter_type: "chapter"},
            {id: "c2", title: "Ch 2", position: 2, chapter_type: "chapter"},
            {id: "c3", title: "Ch 3", position: 3, chapter_type: "chapter"},
            {id: "c4", title: "Ch 4", position: 4, chapter_type: "chapter"},
            {id: "c5", title: "Ch 5", position: 5, chapter_type: "chapter"},
            {id: "c6", title: "Ch 6", position: 6, chapter_type: "chapter"},
            {id: "c7", title: "Ch 7", position: 7, chapter_type: "chapter"},
            {id: "c8", title: "Ch 8", position: 8, chapter_type: "chapter"},
            {id: "c9", title: "Ch 9", position: 9, chapter_type: "chapter"},
            {id: "c10", title: "Ch 10", position: 10, chapter_type: "chapter"},
        ],
        ...overrides,
    } as BookDetail
}

function emptyPricing(): PricingState {
    return {
        royalty_plan: null,
        kdp_select_enrolled: false,
        expanded_distribution: false,
        prices: {},
    }
}

describe("PricingStep", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders both royalty plan radios with neither selected initially", () => {
        render(
            <PricingStep
                book={makeBook()}
                pricing={emptyPricing()}
                onChange={vi.fn()}
            />,
        )
        const r35 = screen.getByTestId(
            "kdp-publishing-wizard-step-2-royalty-35",
        ) as HTMLInputElement
        const r70 = screen.getByTestId(
            "kdp-publishing-wizard-step-2-royalty-70",
        ) as HTMLInputElement
        expect(r35.checked).toBe(false)
        expect(r70.checked).toBe(false)
    })

    it("clicking the 70% radio fires onChange with royalty_plan='70'", () => {
        const onChange = vi.fn()
        render(
            <PricingStep
                book={makeBook()}
                pricing={emptyPricing()}
                onChange={onChange}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-royalty-70"),
        )
        expect(onChange).toHaveBeenCalledWith({royalty_plan: "70"})
    })

    it("clicking the 35% radio fires onChange with royalty_plan='35'", () => {
        const onChange = vi.fn()
        render(
            <PricingStep
                book={makeBook()}
                pricing={emptyPricing()}
                onChange={onChange}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-royalty-35"),
        )
        expect(onChange).toHaveBeenCalledWith({royalty_plan: "35"})
    })

    it("renders all 5 KDP regions in the ebook table for prose books", () => {
        render(
            <PricingStep
                book={makeBook({book_type: "prose"})}
                pricing={emptyPricing()}
                onChange={vi.fn()}
            />,
        )
        for (const region of ["US", "EU", "UK", "JP", "IN"]) {
            expect(
                screen.getByTestId(
                    `kdp-publishing-wizard-step-2-region-${region}`,
                ),
            ).toBeTruthy()
        }
    })

    it("hides the ebook section for picture_book (KDP doesn't accept WeasyPrint PDF as ebook)", () => {
        render(
            <PricingStep
                book={makeBook({book_type: "picture_book"})}
                pricing={emptyPricing()}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.queryByTestId(
                "kdp-publishing-wizard-step-2-ebook-section",
            ),
        ).toBeNull()
    })

    it("hides the ebook section for comic_book", () => {
        render(
            <PricingStep
                book={makeBook({book_type: "comic_book"})}
                pricing={emptyPricing()}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.queryByTestId(
                "kdp-publishing-wizard-step-2-ebook-section",
            ),
        ).toBeNull()
    })

    it("US price input firing onChange with the partial prices update", () => {
        const onChange = vi.fn()
        render(
            <PricingStep
                book={makeBook()}
                pricing={emptyPricing()}
                onChange={onChange}
            />,
        )
        fireEvent.change(
            screen.getByTestId("kdp-publishing-wizard-step-2-price-US"),
            {target: {value: "4.99"}},
        )
        expect(onChange).toHaveBeenCalledWith({
            prices: {US: {currency: "USD", list_price: 4.99}},
        })
    })

    it("renders computed royalty for a 70% plan + $4.99 US price", () => {
        const pricing: PricingState = {
            royalty_plan: "70",
            kdp_select_enrolled: false,
            expanded_distribution: false,
            prices: {US: {currency: "USD", list_price: 4.99}},
        }
        render(
            <PricingStep
                book={makeBook()}
                pricing={pricing}
                onChange={vi.fn()}
            />,
        )
        const royalty = screen.getByTestId(
            "kdp-publishing-wizard-step-2-royalty-US",
        )
        // 0.70 * (4.99 - 0.225) = ~$3.34
        expect(royalty.textContent).toContain("$3.34")
    })

    it("shows '70% nicht möglich' when 70% picked but price is outside the range", () => {
        const pricing: PricingState = {
            royalty_plan: "70",
            kdp_select_enrolled: false,
            expanded_distribution: false,
            prices: {US: {currency: "USD", list_price: 1.99}},
        }
        render(
            <PricingStep
                book={makeBook()}
                pricing={pricing}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId(
                "kdp-publishing-wizard-step-2-ineligible-US",
            ),
        ).toBeTruthy()
    })

    it("expanded-distribution toggle only renders when 35-plan is picked", () => {
        const {rerender} = render(
            <PricingStep
                book={makeBook()}
                pricing={emptyPricing()}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.queryByTestId(
                "kdp-publishing-wizard-step-2-expanded-distribution",
            ),
        ).toBeNull()

        rerender(
            <PricingStep
                book={makeBook()}
                pricing={{...emptyPricing(), royalty_plan: "35"}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId(
                "kdp-publishing-wizard-step-2-expanded-distribution",
            ),
        ).toBeTruthy()
    })

    it("paperback page count defaults from chapter count via estimatePageCount", () => {
        // 10 chapters → ~100 pages per the heuristic.
        render(
            <PricingStep
                book={makeBook()}
                pricing={emptyPricing()}
                onChange={vi.fn()}
            />,
        )
        const pageCountInput = screen.getByTestId(
            "kdp-publishing-wizard-step-2-page-count",
        ) as HTMLInputElement
        expect(pageCountInput.value).toBe("100")
    })

    it("paperback print cost rendered for the estimated page count", () => {
        render(
            <PricingStep
                book={makeBook()}
                pricing={emptyPricing()}
                onChange={vi.fn()}
            />,
        )
        const printCost = screen.getByTestId(
            "kdp-publishing-wizard-step-2-print-cost",
        )
        // 100 pages B&W: $0.85 + $0.012*100 = $2.05
        expect(printCost.textContent).toContain("$2.05")
    })
})
