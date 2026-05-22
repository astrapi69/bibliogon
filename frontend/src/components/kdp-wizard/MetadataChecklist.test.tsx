/**
 * MetadataChecklist tests (C2 of KDP Publishing Wizard MVP).
 *
 * Covers:
 *  - loading state on initial render
 *  - happy-path: no issues → onCanAdvanceChange(true) + summary-ok
 *  - failure: errors present → onCanAdvanceChange(false) + summary-fail
 *  - warnings render in their own list + warning-count badge
 *  - book-type filter: picture_book + comic_book drop the
 *    "chapters" error so onCanAdvanceChange can fire true
 *  - API error path → error banner + onCanAdvanceChange(false)
 *  - request payload shape: arrays vs strings, book.id-keyed
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, waitFor} from "@testing-library/react"

import MetadataChecklist from "./MetadataChecklist"
import {BookDetail, KdpMetadataCheckResult} from "../../api/client"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

const {mockCheckMetadata} = vi.hoisted(() => ({
    mockCheckMetadata: vi.fn(),
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
                checkMetadata: mockCheckMetadata,
            },
        },
    }
})

function makeBook(overrides: Partial<BookDetail> = {}): BookDetail {
    return {
        id: "book-1",
        title: "Test Book",
        subtitle: null,
        author: "Test Author",
        language: "en",
        series: null,
        series_index: null,
        description: "A description.",
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
        keywords: ["k1"],
        categories: ["Fiction"],
        bisac_codes: ["FIC022020"],
        html_description: null,
        backpage_description: null,
        backpage_author_bio: null,
        cover_image: "cover.jpg",
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
        chapters: [{id: "ch-1", title: "Chapter 1"} as never],
        ...overrides,
    } as BookDetail
}

function makeOk(): KdpMetadataCheckResult {
    return {
        complete: true,
        error_count: 0,
        warning_count: 0,
        issues: [],
    }
}

function makeFail(): KdpMetadataCheckResult {
    return {
        complete: false,
        error_count: 2,
        warning_count: 1,
        issues: [
            {field: "title", message: "Title is required", severity: "error"},
            {field: "author", message: "Author is required", severity: "error"},
            {
                field: "keywords",
                message: "No keywords set",
                severity: "warning",
            },
        ],
    }
}

describe("MetadataChecklist", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders the loading state initially", () => {
        mockCheckMetadata.mockImplementation(() => new Promise(() => {}))
        const onCanAdvanceChange = vi.fn()
        render(
            <MetadataChecklist
                book={makeBook()}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-0-metadata"),
        ).toBeTruthy()
        // Loading row contains the localized loading text.
        expect(screen.getByText(/loading|prüft/i)).toBeTruthy()
    })

    it("happy path: no issues → onCanAdvanceChange(true) + summary-ok", async () => {
        mockCheckMetadata.mockResolvedValue(makeOk())
        const onCanAdvanceChange = vi.fn()
        render(
            <MetadataChecklist
                book={makeBook()}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-0-summary-ok",
                ),
            ).toBeTruthy()
        })
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(true)
        expect(
            screen.queryByTestId(
                "kdp-publishing-wizard-step-0-summary-fail",
            ),
        ).toBeNull()
    })

    it("failure: errors present → onCanAdvanceChange(false) + summary-fail + error rows", async () => {
        mockCheckMetadata.mockResolvedValue(makeFail())
        const onCanAdvanceChange = vi.fn()
        render(
            <MetadataChecklist
                book={makeBook()}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-0-summary-fail",
                ),
            ).toBeTruthy()
        })
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(false)
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-0-error-title"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-0-error-author"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-0-warning-keywords"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-0-warning-count")
                .textContent,
        ).toMatch(/1/)
    })

    it("book-type filter: picture_book drops chapters error so the gate opens", async () => {
        mockCheckMetadata.mockResolvedValue({
            complete: false,
            error_count: 1,
            warning_count: 0,
            issues: [
                {
                    field: "chapters",
                    message: "Book has no chapters",
                    severity: "error",
                },
            ],
        })
        const onCanAdvanceChange = vi.fn()
        render(
            <MetadataChecklist
                book={makeBook({book_type: "picture_book", chapters: []})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-0-summary-ok",
                ),
            ).toBeTruthy()
        })
        // The chapters error must NOT render for picture_book.
        expect(
            screen.queryByTestId(
                "kdp-publishing-wizard-step-0-error-chapters",
            ),
        ).toBeNull()
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(true)
    })

    it("book-type filter: comic_book drops chapters error", async () => {
        mockCheckMetadata.mockResolvedValue({
            complete: false,
            error_count: 1,
            warning_count: 0,
            issues: [
                {
                    field: "chapters",
                    message: "Book has no chapters",
                    severity: "error",
                },
            ],
        })
        const onCanAdvanceChange = vi.fn()
        render(
            <MetadataChecklist
                book={makeBook({book_type: "comic_book", chapters: []})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        await waitFor(() => {
            expect(onCanAdvanceChange).toHaveBeenLastCalledWith(true)
        })
        expect(
            screen.queryByTestId(
                "kdp-publishing-wizard-step-0-error-chapters",
            ),
        ).toBeNull()
    })

    it("book-type filter: prose keeps the chapters error", async () => {
        mockCheckMetadata.mockResolvedValue({
            complete: false,
            error_count: 1,
            warning_count: 0,
            issues: [
                {
                    field: "chapters",
                    message: "Book has no chapters",
                    severity: "error",
                },
            ],
        })
        const onCanAdvanceChange = vi.fn()
        render(
            <MetadataChecklist
                book={makeBook({book_type: "prose", chapters: []})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-0-error-chapters",
                ),
            ).toBeTruthy()
        })
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(false)
    })

    it("API error path: error banner + onCanAdvanceChange(false)", async () => {
        mockCheckMetadata.mockRejectedValue(new Error("network failure"))
        const onCanAdvanceChange = vi.fn()
        render(
            <MetadataChecklist
                book={makeBook()}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        await waitFor(() => {
            expect(
                screen.getByTestId("kdp-publishing-wizard-step-0-error"),
            ).toBeTruthy()
        })
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(false)
    })

    it("posts the expected payload shape (arrays + ids + nullable strings)", async () => {
        mockCheckMetadata.mockResolvedValue(makeOk())
        render(
            <MetadataChecklist
                book={makeBook({
                    keywords: ["a", "b"],
                    categories: ["Fic", "NonFic"],
                    bisac_codes: ["FIC022020"],
                    chapters: [
                        {id: "ch-1", title: "Intro"} as never,
                        {id: "ch-2", title: "Body"} as never,
                    ],
                })}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        await waitFor(() => {
            expect(mockCheckMetadata).toHaveBeenCalledTimes(1)
        })
        const call = mockCheckMetadata.mock.calls[0][0]
        expect(call.title).toBe("Test Book")
        expect(call.author).toBe("Test Author")
        expect(call.language).toBe("en")
        expect(call.keywords).toEqual(["a", "b"])
        expect(call.categories).toEqual(["Fic", "NonFic"])
        expect(call.bisac_codes).toEqual(["FIC022020"])
        expect(call.chapters).toHaveLength(2)
        expect(call.chapters[0]).toEqual({id: "ch-1", title: "Intro"})
    })
})
