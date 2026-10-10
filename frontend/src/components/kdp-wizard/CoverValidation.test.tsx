/**
 * CoverValidation tests (C3 of KDP Publishing Wizard MVP).
 *
 * Covers:
 *  - no-cover state → onCanAdvanceChange(false), renders the
 *    "no cover" banner, no <img>
 *  - happy path: valid dimensions + format → summary-ok +
 *    onCanAdvanceChange(true)
 *  - too-small dimensions → error row + onCanAdvanceChange(false)
 *  - too-large dimensions → error row
 *  - aspect-ratio out of 1.5–1.8 → warning row (does NOT block
 *    advance; aspect is best-practice only per backend's same
 *    behavior in KDP_COVER_REQUIREMENTS)
 *  - bad format (e.g. .webp) → error row
 *  - cover URL load failure (HTTP 404 / network) → load-error
 *    banner + onCanAdvanceChange(false)
 *  - cover URL composition from book.cover_image
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import CoverValidation from "./CoverValidation"
import {BookDetail} from "../../api/client"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

// Storage seam: the cover preview resolves through useCoverUrl, which reads
// getStorage().mode. Default to api mode so the existing assertions (real
// `/api/...` URL composition) hold; the dexie case is overridden per-test.
const getStorageMock = vi.fn()
vi.mock("../../storage", () => ({
    getStorage: () => getStorageMock(),
    isOfflineEnabled: () => false,
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
        chapters: [],
        ...overrides,
    } as BookDetail
}

/** Simulate the <img> onLoad with the given natural dimensions.
 *  happy-dom doesn't fire image-load events automatically, so we
 *  fire a synthetic load event with currentTarget overridden via
 *  Object.defineProperty on the rendered <img>. */
function fireImageLoad(width: number, height: number) {
    const img = screen.getByTestId("kdp-publishing-wizard-step-1-preview") as HTMLImageElement
    Object.defineProperty(img, "naturalWidth", {value: width, configurable: true})
    Object.defineProperty(img, "naturalHeight", {value: height, configurable: true})
    fireEvent.load(img)
}

describe("CoverValidation", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getStorageMock.mockReturnValue({
            mode: "api",
            assets: {getBlob: vi.fn()},
        })
    })

    it("no cover_image → fail-immediately + onCanAdvanceChange(false)", () => {
        const onCanAdvanceChange = vi.fn()
        render(
            <CoverValidation
                book={makeBook({cover_image: null})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-1-no-cover"),
        ).toBeTruthy()
        expect(
            screen.queryByTestId("kdp-publishing-wizard-step-1-preview"),
        ).toBeNull()
        expect(onCanAdvanceChange).toHaveBeenCalledWith(false)
    })

    it("happy path: valid dimensions + format → summary-ok + advance=true", async () => {
        const onCanAdvanceChange = vi.fn()
        render(
            <CoverValidation
                book={makeBook({cover_image: "cover.jpg"})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        fireImageLoad(1600, 2560) // KDP-recommended dimensions
        await waitFor(() => {
            expect(
                screen.getByTestId("kdp-publishing-wizard-step-1-summary-ok"),
            ).toBeTruthy()
        })
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(true)
    })

    it("too-small dimensions → error + advance=false", async () => {
        const onCanAdvanceChange = vi.fn()
        render(
            <CoverValidation
                book={makeBook({cover_image: "cover.jpg"})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        fireImageLoad(400, 600)
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-1-error-dimensions_too_small",
                ),
            ).toBeTruthy()
        })
        expect(
            screen.getByTestId("kdp-publishing-wizard-step-1-summary-fail"),
        ).toBeTruthy()
        // The sentence comes from a template now (#1037), so pin that
        // the thresholds reach it: a template rendered with its
        // placeholders still in place would read as a complete sentence.
        expect(
            screen.getByTestId(
                "kdp-publishing-wizard-step-1-error-dimensions_too_small",
            ).textContent,
        ).toContain("Minimum: 625x1000")
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(false)
    })

    it("too-large dimensions → error", async () => {
        const onCanAdvanceChange = vi.fn()
        render(
            <CoverValidation
                book={makeBook({cover_image: "cover.jpg"})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        fireImageLoad(12000, 18000)
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-1-error-dimensions_too_large",
                ),
            ).toBeTruthy()
        })
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(false)
    })

    it("aspect ratio out of 1.5–1.8 → warning (not blocking)", async () => {
        const onCanAdvanceChange = vi.fn()
        render(
            <CoverValidation
                book={makeBook({cover_image: "cover.jpg"})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        // 1200x1300 → ratio 1.083 (below 1.5)
        fireImageLoad(1200, 1300)
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-1-warning-aspect_ratio_outside_range",
                ),
            ).toBeTruthy()
        })
        // Aspect is warning-only; advance stays true if dimensions
        // + format pass.
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(true)
    })

    it("unsupported format (.webp) → error + advance=false", async () => {
        const onCanAdvanceChange = vi.fn()
        render(
            <CoverValidation
                book={makeBook({cover_image: "cover.webp"})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        fireImageLoad(1600, 2560)
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-1-error-format_unsupported",
                ),
            ).toBeTruthy()
        })
        // The allowed list is interpolated from the requirements, so it
        // follows the constant instead of being retyped per language.
        expect(
            screen.getByTestId(
                "kdp-publishing-wizard-step-1-error-format_unsupported",
            ).textContent,
        ).toContain("JPG, JPEG, TIFF, PNG")
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(false)
    })

    it("image load error → load-error banner + advance=false", async () => {
        const onCanAdvanceChange = vi.fn()
        render(
            <CoverValidation
                book={makeBook({cover_image: "missing.jpg"})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        const img = screen.getByTestId(
            "kdp-publishing-wizard-step-1-preview",
        )
        fireEvent.error(img)
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-1-load-error",
                ),
            ).toBeTruthy()
        })
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(false)
    })

    it("composes cover URL from book.id + cover_image filename", () => {
        render(
            <CoverValidation
                book={makeBook({
                    id: "book-42",
                    cover_image: "subfolder/my-cover.png",
                })}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        const img = screen.getByTestId(
            "kdp-publishing-wizard-step-1-preview",
        ) as HTMLImageElement
        expect(img.src).toContain("/api/books/book-42/assets/file/my-cover.png")
    })

    it("offline, a cover over the byte limit is an error (#739)", async () => {
        // The byte length is only free where the bytes are local, so this
        // rule can only fire in dexie mode.
        const oversized = new Blob(["x"], {type: "image/png"})
        Object.defineProperty(oversized, "size", {
            value: 60 * 1024 * 1024,
            configurable: true,
        })
        getStorageMock.mockReturnValue({
            mode: "dexie",
            assets: {getBlob: vi.fn().mockResolvedValue(oversized)},
        })
        const onCanAdvanceChange = vi.fn()
        render(
            <CoverValidation
                book={makeBook({cover_image: "cover.png"})}
                onCanAdvanceChange={onCanAdvanceChange}
            />,
        )
        await screen.findByTestId("kdp-publishing-wizard-step-1-preview")
        fireImageLoad(1600, 2560)
        await waitFor(() => {
            expect(
                screen.getByTestId(
                    "kdp-publishing-wizard-step-1-error-file_size_exceeded",
                ),
            ).toBeTruthy()
        })
        expect(onCanAdvanceChange).toHaveBeenLastCalledWith(false)
    })

    it("online, the byte-length rule abstains rather than guessing (#739)", async () => {
        // api mode has only a URL for the asset. The step must not fetch
        // the whole cover to weigh it, and must not report a size verdict
        // it cannot have reached.
        const getBlob = vi.fn()
        getStorageMock.mockReturnValue({mode: "api", assets: {getBlob}})
        render(
            <CoverValidation
                book={makeBook({cover_image: "cover.jpg"})}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        fireImageLoad(1600, 2560)
        await waitFor(() => {
            expect(
                screen.getByTestId("kdp-publishing-wizard-step-1-summary-ok"),
            ).toBeTruthy()
        })
        expect(getBlob).not.toHaveBeenCalled()
        expect(
            screen.queryByTestId(
                "kdp-publishing-wizard-step-1-error-file_size_exceeded",
            ),
        ).toBeNull()
    })

    it("dexie/offline mode renders the cover from a blob URL, not /api (#300)", async () => {
        getStorageMock.mockReturnValue({
            mode: "dexie",
            assets: {
                getBlob: vi
                    .fn()
                    .mockResolvedValue(new Blob(["x"], {type: "image/png"})),
            },
        })
        render(
            <CoverValidation
                book={makeBook({id: "book-77", cover_image: "cover.png"})}
                onCanAdvanceChange={vi.fn()}
            />,
        )
        // The preview only mounts once the dexie blob resolves (useCoverUrl is
        // null while loading), so wait for it, then assert it is a blob: URL
        // and never the backendless-404-prone /api path.
        const img = (await screen.findByTestId(
            "kdp-publishing-wizard-step-1-preview",
        )) as HTMLImageElement
        await waitFor(() => expect(img.src).toMatch(/^blob:/))
        expect(img.src).not.toContain("/api/")
    })
})
