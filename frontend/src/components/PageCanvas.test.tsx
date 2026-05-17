/**
 * Tests for PageCanvas (PB-PHASE4 Session 3 Commit 5).
 *
 * Covers: image-area placeholder vs <img> based on image_asset_id,
 * upload-button label change ("Upload image" / "Replace image"),
 * file-input wiring to api.assets.upload, onUpdate dispatch with
 * the new image_asset_id / text_content, text-on-blur save flow,
 * draft re-sync when the active page changes.
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
