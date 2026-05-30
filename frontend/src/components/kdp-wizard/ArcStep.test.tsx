/**
 * ArcStep component tests (C9).
 *
 * Covers the server-driven contract: mount fetches reviewers,
 * add/delete/status-update round-trip through the API client +
 * trigger a refresh. Email integration is mailto-only per A16.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import ArcStep from "./ArcStep"
import {BookDetail} from "../../api/client"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

const mockListReviewers = vi.fn()
const mockAddReviewer = vi.fn()
const mockUpdateReviewer = vi.fn()
const mockDeleteReviewer = vi.fn()

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>(
        "../../api/client",
    )
    return {
        ...actual,
        api: {
            kdp: {
                listReviewers: (...args: unknown[]) =>
                    mockListReviewers(...args),
                addReviewer: (...args: unknown[]) =>
                    mockAddReviewer(...args),
                updateReviewer: (...args: unknown[]) =>
                    mockUpdateReviewer(...args),
                deleteReviewer: (...args: unknown[]) =>
                    mockDeleteReviewer(...args),
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
        book_type: "prose",
        chapters: [],
        ...overrides,
    } as BookDetail
}

function makeReviewer(overrides: Record<string, unknown> = {}) {
    return {
        id: "r-1",
        publishing_state_id: "ps-1",
        reviewer_name: "Reviewer A",
        reviewer_email: "a@example.com",
        review_status: "invited",
        copy_version: null,
        review_permalink: null,
        review_text_excerpt: null,
        invited_at: "2026-05-22T00:00:00",
        reviewed_at: null,
        created_at: "2026-05-22T00:00:00",
        updated_at: "2026-05-22T00:00:00",
        ...overrides,
    }
}

describe("ArcStep", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockListReviewers.mockResolvedValue([])
    })

    it("fetches reviewers on mount", async () => {
        render(<ArcStep book={makeBook()} />)
        await waitFor(() => {
            expect(mockListReviewers).toHaveBeenCalledWith("book-1")
        })
    })

    it("renders empty state when no reviewers exist", async () => {
        render(<ArcStep book={makeBook()} />)
        await waitFor(() => {
            expect(
                screen.queryByTestId(
                    "kdp-publishing-wizard-step-3-empty",
                ),
            ).toBeTruthy()
        })
    })

    it("renders reviewer rows when the API returns reviewers", async () => {
        mockListReviewers.mockResolvedValue([
            makeReviewer({id: "r-1", reviewer_name: "Aliska"}),
            makeReviewer({id: "r-2", reviewer_name: "Bartolomeo"}),
        ])
        render(<ArcStep book={makeBook()} />)
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-3-row-r-1",
                ),
            ).toBeTruthy()
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-3-row-r-2",
                ),
            ).toBeTruthy()
        })
    })

    it("add-submit button disabled while name input is empty", async () => {
        render(<ArcStep book={makeBook()} />)
        await waitFor(() => {
            // Wait for initial fetch to complete.
            expect(
                screen.queryByTestId(
                    "kdp-publishing-wizard-step-3-empty",
                ),
            ).toBeTruthy()
        })
        const submit = screen.getByTestId(
            "kdp-publishing-wizard-step-3-add-submit",
        ) as HTMLButtonElement
        expect(submit.disabled).toBe(true)
    })

    it("add-submit posts to addReviewer with the trimmed name + email", async () => {
        mockAddReviewer.mockResolvedValue(makeReviewer())
        render(<ArcStep book={makeBook()} />)
        await waitFor(() => {
            expect(mockListReviewers).toHaveBeenCalled()
        })

        fireEvent.change(
            screen.getByTestId("kdp-publishing-wizard-step-3-add-name"),
            {target: {value: "  Reviewer New  "}},
        )
        fireEvent.change(
            screen.getByTestId("kdp-publishing-wizard-step-3-add-email"),
            {target: {value: "  new@example.com  "}},
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-3-add-submit"),
        )

        await waitFor(() => {
            expect(mockAddReviewer).toHaveBeenCalledWith("book-1", {
                reviewer_name: "Reviewer New",
                reviewer_email: "new@example.com",
            })
        })
    })

    it("add-submit sends null email when the field is empty", async () => {
        mockAddReviewer.mockResolvedValue(makeReviewer())
        render(<ArcStep book={makeBook()} />)
        await waitFor(() => expect(mockListReviewers).toHaveBeenCalled())

        fireEvent.change(
            screen.getByTestId("kdp-publishing-wizard-step-3-add-name"),
            {target: {value: "Anon"}},
        )
        fireEvent.click(
            screen.getByTestId("kdp-publishing-wizard-step-3-add-submit"),
        )

        await waitFor(() => {
            expect(mockAddReviewer).toHaveBeenCalledWith("book-1", {
                reviewer_name: "Anon",
                reviewer_email: null,
            })
        })
    })

    it("status change PATCHes the reviewer with the new status", async () => {
        mockListReviewers.mockResolvedValue([makeReviewer({id: "r-1"})])
        mockUpdateReviewer.mockResolvedValue(
            makeReviewer({id: "r-1", review_status: "sent"}),
        )
        render(<ArcStep book={makeBook()} />)
        await waitFor(() =>
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-3-status-r-1-trigger",
                ),
            ).toBeTruthy(),
        )

        fireEvent.change(
            screen.getByTestId(
                "kdp-publishing-wizard-step-3-status-r-1-trigger",
            ),
            {target: {value: "sent"}},
        )

        await waitFor(() => {
            expect(mockUpdateReviewer).toHaveBeenCalledWith(
                "book-1",
                "r-1",
                {review_status: "sent"},
            )
        })
    })

    it("delete button DELETEs the reviewer + refreshes the list", async () => {
        mockListReviewers.mockResolvedValueOnce([
            makeReviewer({id: "r-1"}),
        ])
        mockListReviewers.mockResolvedValueOnce([])
        mockDeleteReviewer.mockResolvedValue(undefined)
        render(<ArcStep book={makeBook()} />)
        await waitFor(() =>
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-3-row-r-1",
                ),
            ).toBeTruthy(),
        )

        fireEvent.click(
            screen.getByTestId(
                "kdp-publishing-wizard-step-3-delete-r-1",
            ),
        )

        await waitFor(() => {
            expect(mockDeleteReviewer).toHaveBeenCalledWith("book-1", "r-1")
            expect(mockListReviewers).toHaveBeenCalledTimes(2)
        })
    })

    it("renders mailto: link only for reviewers with an email", async () => {
        mockListReviewers.mockResolvedValue([
            makeReviewer({id: "r-1", reviewer_email: "a@example.com"}),
            makeReviewer({id: "r-2", reviewer_email: null}),
        ])
        render(<ArcStep book={makeBook()} />)
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-3-mailto-r-1",
                ),
            ).toBeTruthy()
            expect(
                screen.queryByTestId(
                    "kdp-publishing-wizard-step-3-mailto-r-2",
                ),
            ).toBeNull()
        })
    })

    it("renders error banner when fetch fails", async () => {
        mockListReviewers.mockRejectedValueOnce(new Error("network fail"))
        render(<ArcStep book={makeBook()} />)
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-3-error",
                ),
            ).toBeTruthy()
        })
    })

    it("fires onReviewerCountChange with the latest count", async () => {
        const onReviewerCountChange = vi.fn()
        mockListReviewers.mockResolvedValue([
            makeReviewer({id: "r-1"}),
            makeReviewer({id: "r-2"}),
        ])
        render(
            <ArcStep
                book={makeBook()}
                onReviewerCountChange={onReviewerCountChange}
            />,
        )
        await waitFor(() => {
            expect(onReviewerCountChange).toHaveBeenCalledWith(2)
        })
    })
})
