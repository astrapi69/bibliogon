/**
 * KdpPublishingWizard React-layer integration tests (C3).
 *
 * Phase 2 swaps Phase 1's ``useState`` step-index for
 * ``useMachine(kdpWizardMachine)``. Wizard-navigation behaviour
 * is now actor-level (covered by
 * ``machines/kdpWizardMachine.test.ts``); these tests pin the
 * React-layer wiring:
 *
 *   1. mount renders MetadataChecklist + Next is disabled by
 *      machine guard until the child reports onLoaded (sentinel)
 *   2. onLoaded fires → guard passes → ADVANCE → CoverValidation
 *      mounts
 *   3. onValidated fires → guard passes → ADVANCE → ExportPackage
 *      mounts (C2 direct path: cover → export, no pricing / arc)
 *   4. Finish button on the last step calls onClose + resets the
 *      machine
 *   5. Close button (X) calls onClose
 *
 * Per-step component internals (loading spinner / error banner /
 * issue list rendering) are covered in the per-step test files
 * unchanged. Phase 1's 9 wizard-nav DOM tests are deleted: their
 * navigation contract is now actor-level + machine-test-covered.
 */

import {useEffect} from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import KdpPublishingWizard from "./KdpPublishingWizard"
import {BookDetail} from "../../api/client"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

// Module-level mocks: each child fires its result callback on
// mount so the wizard machine's guards pass + Next enables. Per-
// test overrides via ``vi.doMock`` + ``vi.resetModules`` for the
// gated-Next sentinel test below.
// Mock children use empty-deps useEffect (fire-once on mount).
// This mirrors the real per-step components, which depend on
// ``book.id`` rather than the parent-passed callbacks — the
// callbacks close over a stable ``send`` reference from xstate-
// react. Depending on ``onLoaded`` / ``onValidated`` would
// create an infinite render loop: parent re-renders pass a new
// arrow function → effect re-fires → dispatch → re-render.
vi.mock("./MetadataChecklist", () => ({
    default: ({
        onLoaded,
    }: {
        onLoaded?: (
            result: {
                complete: boolean
                error_count: number
                warning_count: number
                issues: never[]
            },
            issuesFiltered: never[],
        ) => void
    }) => {
        useEffect(() => {
            onLoaded?.(
                {
                    complete: true,
                    error_count: 0,
                    warning_count: 0,
                    issues: [],
                },
                [],
            )
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
        return <div data-testid="kdp-publishing-wizard-step-0-metadata" />
    },
}))

vi.mock("./CoverValidation", () => ({
    default: ({
        onValidated,
    }: {
        onValidated?: (
            dim: {width: number; height: number},
            issues: never[],
        ) => void
    }) => {
        useEffect(() => {
            onValidated?.({width: 1600, height: 2560}, [])
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
        return <div data-testid="kdp-publishing-wizard-step-1-cover" />
    },
}))

// PricingStep mock: fires onChange with royalty_plan="70" on
// mount so the machine's hasRequiredPricing guard passes + the
// downstream tests can advance to export.
vi.mock("./PricingStep", () => ({
    default: ({
        onChange,
    }: {
        onChange: (partial: {royalty_plan: "70"}) => void
    }) => {
        useEffect(() => {
            onChange({royalty_plan: "70"})
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
        return <div data-testid="kdp-publishing-wizard-step-2-pricing" />
    },
}))

vi.mock("./ExportPackage", () => ({
    default: () => (
        <div data-testid="kdp-publishing-wizard-step-3-export" />
    ),
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
        chapters: [],
        ...overrides,
    } as BookDetail
}

describe("KdpPublishingWizard (Phase 2 useMachine integration)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("Next disabled when MetadataChecklist doesn't dispatch onLoaded (machine sentinel)", async () => {
        // Override the default mock with one that does NOT fire
        // onLoaded → machine context's metadataResult stays null →
        // canAdvanceFromMetadata guard returns false →
        // snapshot.can({type:'ADVANCE'}) is false → Next disabled.
        vi.doMock("./MetadataChecklist", () => ({
            default: () => (
                <div data-testid="kdp-publishing-wizard-step-0-metadata" />
            ),
        }))
        vi.resetModules()
        const {default: WizardGated} = await import(
            "./KdpPublishingWizard"
        )
        render(
            <WizardGated open book={makeBook()} onClose={vi.fn()} />,
        )
        const next = screen.getByTestId(
            "kdp-publishing-wizard-step-0-next",
        ) as HTMLButtonElement
        expect(next.disabled).toBe(true)
        vi.doUnmock("./MetadataChecklist")
    })

    it("advances metadata → cover when MetadataChecklist reports onLoaded with no errors", () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        // Default mock fires onLoaded on mount → guard passes →
        // Next enables.
        const next = screen.getByTestId(
            "kdp-publishing-wizard-step-0-next",
        ) as HTMLButtonElement
        expect(next.disabled).toBe(false)
        fireEvent.click(next)
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-1-cover"),
        ).toBeTruthy()
    })

    it("advances cover → pricing → export (C8 full Phase 2 path)", () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        // metadata → cover
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-0-next"),
        )
        // cover → pricing (CoverValidation mock fires onValidated)
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-1-next"),
        )
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-2-pricing"),
        ).toBeTruthy()
        // PricingStep mock fires onChange({royalty_plan: "70"}) on
        // mount → hasRequiredPricing guard passes → Next enables.
        const next = screen.getByTestId(
            "kdp-publishing-wizard-step-2-next",
        ) as HTMLButtonElement
        expect(next.disabled).toBe(false)
        fireEvent.click(next)
        // pricing → export
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-3-export"),
        ).toBeTruthy()
    })

    it("Finish on the last step calls onClose", () => {
        const onClose = vi.fn()
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={onClose}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-0-next"),
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-1-next"),
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-next"),
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-3-finish"),
        )
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("Close button (X) calls onClose", () => {
        const onClose = vi.fn()
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={onClose}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-close"),
        )
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
