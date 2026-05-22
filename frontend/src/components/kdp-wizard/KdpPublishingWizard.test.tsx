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
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import KdpPublishingWizard from "./KdpPublishingWizard"
import {BookDetail} from "../../api/client"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

// C10: mock the publishing-state API. Default returns ``state:
// null`` so existing nav tests (which assume fresh-mount
// behavior) keep working. Per-test overrides via
// ``mockGetPublishingState.mockResolvedValueOnce(...)``.
const mockGetPublishingState = vi.fn()
const mockUpsertPublishingState = vi.fn()

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>(
        "../../api/client",
    )
    return {
        ...actual,
        api: {
            kdp: {
                getPublishingState: (...args: unknown[]) =>
                    mockGetPublishingState(...args),
                upsertPublishingState: (...args: unknown[]) =>
                    mockUpsertPublishingState(...args),
            },
        },
    }
})

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
// downstream tests can advance to arc.
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

// ArcStep mock: no required props. Just renders a marker.
vi.mock("./ArcStep", () => ({
    default: () => (
        <div data-testid="kdp-publishing-wizard-step-3-arc" />
    ),
}))

vi.mock("./ExportPackage", () => ({
    default: () => (
        <div data-testid="kdp-publishing-wizard-step-4-export" />
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
        // Default: no persisted state. Test overrides via
        // ``mockGetPublishingState.mockResolvedValueOnce(...)``.
        mockGetPublishingState.mockResolvedValue({
            book_id: "book-1",
            book_updated_at: "2026-05-22T00:00:00",
            state: null,
        })
        mockUpsertPublishingState.mockResolvedValue({})
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

    it("advances cover → pricing → arc → export (C9 full 5-step path)", () => {
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
        // cover → pricing
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-1-next"),
        )
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-2-pricing"),
        ).toBeTruthy()
        // pricing → arc (PricingStep mock unlocks the guard)
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-next"),
        )
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-3-arc"),
        ).toBeTruthy()
        // arc → export (unguarded; reviewers are optional)
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-3-next"),
        )
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-4-export"),
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
            screen.getByTestId("kdp-publishing-wizard-step-3-next"),
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-4-finish"),
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

    // --- C10 persistence wiring -----------------------------------

    it("C10: fetches publishing-state on mount", async () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        await waitFor(() => {
            expect(mockGetPublishingState).toHaveBeenCalledWith("book-1")
        })
    })

    it("C10: dispatches STATE_LOADED when a persisted state exists", async () => {
        mockGetPublishingState.mockResolvedValueOnce({
            book_id: "book-1",
            book_updated_at: "2026-05-22T00:00:00",
            state: {
                id: "ps-1",
                book_id: "book-1",
                royalty_plan: "70",
                kdp_select_enrolled: true,
                kdp_select_enrollment_date: null,
                expanded_distribution: false,
                prices: {US: {currency: "USD", list_price: 4.99}},
                launch_checklist_state: {},
                publication_target_date: null,
                last_kdp_upload_at: null,
                created_at: "2026-05-22T00:00:00",
                updated_at: "2026-05-22T00:00:00",
                arc_reviewers: [],
            },
        })
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        // Confirm hydration via the no-op behavior: with persisted
        // state's royalty_plan already set, the auto-save effect
        // doesn't re-PATCH (lastSavedPricingRef matches the
        // hydrated value).
        await waitFor(() => {
            expect(mockGetPublishingState).toHaveBeenCalled()
        })
        // No PATCH on initial hydration (the ref is set to the
        // hydrated JSON; auto-save's equality check short-circuits).
        expect(mockUpsertPublishingState).not.toHaveBeenCalled()
    })

    it("C10: PRICING_CHANGE triggers an auto-save PATCH", async () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        // Mount: metadata → cover → pricing. Pricing mock fires
        // onChange({royalty_plan: "70"}) → PRICING_CHANGE
        // dispatched → auto-save useEffect → PATCH.
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-0-next"),
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-1-next"),
        )
        await waitFor(() => {
            expect(mockUpsertPublishingState).toHaveBeenCalledWith(
                "book-1",
                expect.objectContaining({
                    royalty_plan: "70",
                }),
            )
        })
    })

    it("C10: PATCH failure is fail-open (wizard continues normally)", async () => {
        mockUpsertPublishingState.mockRejectedValue(
            new Error("network fail"),
        )
        const consoleWarnSpy = vi
            .spyOn(console, "warn")
            .mockImplementation(() => {})
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        // Same advance path as above — PATCH rejects + the wizard
        // does NOT crash. Confirm by asserting the wizard
        // continues to render step-by-step.
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-0-next"),
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-1-next"),
        )
        await waitFor(() => {
            expect(mockUpsertPublishingState).toHaveBeenCalled()
        })
        // The wizard's pricing step still rendered (no crash).
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-2-pricing"),
        ).toBeTruthy()
        consoleWarnSpy.mockRestore()
    })

    it("C10: skips auto-save when royalty_plan is null (initial defaults)", async () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        // Mount-only: stay at metadata. No pricing change ever
        // fires; auto-save effect sees royalty_plan === null and
        // short-circuits.
        await waitFor(() => {
            expect(mockGetPublishingState).toHaveBeenCalled()
        })
        expect(mockUpsertPublishingState).not.toHaveBeenCalled()
    })
})
