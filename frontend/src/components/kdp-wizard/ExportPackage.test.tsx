/**
 * ExportPackage tests (C4 of KDP Publishing Wizard MVP).
 *
 * Covers:
 *  - idle render: hint + content list + Generate button
 *  - click Generate → generating state → done state with
 *    filename pinned + download fires
 *  - download-again preserves the filename + does NOT re-call
 *    the backend
 *  - API error → error banner + Retry button → retry succeeds
 *  - onCanAdvanceChange(true) fires on mount so the wizard's
 *    contract stays consistent across steps
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import ExportPackage from "./ExportPackage"
import {ApiError, BookDetail} from "../../api/client"
import type {FormatState} from "./machines/types"

function makeFormat(overrides: Partial<FormatState> = {}): FormatState {
    return {kind: "paperback", trim_size: "6x9", margin: "normal", ...overrides}
}

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

const {mockBuildPackage, mockRunKdpPackage, mockUsesClient} = vi.hoisted(() => ({
    mockBuildPackage: vi.fn(),
    mockRunKdpPackage: vi.fn(),
    mockUsesClient: vi.fn(() => false),
}))

// The router is mocked rather than the storage mode, so these tests pin
// what the COMPONENT does with the branch - renders the note, calls the
// router once, passes the wizard's format through - and the branch itself
// is pinned where it lives, in runKdpPackage.test.ts.
vi.mock("../../export/kdp/runKdpPackage", () => ({
    runKdpPackage: mockRunKdpPackage,
    usesClientKdpPackage: mockUsesClient,
}))

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>(
        "../../api/client",
    )
    return {
        ...actual,
        api: {
            ...actual.api,
            kdp: {
                buildPackage: mockBuildPackage,
            },
        },
    }
})

function makeBook(): BookDetail {
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
        repository_url: null,
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
    } as BookDetail
}

describe("ExportPackage", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Online by default, which is what the pre-#741 tests below
        // assume; the offline cases set it themselves.
        mockUsesClient.mockReturnValue(false)
        mockRunKdpPackage.mockImplementation((...args: unknown[]) => {
            const [book, options] = args as [
                {id: string},
                {formatKind: string; trimSize?: string; margin?: string},
            ]
            return mockBuildPackage(book.id, {
                format_kind: options.formatKind,
                trim_size: options.trimSize,
                margin: options.margin,
            })
        })
        // Stub URL.createObjectURL / revokeObjectURL because happy-
        // dom doesn't implement them by default.
        global.URL.createObjectURL = vi.fn(() => "blob:mock-url")
        global.URL.revokeObjectURL = vi.fn()
    })

    it("renders the idle state with the Generate button", () => {
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat()}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-2-export"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-2-generate"),
        ).toBeTruthy()
    })

    it("reports onCanAdvanceChange(true) on mount", () => {
        const onCanAdvanceChange = vi.fn()
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat()}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        expect(onCanAdvanceChange).toHaveBeenCalledWith(true)
    })

    it("click Generate → done state with filename + download fired", async () => {
        const blob = new Blob(["zip-bytes"], {type: "application/zip"})
        mockBuildPackage.mockResolvedValue({
            blob,
            filename: "test-book-kdp-package.zip",
        })
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat()}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-generate"),
        )
        await waitFor(() => {
            expect(
                screen.getByTestId("kdp-publishing-wizard-step-2-done"),
            ).toBeTruthy()
        })
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-2-filename")
                .textContent,
        ).toBe("test-book-kdp-package.zip")
        expect(mockBuildPackage).toHaveBeenCalledWith("book-1", {
            format_kind: "paperback",
            trim_size: "6x9",
            margin: "normal",
        })
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob)
    })

    it("maps the FormatStep selection into the package request body", async () => {
        const blob = new Blob(["zip-bytes"], {type: "application/zip"})
        mockBuildPackage.mockResolvedValue({
            blob,
            filename: "test-book-kdp-package.zip",
        })
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat({
                    kind: "hardcover",
                    trim_size: "8.5x11",
                    margin: "wide",
                })}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-generate"),
        )
        await waitFor(() => {
            expect(mockBuildPackage).toHaveBeenCalledWith("book-1", {
                format_kind: "hardcover",
                trim_size: "8.5x11",
                margin: "wide",
            })
        })
    })

    it("Download Again does NOT re-call the backend", async () => {
        const blob = new Blob(["zip-bytes"], {type: "application/zip"})
        mockBuildPackage.mockResolvedValue({
            blob,
            filename: "test-book-kdp-package.zip",
        })
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat()}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-generate"),
        )
        await waitFor(() => {
            expect(
                screen.getByTestId("kdp-publishing-wizard-step-2-done"),
            ).toBeTruthy()
        })
        expect(mockBuildPackage).toHaveBeenCalledTimes(1)
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-download-again"),
        )
        expect(mockBuildPackage).toHaveBeenCalledTimes(1) // no re-fetch
    })

    it("API error → error banner + Retry button", async () => {
        mockBuildPackage.mockRejectedValueOnce(
            new ApiError(400, "Metadata incomplete", "/kdp/package/book-1", "POST"),
        )
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat()}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-generate"),
        )
        await waitFor(() => {
            expect(
                screen.getByTestId("kdp-publishing-wizard-step-2-error"),
            ).toBeTruthy()
        })
        // Error message surfaces the API detail.
        expect(screen.getByText(/Metadata incomplete/)).toBeTruthy()
        // Retry button exists.
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-2-retry"),
        ).toBeTruthy()
    })

    it("Retry after error → success path runs cleanly", async () => {
        const blob = new Blob(["zip-bytes"], {type: "application/zip"})
        mockBuildPackage
            .mockRejectedValueOnce(
                new ApiError(500, "transient failure", "/kdp/package/book-1", "POST"),
            )
            .mockResolvedValueOnce({
                blob,
                filename: "test-book-kdp-package.zip",
            })
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat()}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-generate"),
        )
        await waitFor(() => {
            expect(
                screen.getByTestId("kdp-publishing-wizard-step-2-error"),
            ).toBeTruthy()
        })
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-retry"),
        )
        await waitFor(() => {
            expect(
                screen.getByTestId("kdp-publishing-wizard-step-2-done"),
            ).toBeTruthy()
        })
        expect(mockBuildPackage).toHaveBeenCalledTimes(2)
    })

    it("says the browser builds the package, before the user clicks", async () => {
        // Before, not after: a proof PDF handed over as press-ready is the
        // wrong surprise, and the step is the last chance to say so.
        mockUsesClient.mockReturnValue(true)
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat()}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        const note = await screen.findByTestId(
            "kdp-publishing-wizard-step-2-client-note",
        )
        expect(note.textContent).toContain("in diesem Browser")
        expect(note.textContent).toContain("Schnittmarken")
    })

    it("keeps the note away when the backend builds the package", () => {
        mockUsesClient.mockReturnValue(false)
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat()}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        expect(
            screen.queryByTestId("kdp-publishing-wizard-step-2-client-note"),
        ).toBeNull()
    })

    it("hands the wizard's format selection to the router, not a default", async () => {
        // The format lives in the wizard's machine; a step that drops it
        // builds a 6x9 paperback for a user who chose a 7x10 hardcover,
        // and nothing in the resulting ZIP would say so.
        mockRunKdpPackage.mockResolvedValue({
            blob: new Blob(["z"]),
            filename: "x-kdp-package.zip",
        })
        render(
            <ExportPackage
                book={makeBook()}
                format={makeFormat({kind: "hardcover", trim_size: "7x10", margin: "wide"})}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-2-generate"),
        )
        await waitFor(() => expect(mockRunKdpPackage).toHaveBeenCalledTimes(1))
        expect(mockRunKdpPackage.mock.calls[0][1]).toEqual({
            formatKind: "hardcover",
            trimSize: "7x10",
            margin: "wide",
        })
    })
})
