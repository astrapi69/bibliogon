/**
 * Tests for PageCanvas.
 *
 * Session 3 Commit 5: image-area placeholder vs <img>, upload
 * button label, file-input -> api.assets.upload, text-on-blur
 * save, draft re-sync on active-page change.
 *
 * Session 4 Commit 1 (layout-aware rendering): data-layout attr
 * per layout, per-layout CSS-Module class application, region
 * wrappers present (image + text), text_only hides image area
 * + upload action, speech_bubble renders a positioned bubble
 * wrapper, layout-change triggers re-render. Drag, image-upload,
 * and text-input continue to work in every layout.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import PageCanvas from "./PageCanvas"
import type {Page, Asset} from "../api/client"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

const mockUpload = vi.fn()
vi.mock("../api/client", () => ({
    api: {
        assets: {
            upload: (...args: unknown[]) => mockUpload(...args),
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
        speech_bubble_config: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    }
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: "asset-1",
        book_id: "b1",
        filename: "img.png",
        asset_type: "figure",
        path: "/uploads/b1/figure/img.png",
        uploaded_at: new Date().toISOString(),
        ...overrides,
    }
}

beforeEach(() => {
    mockUpload.mockReset()
})

describe("PageCanvas - image area", () => {
    it("renders the placeholder when the page has no image_asset_id", () => {
        render(<PageCanvas page={makePage()} bookId="b1" onUpdate={vi.fn()} />)
        expect(screen.getByTestId("page-canvas-image-placeholder")).toBeTruthy()
        expect(screen.queryByTestId("page-canvas-image")).toBeNull()
    })

    it("renders the <img> with the by-id asset URL when image_asset_id is set", () => {
        render(
            <PageCanvas
                page={makePage({image_asset_id: "asset-1"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const img = screen.getByTestId("page-canvas-image") as HTMLImageElement
        expect(img).toBeTruthy()
        expect(img.getAttribute("src")).toBe("/api/books/b1/assets/asset-1/file")
    })

    it("exposes data-page-id on the root for E2E targeting", () => {
        render(<PageCanvas page={makePage({id: "p7"})} bookId="b1" onUpdate={vi.fn()} />)
        expect(
            screen.getByTestId("page-canvas-root").getAttribute("data-page-id"),
        ).toBe("p7")
    })
})

describe("PageCanvas - upload flow", () => {
    it("button label is 'Upload image' when no image is set", () => {
        render(<PageCanvas page={makePage()} bookId="b1" onUpdate={vi.fn()} />)
        expect(screen.getByTestId("page-canvas-upload-btn").textContent).toContain(
            "Upload image",
        )
    })

    it("button label is 'Replace image' when an image is set", () => {
        render(
            <PageCanvas
                page={makePage({image_asset_id: "asset-1"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(screen.getByTestId("page-canvas-upload-btn").textContent).toContain(
            "Replace image",
        )
    })

    it("calls api.assets.upload with bookId + file + 'figure' when a file is picked", async () => {
        mockUpload.mockResolvedValue(makeAsset({id: "asset-new"}))
        const onUpdate = vi.fn().mockResolvedValue(undefined)
        render(<PageCanvas page={makePage()} bookId="b1" onUpdate={onUpdate} />)
        const file = new File(["x"], "img.png", {type: "image/png"})
        const input = screen.getByTestId("page-canvas-file-input") as HTMLInputElement
        fireEvent.change(input, {target: {files: [file]}})
        await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1))
        const [bookIdArg, fileArg, typeArg] = mockUpload.mock.calls[0]
        expect(bookIdArg).toBe("b1")
        expect(fileArg).toBe(file)
        expect(typeArg).toBe("figure")
    })

    it("invokes onUpdate with the new image_asset_id after upload", async () => {
        mockUpload.mockResolvedValue(makeAsset({id: "asset-new"}))
        const onUpdate = vi.fn().mockResolvedValue(undefined)
        render(<PageCanvas page={makePage()} bookId="b1" onUpdate={onUpdate} />)
        const file = new File(["x"], "img.png", {type: "image/png"})
        fireEvent.change(
            screen.getByTestId("page-canvas-file-input") as HTMLInputElement,
            {target: {files: [file]}},
        )
        await waitFor(() =>
            expect(onUpdate).toHaveBeenCalledWith({image_asset_id: "asset-new"}),
        )
    })

    it("surfaces an upload-error banner when api.assets.upload rejects", async () => {
        mockUpload.mockRejectedValue(new Error("Upload failed: 500"))
        const onUpdate = vi.fn()
        render(<PageCanvas page={makePage()} bookId="b1" onUpdate={onUpdate} />)
        const file = new File(["x"], "img.png", {type: "image/png"})
        fireEvent.change(
            screen.getByTestId("page-canvas-file-input") as HTMLInputElement,
            {target: {files: [file]}},
        )
        await waitFor(() =>
            expect(screen.getByTestId("page-canvas-upload-error")).toBeTruthy(),
        )
        expect(onUpdate).not.toHaveBeenCalled()
    })
})

describe("PageCanvas - text area", () => {
    it("seeds the textarea from page.text_content", () => {
        render(
            <PageCanvas
                page={makePage({text_content: "Hello world"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            (screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement).value,
        ).toBe("Hello world")
    })

    it("invokes onUpdate({text_content}) on blur when the draft changed", async () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined)
        render(<PageCanvas page={makePage()} bookId="b1" onUpdate={onUpdate} />)
        const ta = screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement
        fireEvent.change(ta, {target: {value: "New text"}})
        fireEvent.blur(ta)
        await waitFor(() =>
            expect(onUpdate).toHaveBeenCalledWith({text_content: "New text"}),
        )
    })

    it("collapses an empty draft to text_content: null on blur", async () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined)
        render(
            <PageCanvas
                page={makePage({text_content: "Previous"})}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        )
        const ta = screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement
        fireEvent.change(ta, {target: {value: ""}})
        fireEvent.blur(ta)
        await waitFor(() =>
            expect(onUpdate).toHaveBeenCalledWith({text_content: null}),
        )
    })

    it("does NOT invoke onUpdate on blur when the draft equals the original", async () => {
        const onUpdate = vi.fn()
        render(
            <PageCanvas
                page={makePage({text_content: "Same"})}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        )
        const ta = screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement
        fireEvent.blur(ta)
        await waitFor(() => expect(onUpdate).not.toHaveBeenCalled())
    })

    it("re-syncs the draft when a different page becomes active", () => {
        const onUpdate = vi.fn()
        const {rerender} = render(
            <PageCanvas
                page={makePage({id: "p1", text_content: "First page"})}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        )
        expect(
            (screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement).value,
        ).toBe("First page")
        rerender(
            <PageCanvas
                page={makePage({id: "p2", text_content: "Second page"})}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        )
        expect(
            (screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement).value,
        ).toBe("Second page")
    })
})

// --- Session 4 Commit 1: layout-aware rendering ---

describe("PageCanvas - layout-aware rendering (Session 4 Commit 1)", () => {
    const LAYOUTS = [
        "speech_bubble",
        "image_top_text_bottom",
        "image_left_text_right",
        "image_full_text_overlay",
        "text_only",
    ] as const

    it.each(LAYOUTS)(
        "exposes data-layout='%s' on the canvas root",
        (layout) => {
            render(
                <PageCanvas
                    page={makePage({layout})}
                    bookId="b1"
                    onUpdate={vi.fn()}
                />,
            )
            expect(
                screen.getByTestId("page-canvas-root").getAttribute("data-layout"),
            ).toBe(layout)
        },
    )

    it.each(LAYOUTS)(
        "applies a per-layout CSS-Module class so '%s' renders distinctly",
        (layout) => {
            render(
                <PageCanvas
                    page={makePage({layout})}
                    bookId="b1"
                    onUpdate={vi.fn()}
                />,
            )
            // CSS-Module class names are hashed at build, so we
            // verify the className contains a substring derived
            // from the layout. The PageCanvas.module.css source
            // is the spec-pinning surface in Commit 2.
            const cls = screen.getByTestId("page-canvas-root").className
            // Normalise (camelCase + hash) to a substring search.
            // 'image_top_text_bottom' -> 'ImageTopTextBottom'.
            const camel = layout
                .split("_")
                .map((p) => p[0].toUpperCase() + p.slice(1))
                .join("")
            expect(cls).toContain(`canvasLayout${camel}`)
        },
    )

    it("renders an image region for layouts that show one", () => {
        for (const layout of [
            "speech_bubble",
            "image_top_text_bottom",
            "image_left_text_right",
            "image_full_text_overlay",
        ] as const) {
            const {unmount} = render(
                <PageCanvas
                    page={makePage({layout})}
                    bookId="b1"
                    onUpdate={vi.fn()}
                />,
            )
            expect(screen.getByTestId("page-canvas-image-area")).toBeTruthy()
            unmount()
        }
    })

    it("text_only: omits the image region AND the upload-action bar", () => {
        render(
            <PageCanvas
                page={makePage({layout: "text_only"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(screen.queryByTestId("page-canvas-image-area")).toBeNull()
        expect(screen.queryByTestId("page-canvas-upload-btn")).toBeNull()
        expect(screen.queryByTestId("page-canvas-file-input")).toBeNull()
        // The text region is still the editable surface.
        expect(screen.getByTestId("page-canvas-region-text")).toBeTruthy()
        expect(screen.getByTestId("page-canvas-text-input")).toBeTruthy()
    })

    it("speech_bubble: renders page-canvas-speech-bubble (not page-canvas-region-text)", () => {
        render(
            <PageCanvas
                page={makePage({layout: "speech_bubble"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(screen.getByTestId("page-canvas-speech-bubble")).toBeTruthy()
        expect(screen.queryByTestId("page-canvas-region-text")).toBeNull()
        // The textarea still lives INSIDE the bubble.
        expect(screen.getByTestId("page-canvas-text-input")).toBeTruthy()
    })

    it("non-speech-bubble layouts render page-canvas-region-text (not page-canvas-speech-bubble)", () => {
        for (const layout of [
            "image_top_text_bottom",
            "image_left_text_right",
            "image_full_text_overlay",
            "text_only",
        ] as const) {
            const {unmount} = render(
                <PageCanvas
                    page={makePage({layout})}
                    bookId="b1"
                    onUpdate={vi.fn()}
                />,
            )
            expect(screen.getByTestId("page-canvas-region-text")).toBeTruthy()
            expect(screen.queryByTestId("page-canvas-speech-bubble")).toBeNull()
            unmount()
        }
    })

    it("changing the active page's layout updates data-layout in place", () => {
        const {rerender} = render(
            <PageCanvas
                page={makePage({id: "p1", layout: "image_top_text_bottom"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-root").getAttribute("data-layout"),
        ).toBe("image_top_text_bottom")
        rerender(
            <PageCanvas
                page={makePage({id: "p1", layout: "speech_bubble"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-root").getAttribute("data-layout"),
        ).toBe("speech_bubble")
        expect(screen.getByTestId("page-canvas-speech-bubble")).toBeTruthy()
    })

    it("changing layout to text_only hides the image + upload-action bar in place", () => {
        const {rerender} = render(
            <PageCanvas
                page={makePage({
                    id: "p1",
                    layout: "image_top_text_bottom",
                    image_asset_id: "asset-1",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(screen.getByTestId("page-canvas-image")).toBeTruthy()
        expect(screen.getByTestId("page-canvas-upload-btn")).toBeTruthy()
        rerender(
            <PageCanvas
                page={makePage({
                    id: "p1",
                    layout: "text_only",
                    image_asset_id: "asset-1",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(screen.queryByTestId("page-canvas-image")).toBeNull()
        expect(screen.queryByTestId("page-canvas-upload-btn")).toBeNull()
    })

    it("upload-action bar stays usable in every non-text_only layout", async () => {
        mockUpload.mockResolvedValue(makeAsset({id: "asset-new"}))
        for (const layout of [
            "speech_bubble",
            "image_top_text_bottom",
            "image_left_text_right",
            "image_full_text_overlay",
        ] as const) {
            const onUpdate = vi.fn().mockResolvedValue(undefined)
            const {unmount} = render(
                <PageCanvas
                    page={makePage({layout})}
                    bookId="b1"
                    onUpdate={onUpdate}
                />,
            )
            const file = new File(["x"], "img.png", {type: "image/png"})
            fireEvent.change(
                screen.getByTestId("page-canvas-file-input") as HTMLInputElement,
                {target: {files: [file]}},
            )
            await waitFor(() =>
                expect(onUpdate).toHaveBeenCalledWith({image_asset_id: "asset-new"}),
            )
            unmount()
            mockUpload.mockClear()
        }
    })

    it("text-blur saves text_content in every layout (including speech_bubble + overlay + text_only)", async () => {
        for (const layout of [
            "speech_bubble",
            "image_top_text_bottom",
            "image_left_text_right",
            "image_full_text_overlay",
            "text_only",
        ] as const) {
            const onUpdate = vi.fn().mockResolvedValue(undefined)
            const {unmount} = render(
                <PageCanvas
                    page={makePage({layout})}
                    bookId="b1"
                    onUpdate={onUpdate}
                />,
            )
            const ta = screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement
            fireEvent.change(ta, {target: {value: `Text in ${layout}`}})
            fireEvent.blur(ta)
            await waitFor(() =>
                expect(onUpdate).toHaveBeenCalledWith({
                    text_content: `Text in ${layout}`,
                }),
            )
            unmount()
        }
    })
})
