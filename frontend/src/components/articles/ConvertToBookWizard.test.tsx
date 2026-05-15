/**
 * ConvertToBookWizard tests (Phase 2). Covers the user's confirmed
 * mandatory Vitest checklist:
 *
 *  - wizard navigation (next/back/skip per step)
 *  - sort-strategy change re-orders the list
 *  - single-article pre-fill (subtitle + cover_image)
 *  - validation error display on title / author / 422
 *  - tag-helper quick-action
 *  - API call payload shape on submit
 *
 * Drag-reorder is deliberately E2E-only: happy-dom's pointer-event
 * shim does not exercise @dnd-kit's drag pipeline reliably (same
 * Radix-DropdownMenu-in-happy-dom shape documented in
 * lessons-learned). The Playwright spec covers actual dragging.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor, within} from "@testing-library/react"

import ConvertToBookWizard from "./ConvertToBookWizard"
import {Article} from "../../api/client"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

vi.mock("../../utils/notify", () => ({
    notify: {
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        successAction: vi.fn(),
    },
}))

const {mockFromArticles} = vi.hoisted(() => ({
    mockFromArticles: vi.fn(),
}))

vi.mock("../../api/client", async () => {
    // Keep ApiError + the type re-exports as the real module so
    // `err instanceof ApiError` works inside the component without
    // duplicate class identities.
    const actual = await vi.importActual<typeof import("../../api/client")>(
        "../../api/client",
    )
    return {
        ...actual,
        api: {
            ...actual.api,
            books: {
                ...actual.api.books,
                fromArticles: mockFromArticles,
            },
        },
    }
})

// --- fixtures ------------------------------------------------------------

function makeArticle(overrides: Partial<Article> = {}): Article {
    return {
        id: `art-${Math.random().toString(36).slice(2, 10)}`,
        title: "Untitled",
        subtitle: null,
        author: null,
        language: "en",
        content_type: "article",
        content_json: "",
        status: "draft",
        canonical_url: null,
        featured_image_url: null,
        excerpt: null,
        tags: [],
        topic: null,
        seo_title: null,
        seo_description: null,
        series: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    }
}

const multi: Article[] = [
    makeArticle({
        id: "a-zebra",
        title: "Zebra",
        tags: ["health"],
        created_at: "2023-01-01T00:00:00Z",
    }),
    makeArticle({
        id: "a-alpha",
        title: "Alpha",
        tags: ["health", "fitness"],
        created_at: "2024-06-01T00:00:00Z",
    }),
    makeArticle({
        id: "a-mango",
        title: "Mango",
        tags: ["fitness"],
        created_at: "2022-03-01T00:00:00Z",
    }),
]

const single: Article[] = [
    makeArticle({
        id: "solo",
        title: "Solo article",
        subtitle: "Article subtitle to inherit",
        featured_image_url: "https://example.com/img.jpg",
    }),
]

beforeEach(() => {
    mockFromArticles.mockReset()
})

// --- helpers -------------------------------------------------------------

function setStandardMetadata(): void {
    const titleInput = screen.getByTestId(
        "convert-to-book-wizard-metadata-title",
    ) as HTMLInputElement
    fireEvent.change(titleInput, {target: {value: "My New Book"}})
    const authorInput = screen.getByTestId(
        "convert-to-book-wizard-metadata-author",
    ) as HTMLInputElement
    fireEvent.change(authorInput, {target: {value: "An Author"}})
}

function clickNext(currentStep: number): void {
    const btn = screen.getByTestId(
        `convert-to-book-wizard-step-${currentStep}-next`,
    ) as HTMLButtonElement
    fireEvent.click(btn)
}

// --- tests ---------------------------------------------------------------

describe("ConvertToBookWizard navigation", () => {
    it("renders Step 0 (selection) initially with the article list", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        const list = screen.getByTestId("convert-to-book-wizard-selection-list")
        expect(list).toBeTruthy()
        // All three article rows present.
        expect(
            within(list).getByTestId("convert-to-book-wizard-selection-row-a-zebra"),
        ).toBeTruthy()
        expect(
            within(list).getByTestId("convert-to-book-wizard-selection-row-a-alpha"),
        ).toBeTruthy()
        expect(
            within(list).getByTestId("convert-to-book-wizard-selection-row-a-mango"),
        ).toBeTruthy()
    })

    it("Next advances through every step and Back returns", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        // Step 0 -> 1
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-0-next"))
        setStandardMetadata()
        expect(
            screen.getByTestId("convert-to-book-wizard-metadata-title"),
        ).toBeTruthy()
        // Step 1 -> 2 (front-matter)
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-1-next"))
        expect(
            screen.getByTestId("convert-to-book-wizard-front-matter-title-page-toggle"),
        ).toBeTruthy()
        // Step 2 -> 3 (back-matter)
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-2-next"))
        expect(
            screen.getByTestId(
                "convert-to-book-wizard-back-matter-acknowledgments-toggle",
            ),
        ).toBeTruthy()
        // Step 3 -> 4 (chapter-settings)
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-3-next"))
        expect(
            screen.getByTestId(
                "convert-to-book-wizard-chapter-settings-use-article-title",
            ),
        ).toBeTruthy()
        // Step 4 -> 5 (review)
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-4-next"))
        expect(
            screen.getByTestId("convert-to-book-wizard-review-confirm"),
        ).toBeTruthy()
        // Back to 4
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-5-back"))
        expect(
            screen.getByTestId(
                "convert-to-book-wizard-chapter-settings-use-article-title",
            ),
        ).toBeTruthy()
    })

    it("Skip is available on steps 2 (front-matter) and 3 (back-matter) only", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        // Step 0: no skip.
        expect(
            screen.queryByTestId("convert-to-book-wizard-step-0-skip"),
        ).toBeNull()
        // Advance to step 2.
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-0-next"))
        setStandardMetadata()
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-1-next"))
        expect(
            screen.getByTestId("convert-to-book-wizard-step-2-skip"),
        ).toBeTruthy()
        // Step 3 has skip.
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-2-next"))
        expect(
            screen.getByTestId("convert-to-book-wizard-step-3-skip"),
        ).toBeTruthy()
        // Step 4: no skip.
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-3-next"))
        expect(
            screen.queryByTestId("convert-to-book-wizard-step-4-skip"),
        ).toBeNull()
    })
})

describe("ConvertToBookWizard sort + tag-helpers", () => {
    it("sort by title_asc reorders the list", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        const select = screen.getByTestId(
            "convert-to-book-wizard-selection-sort-strategy",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "title_asc"}})
        const list = screen.getByTestId("convert-to-book-wizard-selection-list")
        const rows = list.querySelectorAll("[data-testid^='convert-to-book-wizard-selection-row-']")
        const titles = Array.from(rows).map((r) => r.textContent || "")
        // Alpha → Mango → Zebra
        expect(titles[0]).toContain("Alpha")
        expect(titles[1]).toContain("Mango")
        expect(titles[2]).toContain("Zebra")
    })

    it("sort by date_asc places oldest article first", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        const select = screen.getByTestId(
            "convert-to-book-wizard-selection-sort-strategy",
        ) as HTMLSelectElement
        // date_asc is the default — verify by reading the list order
        // straight away.
        expect(select.value).toBe("date_asc")
        const list = screen.getByTestId("convert-to-book-wizard-selection-list")
        const rows = list.querySelectorAll("[data-testid^='convert-to-book-wizard-selection-row-']")
        const titles = Array.from(rows).map((r) => r.textContent || "")
        // created_at order: Mango (2022) → Zebra (2023) → Alpha (2024)
        expect(titles[0]).toContain("Mango")
        expect(titles[1]).toContain("Zebra")
        expect(titles[2]).toContain("Alpha")
    })

    it("tag-helper narrows the selection to articles with that tag", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        // "health" appears on a-zebra + a-alpha; clicking the tag
        // button should leave just those two.
        fireEvent.click(
            screen.getByTestId("convert-to-book-wizard-selection-tag-health"),
        )
        const list = screen.getByTestId("convert-to-book-wizard-selection-list")
        const rows = list.querySelectorAll(
            "[data-testid^='convert-to-book-wizard-selection-row-']",
        )
        expect(rows.length).toBe(2)
        // Reset button appears once the working selection is < input.
        const reset = screen.getByTestId("convert-to-book-wizard-selection-reset")
        fireEvent.click(reset)
        const after = screen
            .getByTestId("convert-to-book-wizard-selection-list")
            .querySelectorAll(
                "[data-testid^='convert-to-book-wizard-selection-row-']",
            )
        expect(after.length).toBe(3)
    })
})

describe("ConvertToBookWizard validation + pre-fill", () => {
    it("Next on Step 1 is disabled until title + author are non-empty", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-0-next"))
        const next = screen.getByTestId(
            "convert-to-book-wizard-step-1-next",
        ) as HTMLButtonElement
        expect(next.disabled).toBe(true)
        // Title only - still disabled (author missing).
        fireEvent.change(
            screen.getByTestId("convert-to-book-wizard-metadata-title"),
            {target: {value: "A Book"}},
        )
        expect(next.disabled).toBe(true)
        // Both present - enabled.
        fireEvent.change(
            screen.getByTestId("convert-to-book-wizard-metadata-author"),
            {target: {value: "An Author"}},
        )
        expect(next.disabled).toBe(false)
    })

    it("single-article subtitle pre-fills as placeholder, cover info shows", () => {
        render(
            <ConvertToBookWizard
                open
                articles={single}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-0-next"))
        const subtitle = screen.getByTestId(
            "convert-to-book-wizard-metadata-subtitle",
        ) as HTMLInputElement
        expect(subtitle.placeholder).toBe("Article subtitle to inherit")
        expect(
            screen.getByTestId("convert-to-book-wizard-metadata-cover-info"),
        ).toBeTruthy()
        const cover = screen.getByTestId(
            "convert-to-book-wizard-metadata-cover-image",
        ) as HTMLInputElement
        expect(cover.placeholder).toBe("https://example.com/img.jpg")
    })

    it("multi-article view hides the cover-info box", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-0-next"))
        expect(
            screen.queryByTestId("convert-to-book-wizard-metadata-cover-info"),
        ).toBeNull()
    })
})

describe("ConvertToBookWizard submit", () => {
    it("Posts a normalised payload to api.books.fromArticles on Convert", async () => {
        mockFromArticles.mockResolvedValue({
            id: "new-book-id",
            title: "My New Book",
            chapters: [],
        })

        const onConverted = vi.fn()
        const onClose = vi.fn()
        const onViewBook = vi.fn()
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={onClose}
                onConverted={onConverted}
                onViewBook={onViewBook}
            />,
        )
        // Use a deterministic sort first so manual_order is null.
        fireEvent.change(
            screen.getByTestId("convert-to-book-wizard-selection-sort-strategy"),
            {target: {value: "title_asc"}},
        )
        clickNext(0)
        setStandardMetadata()
        clickNext(1)
        clickNext(2)
        clickNext(3)
        clickNext(4)
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-review-confirm"))
        await waitFor(() => expect(mockFromArticles).toHaveBeenCalled())
        const payload = mockFromArticles.mock.calls[0][0]
        // Sorted alphabetically: Alpha → Mango → Zebra.
        expect(payload.article_ids).toEqual(["a-alpha", "a-mango", "a-zebra"])
        expect(payload.title).toBe("My New Book")
        expect(payload.author).toBe("An Author")
        expect(payload.sort_strategy).toBe("title_asc")
        expect(payload.manual_order).toBeNull()
        expect(payload.chapter_settings).toEqual({
            use_article_title_as_chapter_title: true,
        })
        expect(payload.front_matter).toBeUndefined()
        expect(payload.back_matter).toBeUndefined()
        await waitFor(() => expect(onConverted).toHaveBeenCalled())
        expect(onConverted).toHaveBeenCalledWith(
            expect.objectContaining({id: "new-book-id"}),
        )
    })

    it("Toast 'View book' CTA invokes onViewBook with the new book", async () => {
        // WARN-I1 regression-pin. The wizard MUST fire onConverted +
        // close (page-level cleanup) but MUST NOT auto-navigate.
        // Navigation lives on the toast CTA, which the
        // successAction mock receives as its 3rd arg. Invoking the
        // captured action proves the CTA wiring is intact end-to-end.
        const {notify} = await import("../../utils/notify")
        mockFromArticles.mockResolvedValue({
            id: "new-book-id",
            title: "My New Book",
            chapters: [],
        })

        const onConverted = vi.fn()
        const onClose = vi.fn()
        const onViewBook = vi.fn()
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={onClose}
                onConverted={onConverted}
                onViewBook={onViewBook}
            />,
        )
        fireEvent.change(
            screen.getByTestId("convert-to-book-wizard-selection-sort-strategy"),
            {target: {value: "title_asc"}},
        )
        clickNext(0)
        setStandardMetadata()
        clickNext(1)
        clickNext(2)
        clickNext(3)
        clickNext(4)
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-review-confirm"))
        await waitFor(() => expect(notify.successAction).toHaveBeenCalled())

        // Page-level callback ran; wizard requested close.
        expect(onConverted).toHaveBeenCalledWith(
            expect.objectContaining({id: "new-book-id"}),
        )
        expect(onClose).toHaveBeenCalled()
        // onViewBook is NOT called yet — the user hasn't clicked
        // the CTA. Auto-navigation regression would fire it here.
        expect(onViewBook).not.toHaveBeenCalled()

        // Invoke the captured toast action (3rd arg). The CTA wiring
        // should call onViewBook with the new book. Take the LAST
        // call (notify mock accumulates across the suite; the
        // previous payload test also fires successAction).
        const calls = (
            notify.successAction as unknown as {mock: {calls: unknown[][]}}
        ).mock.calls
        const [, , toastOnAction] = calls[calls.length - 1]
        ;(toastOnAction as () => void)()
        expect(onViewBook).toHaveBeenCalledWith(
            expect.objectContaining({id: "new-book-id"}),
        )
    })

    it("422 validation routes the user back to Step 0 with a banner", async () => {
        const {ApiError} = await vi.importActual<
            typeof import("../../api/client")
        >("../../api/client")
        mockFromArticles.mockRejectedValue(
            new ApiError(
                422,
                "Some articles cannot be converted.",
                "/api/books/from-articles",
                "POST",
                "",
                {
                    code: "invalid_articles",
                    message: "Some articles cannot be converted.",
                    trashed: [{id: "trashed-1", title: "Trashed One"}],
                    non_article: [],
                    not_found_ids: [],
                },
            ),
        )
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        clickNext(0)
        setStandardMetadata()
        clickNext(1)
        clickNext(2)
        clickNext(3)
        clickNext(4)
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-review-confirm"))
        await waitFor(() => expect(mockFromArticles).toHaveBeenCalled())
        // The wizard rewinds to Step 0 (selection visible) AND shows
        // the structured banner with the trashed title.
        await waitFor(() => {
            expect(
                screen.getByTestId("convert-to-book-wizard-validation-banner"),
            ).toBeTruthy()
        })
        expect(screen.getByText(/Trashed One/)).toBeTruthy()
        expect(
            screen.getByTestId("convert-to-book-wizard-selection-list"),
        ).toBeTruthy()
    })
})
