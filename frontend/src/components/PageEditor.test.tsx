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
import {expectNoA11yViolations} from "../test-utils/a11y"

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
const mockDelete = vi.fn()
const mockUploadAsset = vi.fn()
const mockDocumentExportDownload = vi.fn()
const mockNotifyError = vi.fn()
const mockConfirm = vi.fn()

vi.mock("./AppDialog", () => ({
    useDialog: () => ({
        confirm: (...args: unknown[]) => mockConfirm(...args),
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}))

vi.mock("../api/client", () => ({
    api: {
        pages: {
            list: (...args: unknown[]) => mockList(...args),
            create: (...args: unknown[]) => mockCreate(...args),
            reorder: (...args: unknown[]) => mockReorder(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
            delete: (...args: unknown[]) => mockDelete(...args),
        },
        assets: {
            upload: (...args: unknown[]) => mockUploadAsset(...args),
        },
        documentExport: {
            download: (...args: unknown[]) =>
                mockDocumentExportDownload(...args),
        },
        settings: {
            getApp: async () => ({ui: {}}),
            updateApp: async () => ({}),
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
        notes: null,
        story_beat: null,
        mood_color: null,
        act_group: null,
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
    mockDelete.mockReset()
    mockUploadAsset.mockReset()
    mockDocumentExportDownload.mockReset()
    mockNotifyError.mockReset()
    mockConfirm.mockReset()
    mockList.mockResolvedValue([])
    mockDelete.mockResolvedValue(undefined)
    mockConfirm.mockResolvedValue(true)
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

    // PB-PHASE4 Session 4c-B-1 manual smoke Finding D regression pin:
    // every top-level surface (Dashboard, ArticleList, ArticleEditor,
    // Settings, Help, GetStarted, MediumImportPage, ChapterSidebar)
    // mounts ThemeToggle. PageEditor was the 9th confirmed parallel-
    // surface asymmetry instance — pin the toggle's presence here so
    // a future refactor cannot silently drop it again.
    it("renders ThemeToggle in the header (Finding D)", () => {
        render(<PageEditor bookId="b1" bookTitle="My Picture Book" onBack={vi.fn()} />)
        expect(screen.getByTestId("theme-toggle")).toBeTruthy()
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
        // Fix B (4c-B sub-item) supersedes Fix A's layout_config: null
        // purge: per-layout namespacing means each layout's config
        // lives in its own ``layout_config[layout]`` key. The PATCH
        // no longer carries layout_config; sibling-layout namespaces
        // survive the switch untouched, ready to re-apply on switch-back.
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

    /**
     * Fix B (PICTURE-BOOK-TEXT-CONFIGURATION-01, 4c-B sub-item):
     * supersedes Fix A's purge-on-switch behaviour. With per-layout
     * namespacing, the renderer reads ``layout_config[page.layout]``
     * exclusively, so stale cross-layout keys can't bleed through —
     * no purge needed. The PATCH carries ONLY the layout flip.
     *
     * This test pins the new contract: a legacy-flat layout_config
     * does NOT get nulled on switch; the writer migrates it on the
     * next user edit (covered by the legacy-flat-page-promoted test
     * below, now updated for Fix B's namespace shape).
     */
    it("does NOT purge layout_config on layout switch (Fix B namespace preservation)", async () => {
        mockList.mockResolvedValue([
            makePage({
                id: "p1",
                position: 1,
                layout: "speech_bubble",
                layout_config: {
                    speech_bubble: {
                        bubbles: [{anchor_position: "top-right", opacity: 0.7}],
                    },
                },
            }),
        ])
        mockUpdate.mockResolvedValue(
            makePage({
                id: "p1",
                position: 1,
                layout: "image_full_text_overlay",
                layout_config: {
                    speech_bubble: {
                        bubbles: [{anchor_position: "top-right", opacity: 0.7}],
                    },
                },
            }),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-layout-picker")).toBeTruthy(),
        )
        // Phase 1 C4 (2026-05-28): all 8 layouts live in
        // category-grouped sections; no "More layouts" toggle.
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_full_text_overlay"),
        )
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith("b1", "p1", {
                layout: "image_full_text_overlay",
            }),
        )
        // After the round-trip resolves, the speech_bubble namespace
        // is preserved; switching back to speech_bubble would re-find
        // its config. The active-layout namespace (image_full_text_overlay)
        // is absent so the dispatcher shows defaults.
        await waitFor(() => {
            const keys = screen
                .getByTestId("layout-config-root")
                .getAttribute("data-config-keys")
            // image_full_text_overlay's namespace doesn't exist yet,
            // so the dispatcher's body-namespace is null + data-config-keys
            // reads from {} → empty string.
            expect(keys === "" || keys === null).toBe(true)
        })
    })

    /**
     * PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01: when switching
     * FROM a TipTap layout (image_top_text_bottom / image_left_text_right
     * / text_only) TO a Tier-Property layout (speech_bubble /
     * image_full_text_overlay), the PATCH carries the extracted
     * plain-text version of ``text_content`` alongside the layout
     * flip. Symmetric direction (Tier-Property → TipTap) does NOT
     * convert (parseTextContentToJson wraps plain text on read).
     */
    it("converts text_content TipTap → Tier-Property on layout switch", async () => {
        const tiptapJson = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [{type: "text", text: "Hello world"}],
                },
            ],
        })
        mockList.mockResolvedValue([
            makePage({
                id: "p1",
                position: 1,
                layout: "image_top_text_bottom",
                text_content: tiptapJson,
            }),
        ])
        mockUpdate.mockResolvedValue(
            makePage({
                id: "p1",
                position: 1,
                layout: "speech_bubble",
                text_content: "Hello world",
            }),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-layout-picker")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("page-editor-layout-option-speech_bubble"))
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith("b1", "p1", {
                layout: "speech_bubble",
                text_content: "Hello world",
            }),
        )
    })

    it("does NOT convert text_content on Tier-Property → TipTap switch", async () => {
        mockList.mockResolvedValue([
            makePage({
                id: "p1",
                position: 1,
                layout: "speech_bubble",
                text_content: "Plain caption",
            }),
        ])
        mockUpdate.mockResolvedValue(
            makePage({
                id: "p1",
                position: 1,
                layout: "image_top_text_bottom",
                text_content: "Plain caption",
            }),
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
    })

    it("does NOT convert text_content on TipTap → TipTap switch", async () => {
        const tiptapJson = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [{type: "text", text: "Body text"}],
                },
            ],
        })
        mockList.mockResolvedValue([
            makePage({
                id: "p1",
                position: 1,
                layout: "image_top_text_bottom",
                text_content: tiptapJson,
            }),
        ])
        mockUpdate.mockResolvedValue(
            makePage({
                id: "p1",
                position: 1,
                layout: "text_only",
                text_content: tiptapJson,
            }),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-layout-picker")).toBeTruthy(),
        )
        // text_only sits behind the "More layouts" disclosure.
        fireEvent.click(screen.getByTestId("page-editor-layout-option-text_only"))
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith("b1", "p1", {
                layout: "text_only",
            }),
        )
    })

    it("does NOT include text_content when source page has null text_content", async () => {
        mockList.mockResolvedValue([
            makePage({
                id: "p1",
                position: 1,
                layout: "image_top_text_bottom",
                text_content: null,
            }),
        ])
        mockUpdate.mockResolvedValue(
            makePage({
                id: "p1",
                position: 1,
                layout: "speech_bubble",
            }),
        )
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-layout-picker")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("page-editor-layout-option-speech_bubble"))
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith("b1", "p1", {
                layout: "speech_bubble",
            }),
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

    /**
     * Fix B (PICTURE-BOOK-TEXT-CONFIGURATION-01, 4c-B sub-item) —
     * **load-bearing preservation test**.
     *
     * Per backlog: "Tests must include a switch → switch-back
     * assertion that prior config re-applies after returning to
     * a layout."
     *
     * Scenario: a page starts on speech_bubble with a bubbles[0]
     * anchor preset. User switches to image_full_text_overlay and
     * edits a property there. Switches BACK to speech_bubble. The
     * prior bubbles[0] anchor must re-apply (NOT default-to-bottom-
     * center as it would under Fix A's purge-on-switch behaviour).
     *
     * Integration coverage: exercises the full read+write chain
     * through the dispatcher + the namespace helpers + the
     * handler + the data-config-keys serialization.
     */
    it("preserves prior speech_bubble config across switch → switch-back (Fix B preservation pin)", async () => {
        // Start: speech_bubble with bubbles[0] anchor=top-left.
        const initialConfig = {
            speech_bubble: {
                bubbles: [{anchor_position: "top-left", opacity: 0.7}],
            },
        }
        const initial = makePage({
            id: "p1",
            layout: "speech_bubble",
            layout_config: initialConfig,
        })
        mockList.mockResolvedValue([initial])
        // Stateful mock: api.pages.update returns the new state
        // each call, threading the layout_config + layout flips
        // through. This simulates the backend honouring the
        // request payload exactly.
        let currentState = initial
        mockUpdate.mockImplementation(async (_bookId, _pageId, updates) => {
            currentState = {...currentState, ...updates} as typeof initial
            return currentState
        })
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("layout-config-root")).toBeTruthy(),
        )
        // Confirm initial namespace is read into the body.
        await waitFor(() => {
            expect(
                screen
                    .getByTestId("layout-config-root")
                    .getAttribute("data-layout"),
            ).toBe("speech_bubble")
        })
        // Step 1: switch to image_full_text_overlay.
        // image_full_text_overlay sits behind the "More layouts"
        // disclosure.
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_full_text_overlay"),
        )
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("layout-config-root")
                    .getAttribute("data-layout"),
            ).toBe("image_full_text_overlay"),
        )
        // Step 2: edit a property on image_full_text_overlay
        // (text_position dropdown). This triggers the writer to
        // create the image_full_text_overlay namespace alongside
        // the preserved speech_bubble namespace.
        fireEvent.change(
            screen.getByTestId("image-full-text-position-trigger"),
            {target: {value: "top"}},
        )
        await waitFor(() => {
            // The handler called update with the new image_full
            // namespace + the preserved speech_bubble namespace.
            const lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1]
            const updatesArg = lastCall[2]
            expect(updatesArg.layout_config?.image_full_text_overlay).toEqual({
                text_position: "top",
            })
            // Preservation pin: speech_bubble namespace survives
            // the image_full_text_overlay write.
            expect(updatesArg.layout_config?.speech_bubble).toEqual({
                bubbles: [{anchor_position: "top-left", opacity: 0.7}],
            })
        })
        // Step 3: switch BACK to speech_bubble.
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-speech_bubble"),
        )
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("layout-config-root")
                    .getAttribute("data-layout"),
            ).toBe("speech_bubble"),
        )
        // Step 4: the speech_bubble namespace's bubbles[0] keys
        // re-appear in data-config-keys. THIS is the load-bearing
        // pin: under Fix A purge, the body would see no keys
        // (empty layout_config). Under Fix B, the namespace
        // survived the round-trip + re-applies on switch-back.
        await waitFor(() => {
            const keys = screen
                .getByTestId("layout-config-root")
                .getAttribute("data-config-keys")!
                .split(",")
                .filter(Boolean)
                .sort()
            // The speech_bubble namespace contains {bubbles: [...]}
            // → after readLayoutNamespace it becomes the body's
            // config, and Object.keys() yields ["bubbles"].
            expect(keys).toContain("bubbles")
        })
    })

    /**
     * Session 2 C4: parallel switch-→-switch-back preservation
     * pin for IMAGE LAYOUTS. Same shape as the Session 1 C4
     * speech_bubble pin, but for image_top_text_bottom →
     * image_left_text_right → image_top_text_bottom. Pins that
     * Fix B's per-layout namespacing keeps the image_top Tier
     * config alive when the user goes through image_left.
     */
    it("preserves image_top_text_bottom Tier config across switch to image_left and back (Fix B + Session 2)", async () => {
        const initialConfig = {
            image_top_text_bottom: {
                image_position: "right",
                image_fit: "cover",
                font_family: "Atkinson Hyperlegible",
                font_size: 16,
            },
        }
        const initial = makePage({
            id: "p1",
            layout: "image_top_text_bottom",
            layout_config: initialConfig,
        })
        mockList.mockResolvedValue([initial])
        let currentState = initial
        mockUpdate.mockImplementation(async (_bookId, _pageId, updates) => {
            currentState = {...currentState, ...updates} as typeof initial
            return currentState
        })
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("layout-config-root")).toBeTruthy(),
        )
        await waitFor(() => {
            expect(
                screen
                    .getByTestId("layout-config-root")
                    .getAttribute("data-layout"),
            ).toBe("image_top_text_bottom")
        })
        // Step 1: switch to image_left_text_right.
        // image_left_text_right sits behind the "More layouts"
        // disclosure (not in the DEFAULT_LAYOUTS primary set).
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_left_text_right"),
        )
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("layout-config-root")
                    .getAttribute("data-layout"),
            ).toBe("image_left_text_right"),
        )
        // Step 2: edit something on image_left to trigger a write.
        // image_left's split-ratio slider is debounced; pick a
        // discrete control instead — image_fit dropdown.
        fireEvent.change(screen.getByTestId("image-left-image-fit-trigger"), {
            target: {value: "cover"},
        })
        await waitFor(() => {
            const lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1]
            const updatesArg = lastCall[2]
            // image_left namespace created.
            expect(updatesArg.layout_config?.image_left_text_right).toBeTruthy()
            // image_top namespace PRESERVED across the write.
            expect(updatesArg.layout_config?.image_top_text_bottom).toEqual({
                image_position: "right",
                image_fit: "cover",
                font_family: "Atkinson Hyperlegible",
                font_size: 16,
            })
        })
        // Step 3: switch BACK to image_top_text_bottom.
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_top_text_bottom"),
        )
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("layout-config-root")
                    .getAttribute("data-layout"),
            ).toBe("image_top_text_bottom"),
        )
        // Step 4: the image_top namespace re-appears in the body
        // config (data-config-keys reflects the namespace's keys).
        await waitFor(() => {
            const keys = screen
                .getByTestId("layout-config-root")
                .getAttribute("data-config-keys")!
                .split(",")
                .filter(Boolean)
                .sort()
            // The image_top namespace contains image_position +
            // image_fit + font_family + font_size.
            expect(keys).toContain("image_position")
            expect(keys).toContain("font_family")
        })
    })
})

// --- 4c-B-2 C5: handleUpdateLayoutConfig + bubbles[0] wrapper ---
//
// Each write from LayoutConfigSpeechBubble carries the full
// bubble (writeBubble merges prior fields with the partial).
// PageEditor's handleUpdateLayoutConfig does a shallow merge at
// the top level — bubbles[] gets replaced as a whole, which is
// correct because we always send the full bubble. These tests
// pin that contract so any future refactor to handleUpdateLayoutConfig
// (deep-merge, replace-vs-merge change, etc.) is caught.

describe("PageEditor handleUpdateLayoutConfig + bubbles[0] (4c-B-2 C5 + Fix B)", () => {
    it("anchor click writes layout_config.speech_bubble.bubbles[0] with prior fields preserved", async () => {
        // Fix B (4c-B sub-item): layout_config is now namespaced
        // per-layout. speech_bubble's bubbles[0] wrapper lives INSIDE
        // the speech_bubble namespace.
        const initial = makePage({
            id: "p1",
            layout: "speech_bubble",
            layout_config: {
                speech_bubble: {
                    bubbles: [
                        {
                            anchor_position: "bottom-center",
                            opacity: 0.6,
                            bubble_width: 55,
                        },
                    ],
                },
            },
        })
        mockList.mockResolvedValue([initial])
        mockUpdate.mockImplementation(async (_bookId, _pageId, updates) => ({
            ...initial,
            ...updates,
        }))
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("speech-bubble-anchor-top-left")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("speech-bubble-anchor-top-left"))
        await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
        const [, , updates] = mockUpdate.mock.calls[0]
        // The merged layout_config sent to the API carries
        // speech_bubble.bubbles[0] with the new anchor + the preserved
        // opacity + bubble_width.
        expect(updates.layout_config).toBeTruthy()
        const sbNamespace = updates.layout_config.speech_bubble
        expect(sbNamespace).toBeTruthy()
        expect(sbNamespace.bubbles).toHaveLength(1)
        expect(sbNamespace.bubbles[0].anchor_position).toBe("top-left")
        expect(sbNamespace.bubbles[0].opacity).toBe(0.6)
        expect(sbNamespace.bubbles[0].bubble_width).toBe(55)
    })

    it("legacy flat-shape page migrates into speech_bubble namespace + bubbles[0] on first edit", async () => {
        // Fix B migration: legacy flat layout_config is treated as
        // belonging to the current layout. The first write through
        // writeLayoutNamespace migrates {anchor_position: ...} into
        // {speech_bubble: {anchor_position: ...}}, then writeBubble
        // pulls those flat fields into bubbles[0].
        const legacy = makePage({
            id: "p1",
            layout: "speech_bubble",
            layout_config: {
                anchor_position: "center",
                opacity: 0.8,
                bubble_width: 45,
                bubble_height: 35,
            },
        })
        mockList.mockResolvedValue([legacy])
        mockUpdate.mockImplementation(async (_bookId, _pageId, updates) => ({
            ...legacy,
            ...updates,
        }))
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(
                screen.getByTestId("speech-bubble-anchor-top-right"),
            ).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("speech-bubble-anchor-top-right"))
        await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
        const [, , updates] = mockUpdate.mock.calls[0]
        // Migrated: layout_config now carries speech_bubble.bubbles[0]
        // with the canonical new state. Read-path shim honours
        // bubbles[0] precedence and reads flat keys as fallback.
        const sbNamespace = updates.layout_config.speech_bubble
        expect(sbNamespace).toBeTruthy()
        expect(sbNamespace.bubbles).toHaveLength(1)
        const written = sbNamespace.bubbles[0]
        expect(written.anchor_position).toBe("top-right")
        expect(written.opacity).toBe(0.8)
        expect(written.bubble_width).toBe(45)
        expect(written.bubble_height).toBe(35)
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

// --- PDF-KDP-FORMATS-01 C2: format dropdown + localStorage ---

describe("PageEditor PDF format dropdown (PDF-KDP-FORMATS-01 C2)", () => {
    beforeEach(() => {
        // Clean slate per test: format selection is browser-scoped.
        // happy-dom recreates localStorage per test file by default,
        // but explicit clear avoids cross-test leakage WITHIN this
        // describe block.
        localStorage.clear()
    })

    it("renders the format dropdown next to Export PDF with the 5 KDP formats", () => {
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const select = screen.getByTestId(
            "page-editor-pdf-format-trigger",
        ) as HTMLSelectElement
        const values = Array.from(select.options).map((o) => o.value)
        expect(values).toEqual([
            "8.5x8.5",
            "8x10",
            "8.5x11",
            "11x8.5",
            "10x8",
        ])
    })

    it("defaults to 8.5x8.5 when localStorage is empty (MVP back-compat)", () => {
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const select = screen.getByTestId(
            "page-editor-pdf-format-trigger",
        ) as HTMLSelectElement
        expect(select.value).toBe("8.5x8.5")
    })

    it("Export PDF with default 8.5x8.5 sends empty params (back-compat)", async () => {
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        fireEvent.click(screen.getByTestId("page-editor-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.toString()).toBe("")
    })

    it("changing format to a non-default value persists to React state (workspace default lives in app.yaml now)", () => {
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const select = screen.getByTestId(
            "page-editor-pdf-format-trigger",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "8.5x11"}})
        expect(select.value).toBe("8.5x11")
        // Inline picks are session-only since the Settings-
        // Completeness audit close (2026-05-27) moved the workspace
        // default to app.yaml under ``ui.picture_book.pdf_default_*``.
        expect(localStorage.getItem("bibliogon-picture-book-format")).toBeNull()
    })

    it("Export PDF with non-default format passes picture_book_format query param", async () => {
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const select = screen.getByTestId(
            "page-editor-pdf-format-trigger",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "11x8.5"}})
        fireEvent.click(screen.getByTestId("page-editor-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.get("picture_book_format")).toBe("11x8.5")
    })

    it("legacy localStorage value initialises the dropdown on mount as a migration fallback", async () => {
        // Seed legacy localStorage BEFORE PageEditor mounts. The
        // workspace default fetched via api.settings.getApp is empty
        // (the mock returns ``{ui: {}}``), so the migration path
        // falls back to the legacy value.
        localStorage.setItem("bibliogon-picture-book-format", "10x8")
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const select = (await screen.findByTestId(
            "page-editor-pdf-format-trigger",
        )) as HTMLSelectElement
        await waitFor(() => expect(select.value).toBe("10x8"))
    })

    it("unknown localStorage value falls back to 8.5x8.5 default (gamma-shim)", () => {
        localStorage.setItem("bibliogon-picture-book-format", "garbage")
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const select = screen.getByTestId(
            "page-editor-pdf-format-trigger",
        ) as HTMLSelectElement
        expect(select.value).toBe("8.5x8.5")
    })

    it("changing back to default 8.5x8.5 returns to empty-params export", async () => {
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        const select = screen.getByTestId(
            "page-editor-pdf-format-trigger",
        ) as HTMLSelectElement
        // Flip away from default + back.
        fireEvent.change(select, {target: {value: "8x10"}})
        fireEvent.change(select, {target: {value: "8.5x8.5"}})
        fireEvent.click(screen.getByTestId("page-editor-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.toString()).toBe("")
    })
})

describe("PageEditor handleDeletePage (PAGES-DELETE-EDITOR-UI-01 C2)", () => {
    it("shows the confirm dialog with i18n title + message + danger variant", async () => {
        mockList.mockResolvedValue([makePage({id: "p1", position: 1})])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-delete-page-p1")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("page-editor-delete-page-p1"))
        await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
        const [title, message, variant] = mockConfirm.mock.calls[0]
        expect(title).toBe("Delete page?")
        expect(message).toContain("cannot be undone")
        expect(variant).toBe("danger")
    })

    it("calls api.pages.delete and removes the row from local state on confirm", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-delete-page-p2")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("page-editor-delete-page-p2"))
        await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("b1", "p2"))
        await waitFor(() =>
            expect(screen.queryByTestId("page-editor-page-row-p2")).toBeNull(),
        )
        expect(screen.getByTestId("page-editor-page-row-p1")).toBeTruthy()
    })

    it("does NOT call api.pages.delete when the user cancels the confirm", async () => {
        mockConfirm.mockResolvedValue(false)
        mockList.mockResolvedValue([makePage({id: "p1", position: 1})])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(screen.getByTestId("page-editor-delete-page-p1")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("page-editor-delete-page-p1"))
        await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
        expect(mockDelete).not.toHaveBeenCalled()
        expect(screen.getByTestId("page-editor-page-row-p1")).toBeTruthy()
    })

    it("auto-selects the next page when the active page is deleted", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        // p1 is auto-selected on mount.
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("page-editor-canvas")
                    .getAttribute("data-active-page-id"),
            ).toBe("p1"),
        )
        fireEvent.click(screen.getByTestId("page-editor-delete-page-p1"))
        await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("b1", "p1"))
        // p2 should become active now that p1 is gone.
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("page-editor-canvas")
                    .getAttribute("data-active-page-id"),
            ).toBe("p2"),
        )
    })

    it("clears activePageId to null when the last page is deleted", async () => {
        mockList.mockResolvedValue([makePage({id: "p1", position: 1})])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("page-editor-canvas")
                    .getAttribute("data-active-page-id"),
            ).toBe("p1"),
        )
        fireEvent.click(screen.getByTestId("page-editor-delete-page-p1"))
        await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("b1", "p1"))
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("page-editor-canvas")
                    .getAttribute("data-active-page-id"),
            ).toBe(""),
        )
        // Empty-state should reappear.
        expect(screen.getByTestId("page-editor-thumbnails-empty")).toBeTruthy()
    })

    it("preserves the active page when a DIFFERENT page is deleted", async () => {
        mockList.mockResolvedValue([
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2}),
            makePage({id: "p3", position: 3}),
        ])
        render(<PageEditor bookId="b1" bookTitle="Test" onBack={vi.fn()} />)
        // Click p2 to make it active.
        await waitFor(() => expect(screen.getByTestId("page-editor-page-row-p2")).toBeTruthy())
        fireEvent.click(screen.getByTestId("page-editor-page-row-p2"))
        await waitFor(() =>
            expect(
                screen
                    .getByTestId("page-editor-canvas")
                    .getAttribute("data-active-page-id"),
            ).toBe("p2"),
        )
        // Delete p1 (not active). p2 should stay active.
        fireEvent.click(screen.getByTestId("page-editor-delete-page-p1"))
        await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("b1", "p1"))
        expect(
            screen
                .getByTestId("page-editor-canvas")
                .getAttribute("data-active-page-id"),
        ).toBe("p2")
    })

    describe("accessibility (axe)", () => {
        it("has no axe violations on initial render", async () => {
            const {container} = render(
                <PageEditor
                    bookId="b1"
                    bookTitle="My Picture Book"
                    onBack={vi.fn()}
                    onShowMetadata={vi.fn()}
                />,
            )
            await expectNoA11yViolations(container)
        })
    })
})
