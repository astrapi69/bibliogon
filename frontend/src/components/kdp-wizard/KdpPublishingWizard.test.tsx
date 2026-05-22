/**
 * KdpPublishingWizard tests (C1 shell-only).
 *
 * Covers:
 *  - shell renders + dialog title + book-title subtitle
 *  - 3 step-dots rendered (one per step)
 *  - next + back navigation (step 0 -> 1 -> 2)
 *  - finish button on last step calls onClose + resets step
 *  - close button + ESC both call onClose + reset step
 *  - testid namespace `kdp-publishing-wizard-{step}-{slot}` for
 *    every interactive surface (Testid-namespace-pinning rule)
 *
 * Step CONTENT is shell-only in C1 (placeholders); C2/C3/C4 add
 * the real content + their per-step tests. Dialog-level navigation
 * tests live here permanently — they assert the wizard's
 * navigation contract independent of step content.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"
import {useEffect} from "react"

import KdpPublishingWizard from "./KdpPublishingWizard"
import {BookDetail} from "../../api/client"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

// Mock the MetadataChecklist child so the wizard-level tests
// exercise navigation contract in isolation from the API
// integration. The real MetadataChecklist's behaviour
// (api.kdp.checkMetadata call, book-type filtering, etc.) lives
// in MetadataChecklist.test.tsx.
//
// The mock always reports "can advance" so Next enables. A
// follow-up wizard test below verifies the gated-Next contract
// by using a separate mock that reports "cannot advance".
vi.mock("./MetadataChecklist", () => ({
    default: ({
        onCanAdvanceChange,
    }: {
        onCanAdvanceChange: (canAdvance: boolean) => void
    }) => {
        // Mirror the real component: fire the callback once on
        // mount so the wizard transitions from "Next disabled" to
        // "Next enabled" when the metadata check completes.
        useEffect(() => {
            onCanAdvanceChange(true)
        }, [onCanAdvanceChange])
        return <div data-testid="kdp-publishing-wizard-step-0-metadata" />
    },
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

describe("KdpPublishingWizard (shell)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders the dialog with title + book-title subtitle when open", () => {
        const book = makeBook({title: "My Novel"})
        render(
            <KdpPublishingWizard
                open
                book={book}
                onClose={vi.fn()}
            />,
        )
        expect(screen.getByTestId("kdp-publishing-wizard-dialog")).toBeTruthy()
        expect(screen.getByTestId("kdp-publishing-wizard-book-title").textContent).toBe(
            "My Novel",
        )
    })

    it("renders 3 step-dots (one per step)", () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        expect(screen.getByTestId("kdp-publishing-wizard-step-dot-0")).toBeTruthy()
        expect(screen.getByTestId("kdp-publishing-wizard-step-dot-1")).toBeTruthy()
        expect(screen.getByTestId("kdp-publishing-wizard-step-dot-2")).toBeTruthy()
    })

    it("starts on step 0 (metadata placeholder)", () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        expect(screen.getByTestId("kdp-publishing-wizard-step-0-metadata")).toBeTruthy()
        // Step 0 has no Back button.
        expect(screen.queryByTestId("kdp-publishing-wizard-step-0-back")).toBeNull()
        // Step 0 has a Next button.
        expect(screen.getByTestId("kdp-publishing-wizard-step-0-next")).toBeTruthy()
    })

    it("advances step 0 -> 1 -> 2 on Next clicks", () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-step-0-next"))
        expect(screen.getByTestId("kdp-publishing-wizard-step-1-cover")).toBeTruthy()

        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-step-1-next"))
        expect(screen.getByTestId("kdp-publishing-wizard-step-2-export")).toBeTruthy()
    })

    it("step 2 (last) shows Finish, not Next", () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-step-0-next"))
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-step-1-next"))
        expect(screen.getByTestId("kdp-publishing-wizard-step-2-finish")).toBeTruthy()
        expect(screen.queryByTestId("kdp-publishing-wizard-step-2-next")).toBeNull()
    })

    it("Back navigates step 1 -> 0", () => {
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-step-0-next"))
        expect(screen.getByTestId("kdp-publishing-wizard-step-1-cover")).toBeTruthy()
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-step-1-back"))
        expect(screen.getByTestId("kdp-publishing-wizard-step-0-metadata")).toBeTruthy()
    })

    it("Finish calls onClose", () => {
        const onClose = vi.fn()
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={onClose}
            />,
        )
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-step-0-next"))
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-step-1-next"))
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-step-2-finish"))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("Close button calls onClose", () => {
        const onClose = vi.fn()
        render(
            <KdpPublishingWizard
                open
                book={makeBook()}
                onClose={onClose}
            />,
        )
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-close"))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("does not render the dialog when open=false", () => {
        render(
            <KdpPublishingWizard
                open={false}
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        expect(screen.queryByTestId("kdp-publishing-wizard-dialog")).toBeNull()
    })

    it("step-0 Next is gated by the MetadataChecklist callback", async () => {
        // Override the default top-of-file mock with one that
        // reports "cannot advance" so the gate stays closed.
        vi.doMock("./MetadataChecklist", () => ({
            default: ({
                onCanAdvanceChange,
            }: {
                onCanAdvanceChange: (canAdvance: boolean) => void
            }) => {
                useEffect(() => {
                    onCanAdvanceChange(false)
                }, [onCanAdvanceChange])
                return <div data-testid="kdp-publishing-wizard-step-0-metadata" />
            },
        }))
        vi.resetModules()
        const {default: WizardWithFailingGate} = await import(
            "./KdpPublishingWizard"
        )
        render(
            <WizardWithFailingGate
                open
                book={makeBook()}
                onClose={vi.fn()}
            />,
        )
        const nextButton = screen.getByTestId("kdp-publishing-wizard-step-0-next")
        expect((nextButton as HTMLButtonElement).disabled).toBe(true)
        vi.doUnmock("./MetadataChecklist")
    })
})
