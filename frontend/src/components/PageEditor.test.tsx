/**
 * Tests for PageEditor (PB-PHASE4 Session 3 Commit 2 + Commit 3).
 *
 * Commit 2 covers the scaffold (three-pane testids + back button).
 * Commit 3 adds api.pages.list-on-mount + PageThumbnails wiring +
 * add-page flow + reorder flow. Drag simulation is deferred to
 * E2E (per "Radix DropdownMenu + happy-dom is brittle for Vitest"
 * lessons-learned rule, the same brittleness applies to @dnd-kit).
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import PageEditor from "./PageEditor"
import type {Page} from "../api/client"

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
;(globalThis as unknown as {ResizeObserver: typeof ResizeObserverStub}).ResizeObserver =
    ResizeObserverStub

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

const mockList = vi.fn()
const mockCreate = vi.fn()
const mockReorder = vi.fn()
const mockUpdate = vi.fn()
const mockUploadAsset = vi.fn()

vi.mock("../api/client", () => ({
    api: {
        pages: {
            list: (...args: unknown[]) => mockList(...args),
            create: (...args: unknown[]) => mockCreate(...args),
            reorder: (...args: unknown[]) => mockReorder(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
        },
        assets: {
            upload: (...args: unknown[]) => mockUploadAsset(...args),
        },
    },
}))

function makePage(overrides: Partial<Page> = {}): Page {
    return {
        id: "p1",
        book_id: "b1",
        position: 1,
        layout: "image_top_text_bottom",
        text_content: null,
        image_asset_id: null,
        layout_config: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    }
}

beforeEach(() => {
    mockList.mockReset()
    mockCreate.mockReset()
    mockReorder.mockReset()
    mockUpdate.mockReset()
    mockUploadAsset.mockReset()
    mockList.mockResolvedValue([])
})

describe("PageEditor scaffold (Commit 2)", () => {
    it("does NOT render the Metadata button when onShowMetadata prop is not provided", () => {
        render(<PageEditor bookId="b1" bookTitle="My Picture Book" onBack={vi.fn()} />)
        expect(screen.queryByTestId("page-editor-show-metadata")).toBeNull()
    })

    it("renders the Metadata button when onShowMetadata prop is provided", () => {
        const onShowMetadata = vi.fn()
        render(
            <PageEditor
                bookId="b1"
                bookTitle="My Picture Book"
                onBack={vi.fn()}
                onShowMetadata={onShowMetadata}
            />,
        )
        expect(screen.getByTestId("page-editor-show-metadata")).toBeTruthy()
    })

    it("invokes onShowMetadata when the Metadata button is clicked", () => {
        const onShowMetadata = vi.fn()
        render(
            <PageEditor
                bookId="b1"
                bookTitle="My Picture Book"
                onBack={vi.fn()}
                onShowMetadata={onShowMetadata}
            />,
        )
        fireEvent.click(screen.getByTestId("page-editor-show-metadata"))
        expect(onShowMetadata).toHaveBeenCalledTimes(1)
    })

    it("renders the root and exposes data-book-id", async () => {
        render(<PageEditor bookId="b1" bookTitle="My Picture Book" onBack={vi.fn()} />)
        const root = screen.getByTestId("page-editor-root")
        expect(root).toBeTruthy()
        expect(root.getAttribute("data-book-id")).toBe("b1")
    })

    it("renders the book title in the header", () => {
        render(<PageEditor bookId="b1" bookTitle="My Picture Book" onBack={vi.fn()} />)
        expect(screen.getByText("My Picture Book")).toBeTruthy()
    })

    it("renders all three panes", () => {
        render(<PageEditor bookId="b1" bookTitle="My Picture Book" onBack={vi.fn()} />)
        expect(screen.getByTestId("page-editor-thumbnails")).toBeTruthy()
        expect(screen.getByTestId("page-editor-canvas")).toBeTruthy()
        expect(screen.getByTestId("page-editor-properties")).toBeTruthy()
    })

    it("invokes onBack when the back button is clicked", () => {
        const onBack = vi.fn()
        render(<PageEditor bookId="b1" bookTitle="My Picture Book" onBack={onBack} />)
        fireEvent.click(screen.getByTestId("page-editor-back"))
        expect(onBack).toHaveBeenCalledTimes(1)
    })
})

describe("PageEditor + PageThumbnails wiring (Commit 3)", () => {
    it("calls api.pages.list on mount with the book id", async () => {
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() => expect(mockList).toHaveBeenCalledWith("b1"))
    })

    it("renders the empty-state when api returns no pages", async () => {
        mockList.mockResolvedValue([])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-thumbnails-empty")).toBeTruthy(),
        )
    })

    it("renders one row per page when api returns pages", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() => expect(screen.getByTestId("page-editor-page-row-p1")).toBeTruthy())
        expect(screen.getByTestId("page-editor-page-row-p2")).toBeTruthy()
    })

    it("auto-selects the first page after the list resolves", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("page-editor-page-row-p1")
                    .getAttribute("data-active"),
            ).toBe("true"),
        )
        expect(
            screen.getByTestId("page-editor-canvas").getAttribute("data-active-page-id"),
        ).toBe("p1")
    })

    it("clicking a page row updates the active-page id on the canvas", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() => expect(screen.getByTestId("page-editor-page-row-p2")).toBeTruthy())
        fireEvent.click(screen.getByTestId("page-editor-page-row-p2"))
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("page-editor-canvas")
                    .getAttribute("data-active-page-id"),
            ).toBe("p2"),
        )
    })

    it("invokes api.pages.create and appends the new page when + is clicked", async () => {
        mockList.mockResolvedValue([])
        mockCreate.mockResolvedValue(
            makePage({id: "p-new", position: 1, layout: "image_top_text_bottom"}),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-add-page")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("page-editor-add-page"))
        await waitFor(() =>
            expect(mockCreate).toHaveBeenCalledWith("b1", {
                layout: "image_top_text_bottom",
            }),
        )
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-page-row-p-new")).toBeTruthy(),
        )
    })

    it("surfaces a load-error banner when api.pages.list rejects", async () => {
        mockList.mockRejectedValue(new Error("Network down"))
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-load-error")).toBeTruthy(),
        )
        expect(screen.getByTestId("page-editor-load-error").textContent).toContain(
            "Network down",
        )
    })
})

describe("PageEditor + LayoutPicker wiring (Commit 4)", () => {
    it("shows the properties empty-state when no pages exist", async () => {
        mockList.mockResolvedValue([])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-properties-empty")).toBeTruthy(),
        )
        expect(screen.queryByTestId("page-editor-layout-picker")).toBeNull()
    })

    it("renders the LayoutPicker for the active page", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1, layout: "speech_bubble"}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-layout-picker")).toBeTruthy(),
        )
        expect(
            screen
                .getByTestId("page-editor-layout-option-speech_bubble")
                .getAttribute("data-selected"),
        ).toBe("true")
    })

    it("invokes api.pages.update and refreshes the row's data-layout after a layout change", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1, layout: "speech_bubble"}),
        ])
        mockUpdate.mockResolvedValue(
            makePage({id: "p1", position: 1, layout: "image_top_text_bottom"}),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-layout-picker")).toBeTruthy(),
        )
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_top_text_bottom"),
        )
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith("b1", "p1", {
                layout: "image_top_text_bottom",
            }),
        )
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("page-editor-page-row-p1")
                    .getAttribute("data-layout"),
            ).toBe("image_top_text_bottom"),
        )
    })

    it("shows the canvas-empty state when no pages exist", async () => {
        mockList.mockResolvedValue([])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-canvas-empty")).toBeTruthy(),
        )
        expect(screen.queryByTestId("page-canvas-root")).toBeNull()
    })

    it("renders PageCanvas for the active page", async () => {
        mockList.mockResolvedValue([makePage({id: "p1", position: 1})])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() => expect(screen.getByTestId("page-canvas-root")).toBeTruthy())
        expect(
            screen.getByTestId("page-canvas-root").getAttribute("data-page-id"),
        ).toBe("p1")
    })

    it("text-blur updates the page via api.pages.update", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1, text_content: null}),
        ])
        mockUpdate.mockResolvedValue(
            makePage({id: "p1", position: 1, text_content: "Hello"}),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() => expect(screen.getByTestId("page-canvas-root")).toBeTruthy())
        const ta = screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement
        fireEvent.change(ta, {target: {value: "Hello"}})
        fireEvent.blur(ta)
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith("b1", "p1", {
                text_content: "Hello",
            }),
        )
    })

    it("switching the active page reflects the new page's layout in the picker", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1, layout: "speech_bubble"}),
            makePage({id: "p2", position: 2, layout: "text_only"}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-layout-picker")).toBeTruthy(),
        )
        // p1 is selected first; speech_bubble visible by default.
        expect(
            screen
                .getByTestId("page-editor-layout-option-speech_bubble")
                .getAttribute("data-selected"),
        ).toBe("true")
        // Switch to p2 (text_only sits behind "More layouts", but the
        // picker still tracks the selected value internally).
        fireEvent.click(screen.getByTestId("page-editor-page-row-p2"))
        fireEvent.click(screen.getByTestId("page-editor-layout-more-toggle"))
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("page-editor-layout-option-text_only")
                    .getAttribute("data-selected"),
            ).toBe("true"),
        )
    })
})
