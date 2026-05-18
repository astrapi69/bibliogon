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
const mockDocumentExportDownload = vi.fn()
const mockNotifyError = vi.fn()

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
        documentExport: {
            download: (...args: unknown[]) =>
                mockDocumentExportDownload(...args),
        },
    },
    ApiError: class ApiError extends Error {
        status: number
        detail: string
        endpoint: string
        method: string
        stacktrace: string
        timestamp: string
        constructor(
            status: number,
            detail: string,
            endpoint: string = "",
            method: string = "GET",
            stacktrace: string = "",
            timestamp: string = "",
        ) {
            super(detail)
            this.status = status
            this.detail = detail
            this.endpoint = endpoint
            this.method = method
            this.stacktrace = stacktrace
            this.timestamp = timestamp
            this.name = "ApiError"
        }
    },
}))

vi.mock("../utils/notify", () => ({
    notify: {
        error: (...args: unknown[]) => mockNotifyError(...args),
        success: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
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
    mockDocumentExportDownload.mockReset()
    mockNotifyError.mockReset()
    mockList.mockResolvedValue([])
    mockDocumentExportDownload.mockResolvedValue(undefined)
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
                layout_config: null,
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

    /**
     * PB-PHASE4 Session 4c-A regression pin: purge layout_config on
     * layout switch (v0.33.1). Before the fix, the update payload was
     * just {layout: <new>}, leaving stale layout_config keys from the
     * previous layout — e.g. speech_bubble's image_fit:"cover" survived
     * a switch to image_full_text_overlay and cropped the image
     * unexpectedly. The fix sets layout_config: null in the same
     * payload so the dict is purged atomically with the layout flip.
     */
    it("purges layout_config to null when the layout changes (Session 4c-A Bug A + Bug C regression pin)", async () => {
        mockList.mockResolvedValue([
            makePage({
                id: "p1",
                position: 1,
                layout: "speech_bubble",
                layout_config: {
                    anchor_position: "top-right",
                    opacity: 0.7,
                    image_fit: "cover",
                    bubble_size_width_pct: 50,
                },
            }),
        ])
        mockUpdate.mockResolvedValue(
            makePage({
                id: "p1",
                position: 1,
                layout: "image_full_text_overlay",
                layout_config: null,
            }),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-layout-picker")).toBeTruthy(),
        )
        // image_full_text_overlay sits behind the "More layouts" disclosure.
        fireEvent.click(screen.getByTestId("page-editor-layout-more-toggle"))
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_full_text_overlay"),
        )
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith("b1", "p1", {
                layout: "image_full_text_overlay",
                layout_config: null,
            }),
        )
        // After the round-trip resolves, the optimistic state reflects
        // the canonical updated row with layout_config null.
        await waitFor(() => {
            const keys = screen
                .getByTestId("layout-config-root")
                .getAttribute("data-config-keys")
            expect(keys === "" || keys === null).toBe(true)
        })
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

    it("text-blur updates the page via api.pages.update (Tier-Property layout)", async () => {
        // PB-PHASE4 Session 4c-B-1 Commit 2: textarea blur-to-
        // save behavior now applies only to Tier-Property layouts
        // (speech_bubble + image_full_text_overlay). TipTap layouts
        // save via the debounced RichTextEditor onChange path —
        // exercised in the 4c-B-1 Playwright spec (Commit 6).
        mockList.mockResolvedValue([
            makePage({
                id: "p1",
                position: 1,
                layout: "speech_bubble",
                text_content: null,
            }),
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

// --- Session 4c Commit 3: handleUpdateLayoutConfig wiring ---

describe("PageEditor + LayoutConfig wiring (Session 4c Commit 3)", () => {
    it("LayoutConfig mounts in the properties pane when a page is active", async () => {
        mockList.mockResolvedValue([makePage({id: "p1", position: 1})])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("layout-config-root")).toBeTruthy(),
        )
    })

    it("LayoutConfig does NOT mount when no page is active (no pages)", async () => {
        mockList.mockResolvedValue([])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-properties-empty")).toBeTruthy(),
        )
        expect(screen.queryByTestId("layout-config-root")).toBeNull()
    })

    it("data-layout on LayoutConfig matches the active page's layout", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", layout: "image_left_text_right"}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(
                screen.getByTestId("layout-config-root").getAttribute("data-layout"),
            ).toBe("image_left_text_right"),
        )
    })

    it("data-layout flips when the user picks a different layout", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", layout: "speech_bubble"}),
        ])
        mockUpdate.mockResolvedValue(
            makePage({id: "p1", layout: "image_top_text_bottom"}),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("layout-config-root")).toBeTruthy(),
        )
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_top_text_bottom"),
        )
        await waitFor(() =>
            expect(
                screen.getByTestId("layout-config-root").getAttribute("data-layout"),
            ).toBe("image_top_text_bottom"),
        )
    })

    it("data-config-keys reflects the active page's persisted layout_config keys", async () => {
        mockList.mockResolvedValue([
            makePage({
                id: "p1",
                layout: "speech_bubble",
                layout_config: {anchor_position: "top-right", opacity: 0.7},
            }),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() => {
            const keys = screen
                .getByTestId("layout-config-root")
                .getAttribute("data-config-keys")!
                .split(",")
                .sort()
            expect(keys).toEqual(["anchor_position", "opacity"])
        })
    })
})

// --- PB-PHASE4 Session 4c-B-1 Commit 3: RichTextToolbar wiring ---

describe("PageEditor RichTextToolbar wiring (Session 4c-B-1 Commit 3)", () => {
    it("renders the Toolbar root when the active page is a TipTap layout", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", layout: "text_only"}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        // RichTextEditor needs a tick to mount + fire onEditorReady;
        // the Toolbar then renders.
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-toolbar-root")).toBeTruthy(),
        )
        // Sanity: a few D1 buttons present.
        expect(screen.getByTestId("page-editor-toolbar-bold")).toBeTruthy()
        expect(screen.getByTestId("page-editor-toolbar-h2")).toBeTruthy()
        expect(screen.getByTestId("page-editor-toolbar-align-center")).toBeTruthy()
    })

    it("does NOT render the Toolbar when the active page is a Tier-Property layout (speech_bubble)", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", layout: "speech_bubble"}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        // Allow time for any onEditorReady tick to fire.
        await waitFor(() => expect(screen.getByTestId("page-canvas-root")).toBeTruthy())
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(screen.queryByTestId("page-editor-toolbar-root")).toBeNull()
    })

    it("does NOT render the Toolbar when the active page is image_full_text_overlay (Tier-Property)", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", layout: "image_full_text_overlay"}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() => expect(screen.getByTestId("page-canvas-root")).toBeTruthy())
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(screen.queryByTestId("page-editor-toolbar-root")).toBeNull()
    })

    it("Toolbar unmounts when the user switches FROM a TipTap page TO a Tier-Property page", async () => {
        // Direction p1(TipTap) → p2(Tier-Property): Toolbar
        // disappears. The reverse direction (Tier-Property →
        // TipTap remount) is happy-dom-flaky because useEditor's
        // async editor-creation tick can race with PageEditor's
        // page-switch useEffect (observed during development).
        // Covered end-to-end in the 4c-B-1 Playwright spec.
        mockList.mockResolvedValue([
            makePage({id: "p1", layout: "text_only"}),
            makePage({id: "p2", layout: "speech_bubble"}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-toolbar-root")).toBeTruthy(),
        )
        // Switch to p2 (speech_bubble) — Toolbar unmounts.
        fireEvent.click(screen.getByTestId("page-editor-page-row-p2"))
        await waitFor(() =>
            expect(screen.queryByTestId("page-editor-toolbar-root")).toBeNull(),
        )
    })

    it("changing the active page's layout from TipTap to Tier-Property unmounts the Toolbar in place", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", layout: "text_only"}),
        ])
        mockUpdate.mockResolvedValue(
            makePage({id: "p1", layout: "speech_bubble"}),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-toolbar-root")).toBeTruthy(),
        )
        // Click the speech_bubble layout option (visible in
        // the primary picker; no More-Layouts disclosure needed).
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-speech_bubble"),
        )
        await waitFor(() =>
            expect(screen.queryByTestId("page-editor-toolbar-root")).toBeNull(),
        )
    })
})

// --- PB-PHASE4 Session 6 Commit 4: Export-PDF button ---

import {ApiError} from "../api/client"

describe("PageEditor Export-PDF button (Session 6 Commit 4)", () => {
    it("renders the Export PDF button in the header (always visible)", () => {
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        expect(screen.getByTestId("page-editor-export-pdf")).toBeTruthy()
    })

    it("clicking Export PDF calls api.documentExport.download with bookId, 'pdf', and URLSearchParams", async () => {
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        fireEvent.click(screen.getByTestId("page-editor-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [bookId, fmt, params] = mockDocumentExportDownload.mock.calls[0]
        expect(bookId).toBe("b1")
        expect(fmt).toBe("pdf")
        // URLSearchParams instance, intentionally empty (no toc_depth /
        // use_manual_toc / book_type query params apply to picture-books).
        expect(params).toBeInstanceOf(URLSearchParams)
        expect(params.toString()).toBe("")
    })

    it("button disables while export is in flight + re-enables on success", async () => {
        let resolveDownload: ((value: undefined) => void) | undefined
        mockDocumentExportDownload.mockReturnValue(
            new Promise<undefined>((resolve) => {
                resolveDownload = resolve
            }),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const btn = screen.getByTestId("page-editor-export-pdf") as HTMLButtonElement
        fireEvent.click(btn)
        // While in-flight, the button is disabled.
        await waitFor(() => expect(btn.disabled).toBe(true))
        // Resolve the in-flight promise; button re-enables.
        resolveDownload?.(undefined)
        await waitFor(() => expect(btn.disabled).toBe(false))
    })

    it("re-click while exporting is a no-op (does not fire a second API call)", async () => {
        let resolveDownload: ((value: undefined) => void) | undefined
        mockDocumentExportDownload.mockReturnValue(
            new Promise<undefined>((resolve) => {
                resolveDownload = resolve
            }),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const btn = screen.getByTestId("page-editor-export-pdf")
        fireEvent.click(btn)
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        // Second click while the first is still pending — guarded
        // by the `disabled` attribute AND the in-callback exporting
        // check. Either gate prevents a duplicate API call.
        fireEvent.click(btn)
        // Brief tick to allow any spurious second invocation to land.
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1)
        resolveDownload?.(undefined)
    })

    it("ApiError from the route surfaces as notify.error with the server's detail", async () => {
        mockDocumentExportDownload.mockRejectedValue(
            new ApiError(
                400,
                "Picture-books only support PDF export in this release; got fmt='epub'",
                "/books/b1/export/epub",
                "GET",
            ),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        fireEvent.click(screen.getByTestId("page-editor-export-pdf"))
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalledTimes(1))
        expect(mockNotifyError.mock.calls[0][0]).toContain(
            "Picture-books only support PDF",
        )
    })

    it("button re-enables after an error so the user can retry", async () => {
        mockDocumentExportDownload.mockRejectedValue(
            new ApiError(500, "Generator failed", "/books/b1/export/pdf", "GET"),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const btn = screen.getByTestId("page-editor-export-pdf") as HTMLButtonElement
        fireEvent.click(btn)
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalled())
        // Finally block must re-enable the button.
        await waitFor(() => expect(btn.disabled).toBe(false))
    })

    it("non-ApiError rejection still surfaces a fallback error toast", async () => {
        mockDocumentExportDownload.mockRejectedValue(
            new Error("Network down"),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        fireEvent.click(screen.getByTestId("page-editor-export-pdf"))
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalledTimes(1))
        // The fallback uses the i18n fallback string ("PDF-Export
        // fehlgeschlagen"); not the raw error message (which would
        // leak technical detail to the user).
        expect(mockNotifyError.mock.calls[0][0]).toBe("PDF-Export fehlgeschlagen")
    })
})
