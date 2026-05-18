/**
 * Vitest coverage for the ComicBookEditor placeholder.
 *
 * plugin-comics Session 1 Commit 3. The component is a deliberate
 * placeholder per the Half-Wired-Lifecycle exemption noted in the
 * exploration doc — Session 2 will replace it with the full panel
 * + multi-bubble editor. These tests pin the placeholder's
 * contract so a future commit cannot silently strip the
 * Session-1-marker info or the "back to dashboard" affordance.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"
import ComicBookEditor from "./ComicBookEditor"

// Mock useI18n to avoid the full provider chain — same pattern as
// the other component tests in this directory.
vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

// Mock the api client so we can drive the /api/comics/info fetch
// from each test without standing up MSW.
vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>("../api/client")
    return {
        ...actual,
        api: {
            ...actual.api,
            comics: {
                getInfo: vi.fn(),
            },
        },
    }
})

import {api} from "../api/client"

describe("ComicBookEditor", () => {
    beforeEach(() => {
        vi.mocked(api.comics.getInfo).mockImplementation(async () => ({
            name: "comics",
            version: "1.0.0",
            session: 1,
            status: "scaffolding",
            description: "Test description.",
        }))
    })

    afterEach(() => {
        vi.mocked(api.comics.getInfo).mockClear()
    })

    it("renders the book title in the header", () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        )
        const title = screen.getByTestId("comic-book-editor-title")
        expect(title.textContent).toBe("My Comic")
    })

    it("renders the placeholder block with Session-2 marker", () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        )
        const placeholder = screen.getByTestId("comic-book-editor-placeholder")
        // Session-2-marker pin: a future commit shipping Session-2
        // features must update this assertion together with the
        // placeholder copy. The literal "Session 2" appears in the
        // default English fallback string.
        expect(placeholder.textContent).toMatch(/Session 2/)
    })

    it("calls onBack when the back button is clicked", () => {
        const onBack = vi.fn()
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={onBack}
            />,
        )
        fireEvent.click(screen.getByTestId("comic-book-editor-back"))
        expect(onBack).toHaveBeenCalledOnce()
    })

    it("fetches and renders plugin info from /api/comics/info", async () => {
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        )
        // The fetch fires inside useEffect; the dl appears once it
        // resolves.
        const name = await screen.findByTestId("comic-book-editor-plugin-name")
        const session = await screen.findByTestId(
            "comic-book-editor-plugin-session",
        )
        expect(name.textContent).toBe("comics v1.0.0")
        expect(session.textContent).toBe("1 (scaffolding)")
        // The mock was wired through useEffect; verify the call shape.
        expect(api.comics.getInfo).toHaveBeenCalledOnce()
    })

    it("renders an error message when /api/comics/info fails", async () => {
        // Override the per-test mock to reject. The component should
        // surface the detail in the dedicated error slot.
        const {ApiError} = await import("../api/client")
        vi.mocked(api.comics.getInfo).mockImplementation(async () => {
            throw new ApiError(500, "boom", "/comics/info", "GET")
        })
        render(
            <ComicBookEditor
                bookId="book-1"
                bookTitle="My Comic"
                onBack={vi.fn()}
            />,
        )
        const errorEl = await screen.findByTestId(
            "comic-book-editor-plugin-error",
        )
        await waitFor(() => {
            expect(errorEl.textContent).toMatch(/boom/)
        })
    })
})
