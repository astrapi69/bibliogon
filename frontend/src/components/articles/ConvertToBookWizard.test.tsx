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

const {mockFromArticles, mockListAuthors, mockCreateAuthor} = vi.hoisted(() => ({
    mockFromArticles: vi.fn(),
    // Bug 8 Phase 2: api.authors.list is called once on wizard mount
    // to fetch the global Authors-Database for the Step-2 datalist.
    // Default returns [] so existing tests behave as before; per-test
    // overrides land via ``mockListAuthors.mockResolvedValueOnce(...)``.
    mockListAuthors: vi.fn(),
    // Bug 8 Phase 2 Commit 3: api.authors.create is called from
    // handleSubmit when the Add-to-Authors-DB checkbox is checked
    // AND the typed name is not already in the DB.
    mockCreateAuthor: vi.fn(),
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
            authors: {
                ...actual.api.authors,
                list: mockListAuthors,
                create: mockCreateAuthor,
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
    mockListAuthors.mockReset()
    // Default: no global Authors-DB rows. Per-test overrides via
    // ``mockListAuthors.mockResolvedValueOnce(...)`` seed concrete
    // suggestion fixtures.
    mockListAuthors.mockResolvedValue([])
    mockCreateAuthor.mockReset()
    // Default: api.authors.create returns a successful Author row
    // (the typed name + a slug + the standard fields). Tests that
    // need failure paths use ``mockCreateAuthor.mockRejectedValueOnce``.
    mockCreateAuthor.mockImplementation(async ({name}: {name: string}) => ({
        id: "author-" + Math.random().toString(36).slice(2, 8),
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        bio: null,
        created_at: "2026-05-16T00:00:00Z",
        updated_at: "2026-05-16T00:00:00Z",
    }))
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

// ---------------------------------------------------------------------------
// Bug 8 Phase 2: author datalist + pre-fill behaviour
// ---------------------------------------------------------------------------

describe("ConvertToBookWizard author datalist (Bug 8 Phase 2)", () => {
    function advanceToMetadata() {
        // Step 0 → Step 1 (metadata).
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-0-next"))
    }

    it("renders the datalist + author input on Step 1", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        expect(
            screen.getByTestId("convert-to-book-wizard-metadata-author"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("convert-to-book-wizard-author-datalist"),
        ).toBeTruthy()
    })

    it("input carries the ``list`` attribute pointing at the datalist id", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        const input = screen.getByTestId(
            "convert-to-book-wizard-metadata-author",
        ) as HTMLInputElement
        expect(input.getAttribute("list")).toBe(
            "convert-to-book-wizard-author-suggestions",
        )
    })

    it("pre-fills author when every selected article shares the same author", async () => {
        const shared: Article[] = [
            makeArticle({id: "s1", author: "Asterios Raptis"}),
            makeArticle({id: "s2", author: "Asterios Raptis"}),
            makeArticle({id: "s3", author: "Asterios Raptis"}),
        ]
        render(
            <ConvertToBookWizard
                open
                articles={shared}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        const input = screen.getByTestId(
            "convert-to-book-wizard-metadata-author",
        ) as HTMLInputElement
        await waitFor(() => {
            expect(input.value).toBe("Asterios Raptis")
        })
    })

    it("pre-fills author from a single-article selection", async () => {
        const solo: Article[] = [
            makeArticle({id: "solo", title: "Solo", author: "Solo Writer"}),
        ]
        render(
            <ConvertToBookWizard
                open
                articles={solo}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        const input = screen.getByTestId(
            "convert-to-book-wizard-metadata-author",
        ) as HTMLInputElement
        await waitFor(() => {
            expect(input.value).toBe("Solo Writer")
        })
    })

    it("leaves author empty when the selected articles mix authors", async () => {
        const mixed: Article[] = [
            makeArticle({id: "m1", author: "Alice"}),
            makeArticle({id: "m2", author: "Bob"}),
        ]
        render(
            <ConvertToBookWizard
                open
                articles={mixed}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        const input = screen.getByTestId(
            "convert-to-book-wizard-metadata-author",
        ) as HTMLInputElement
        expect(input.value).toBe("")
    })

    it("leaves author empty when any selected article has a null author", async () => {
        const partial: Article[] = [
            makeArticle({id: "p1", author: "Alice"}),
            makeArticle({id: "p2", author: null}),
        ]
        render(
            <ConvertToBookWizard
                open
                articles={partial}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        const input = screen.getByTestId(
            "convert-to-book-wizard-metadata-author",
        ) as HTMLInputElement
        expect(input.value).toBe("")
    })

    it("datalist surfaces every distinct author from selected articles", async () => {
        const mixed: Article[] = [
            makeArticle({id: "m1", author: "Alice"}),
            makeArticle({id: "m2", author: "Bob"}),
            makeArticle({id: "m3", author: "Charlie"}),
        ]
        render(
            <ConvertToBookWizard
                open
                articles={mixed}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        const datalist = screen.getByTestId(
            "convert-to-book-wizard-author-datalist",
        )
        const optionValues = Array.from(
            datalist.querySelectorAll("option"),
        ).map((o) => (o as HTMLOptionElement).value)
        expect(optionValues).toEqual(["Alice", "Bob", "Charlie"])
    })

    it("datalist surfaces both article-authors and global-DB authors", async () => {
        mockListAuthors.mockResolvedValue([
            {
                id: "db-1",
                name: "DB Writer",
                slug: "db-writer",
                bio: null,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
            },
        ])
        const arts: Article[] = [
            makeArticle({id: "a1", author: "Article Author"}),
        ]
        render(
            <ConvertToBookWizard
                open
                articles={arts}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        await waitFor(() => {
            const datalist = screen.getByTestId(
                "convert-to-book-wizard-author-datalist",
            )
            const optionValues = Array.from(
                datalist.querySelectorAll("option"),
            ).map((o) => (o as HTMLOptionElement).value)
            expect(optionValues).toEqual(["Article Author", "DB Writer"])
        })
    })

    it("free-text typing still works alongside the datalist", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        const input = screen.getByTestId(
            "convert-to-book-wizard-metadata-author",
        ) as HTMLInputElement
        fireEvent.change(input, {target: {value: "Custom Typed Name"}})
        expect(input.value).toBe("Custom Typed Name")
    })

    it("typing custom text does NOT get overwritten by a subsequent shared-author detection", async () => {
        // Render with mixed authors so sharedAuthor is null on mount.
        const mixed: Article[] = [
            makeArticle({id: "m1", author: "Alice"}),
            makeArticle({id: "m2", author: "Bob"}),
        ]
        render(
            <ConvertToBookWizard
                open
                articles={mixed}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        const input = screen.getByTestId(
            "convert-to-book-wizard-metadata-author",
        ) as HTMLInputElement
        fireEvent.change(input, {target: {value: "Custom Author"}})
        // Even if a new sharedAuthor signal arrived later, the
        // pre-fill effect must NOT overwrite non-empty user input.
        expect(input.value).toBe("Custom Author")
    })
})

// ---------------------------------------------------------------------------
// Bug 8 Phase 2 Commit 3: Add-to-Authors-DB checkbox + submit-flow integration
// ---------------------------------------------------------------------------

describe("ConvertToBookWizard Add-to-Authors-DB (Bug 8 Phase 2)", () => {
    function advanceToMetadata() {
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-step-0-next"))
    }

    function setAuthorOnly(name: string) {
        const input = screen.getByTestId(
            "convert-to-book-wizard-metadata-author",
        ) as HTMLInputElement
        fireEvent.change(input, {target: {value: name}})
    }

    it("checkbox hidden when the author field is empty", () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        // Default author is empty (multi has no shared author).
        expect(
            screen.queryByTestId(
                "convert-to-book-wizard-add-to-authors-checkbox",
            ),
        ).toBeNull()
    })

    it("checkbox visible (and checked) when typed name is new", async () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        setAuthorOnly("Brand New Person")
        const cb = (await screen.findByTestId(
            "convert-to-book-wizard-add-to-authors-checkbox",
        )) as HTMLInputElement
        expect(cb).toBeTruthy()
        expect(cb.checked).toBe(true)
    })

    it("checkbox hidden when typed name matches an existing DB entry (case-insensitive)", async () => {
        mockListAuthors.mockResolvedValue([
            {
                id: "db-1",
                name: "Asterios Raptis",
                slug: "asterios-raptis",
                bio: null,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
            },
        ])
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        // Wait for the DB fetch to resolve so authorAlreadyInDb
        // can correctly compare against the loaded set.
        await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
        // Type the same name in different casing.
        setAuthorOnly("ASTERIOS RAPTIS")
        await waitFor(() => {
            expect(
                screen.queryByTestId(
                    "convert-to-book-wizard-add-to-authors-checkbox",
                ),
            ).toBeNull()
        })
    })

    it("checkbox label interpolates the typed name", async () => {
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        advanceToMetadata()
        setAuthorOnly("Jane New")
        const cb = (await screen.findByTestId(
            "convert-to-book-wizard-add-to-authors-checkbox",
        )) as HTMLInputElement
        // Label sits in the same <label> wrapper. Grab text.
        const label = cb.closest("label")
        expect(label?.textContent).toContain("Jane New")
    })

    it("submit creates author then book when checkbox is checked + name is new", async () => {
        mockFromArticles.mockResolvedValue({
            id: "new-book-id",
            title: "My New Book",
            chapters: [],
        })
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        // Use a deterministic sort first so the article ordering is
        // predictable for the payload assertion.
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
        // Author was created first, then book.
        await waitFor(() =>
            expect(mockCreateAuthor).toHaveBeenCalledWith({name: "An Author"}),
        )
        await waitFor(() => expect(mockFromArticles).toHaveBeenCalled())
        // Order matters: author POST must complete before book POST.
        const createOrder = mockCreateAuthor.mock.invocationCallOrder[0]
        const bookOrder = mockFromArticles.mock.invocationCallOrder[0]
        expect(createOrder).toBeLessThan(bookOrder)
    })

    it("submit skips author create when the checkbox is unchecked", async () => {
        mockFromArticles.mockResolvedValue({
            id: "new-book-id",
            title: "My New Book",
            chapters: [],
        })
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        fireEvent.change(
            screen.getByTestId("convert-to-book-wizard-selection-sort-strategy"),
            {target: {value: "title_asc"}},
        )
        clickNext(0)
        setStandardMetadata()
        // Uncheck the checkbox.
        const cb = screen.getByTestId(
            "convert-to-book-wizard-add-to-authors-checkbox",
        ) as HTMLInputElement
        fireEvent.click(cb)
        expect(cb.checked).toBe(false)
        clickNext(1)
        clickNext(2)
        clickNext(3)
        clickNext(4)
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-review-confirm"))
        await waitFor(() => expect(mockFromArticles).toHaveBeenCalled())
        expect(mockCreateAuthor).not.toHaveBeenCalled()
    })

    it("submit skips author create when the typed name is already in the DB", async () => {
        mockListAuthors.mockResolvedValue([
            {
                id: "db-1",
                name: "An Author",
                slug: "an-author",
                bio: null,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
            },
        ])
        mockFromArticles.mockResolvedValue({
            id: "new-book-id",
            title: "My New Book",
            chapters: [],
        })
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
            />,
        )
        fireEvent.change(
            screen.getByTestId("convert-to-book-wizard-selection-sort-strategy"),
            {target: {value: "title_asc"}},
        )
        clickNext(0)
        await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
        setStandardMetadata()
        // Checkbox must be hidden because "An Author" is in the DB.
        await waitFor(() => {
            expect(
                screen.queryByTestId(
                    "convert-to-book-wizard-add-to-authors-checkbox",
                ),
            ).toBeNull()
        })
        clickNext(1)
        clickNext(2)
        clickNext(3)
        clickNext(4)
        fireEvent.click(screen.getByTestId("convert-to-book-wizard-review-confirm"))
        await waitFor(() => expect(mockFromArticles).toHaveBeenCalled())
        expect(mockCreateAuthor).not.toHaveBeenCalled()
    })

    it("book create still proceeds when author create fails", async () => {
        mockCreateAuthor.mockRejectedValue(new Error("DB write failed"))
        mockFromArticles.mockResolvedValue({
            id: "new-book-id",
            title: "My New Book",
            chapters: [],
        })
        const {notify} = await import("../../utils/notify")
        render(
            <ConvertToBookWizard
                open
                articles={multi}
                onClose={vi.fn()}
                onConverted={vi.fn()}
                onViewBook={vi.fn()}
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
        await waitFor(() => expect(mockCreateAuthor).toHaveBeenCalled())
        // Book create proceeds despite the author-create failure.
        await waitFor(() => expect(mockFromArticles).toHaveBeenCalled())
        // Error toast fired for the author-create failure.
        expect(notify.error).toHaveBeenCalled()
    })
})
