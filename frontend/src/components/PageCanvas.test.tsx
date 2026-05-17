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
import fs from "node:fs"
import path from "node:path"

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
        layout_config: null,
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
    // Session 4c D2: the button is icon-only (Upload / RefreshCw)
    // with the human-readable label in aria-label + title so screen
    // readers and hover tooltips both surface it. The textContent
    // assertion that worked on the bottom-bar variant moved to
    // aria-label.
    it("aria-label is 'Upload image' when no image is set", () => {
        render(<PageCanvas page={makePage()} bookId="b1" onUpdate={vi.fn()} />)
        expect(
            screen
                .getByTestId("page-canvas-image-replace")
                .getAttribute("aria-label"),
        ).toBe("Upload image")
    })

    it("aria-label is 'Replace image' when an image is set", () => {
        render(
            <PageCanvas
                page={makePage({image_asset_id: "asset-1"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen
                .getByTestId("page-canvas-image-replace")
                .getAttribute("aria-label"),
        ).toBe("Replace image")
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
        expect(screen.queryByTestId("page-canvas-image-replace")).toBeNull()
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
        expect(screen.getByTestId("page-canvas-image-replace")).toBeTruthy()
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
        expect(screen.queryByTestId("page-canvas-image-replace")).toBeNull()
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

// --- Session 4 Commit 2: visual containers (CSS-Module pins) ---
//
// Per the ChapterSidebar precedent + the "Radix DropdownMenu +
// happy-dom is brittle for Vitest" lessons-learned rule: jsdom
// does not compute layout (no `getComputedStyle` for rules from
// stylesheets), so we pin the source CSS instead. The rules below
// are the visual-container contract that makes the standard
// layouts spatially clear at a glance; rotting any one of them
// resurfaces the Session-3 user-validation complaint
// ("Visual abgrenzung Text vs Image is unclear").

describe("PageCanvas.module.css - visual-container contract (Session 4 Commit 2)", () => {
    const cssPath = path.resolve(__dirname, "./PageCanvas.module.css")
    const css = fs.readFileSync(cssPath, "utf8")

    function blockFor(selector: string): string {
        // Match a CSS-Module rule block. We need a regex that
        // captures everything between `<selector> {` and the
        // matching `}` on a balanced-braces basis. The CSS in this
        // module has no nested braces inside rules, so a non-greedy
        // [^}]* is sufficient.
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const re = new RegExp(`${escaped}\\s*\\{[^}]*\\}`)
        const match = css.match(re)
        return match ? match[0] : ""
    }

    it("the .canvas rule applies an outer frame border", () => {
        const block = blockFor(".canvas")
        expect(block).not.toBe("")
        expect(block).toMatch(/border:\s*1px\s+solid/)
    })

    it("image_top_text_bottom: image region has border-bottom (horizontal divider)", () => {
        const block = blockFor(".canvasLayoutImageTopTextBottom .regionImage")
        expect(block).not.toBe("")
        expect(block).toMatch(/border-bottom:\s*1px\s+solid/)
    })

    it("image_left_text_right: image region has border-right (vertical divider)", () => {
        const block = blockFor(".canvasLayoutImageLeftTextRight .regionImage")
        expect(block).not.toBe("")
        expect(block).toMatch(/border-right:\s*1px\s+solid/)
    })

    it("standard layouts: text region has a background tint to separate from image", () => {
        // The three standard layouts that show a text region above /
        // beside / inside the canvas frame (not overlaid, not in a
        // speech bubble) share one rule that applies a subtle tint.
        // The blockFor helper is shaped for simple selectors; for a
        // grouped selector across three classes we match the source
        // directly.
        const grouped = css.match(
            /\.canvasLayoutImageTopTextBottom \.regionText,\s*\.canvasLayoutImageLeftTextRight \.regionText,\s*\.canvasLayoutTextOnly \.regionText\s*\{[^}]*\}/,
        )
        expect(grouped).not.toBeNull()
        expect(grouped![0]).toMatch(/background:/)
    })

    it("image_full_text_overlay: text region renders WITHOUT a border (full-bleed image preserved)", () => {
        // The overlay text region uses position: absolute + a dark
        // backdrop rather than an outlined container. The grouped
        // 'standard layouts' selector above MUST NOT pick up
        // imageFullTextOverlay — assert by NOT finding the overlay
        // selector among the rules that apply a region border.
        expect(css).not.toMatch(
            /\.canvasLayoutImageFullTextOverlay\s+\.regionImage\s*\{[^}]*border:/,
        )
        expect(css).not.toMatch(
            /\.canvasLayoutImageFullTextOverlay\s+\.regionText\s*\{[^}]*border:/,
        )
    })

    it("speech_bubble: bubble keeps its dedicated visual styling (radius + shadow)", () => {
        const block = blockFor(".canvasLayoutSpeechBubble .regionText")
        expect(block).not.toBe("")
        // The bubble's defining visual cues: pill-shaped radius +
        // depth shadow. Pinning both protects the look from a future
        // refactor that drops the bubble metaphor.
        expect(block).toMatch(/border-radius:/)
        expect(block).toMatch(/box-shadow:/)
    })
})

// --- Session 4c Commit 2: on-image replace-button overlay ---

describe("PageCanvas - on-image replace button overlay (Session 4c Commit 2)", () => {
    const cssPath = path.resolve(__dirname, "./PageCanvas.module.css")
    const css = fs.readFileSync(cssPath, "utf8")

    it("replace button is rendered INSIDE the image region (not in a bottom bar)", () => {
        render(
            <PageCanvas
                page={makePage({image_asset_id: "asset-1"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        // The image-area is the parent; the replace button is a child.
        const imageArea = screen.getByTestId("page-canvas-image-area")
        const btn = screen.getByTestId("page-canvas-image-replace")
        expect(imageArea.contains(btn)).toBe(true)
    })

    it("file input lives inside the image region too (button triggers via ref)", () => {
        render(
            <PageCanvas
                page={makePage({image_asset_id: "asset-1"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const imageArea = screen.getByTestId("page-canvas-image-area")
        const input = screen.getByTestId("page-canvas-file-input")
        expect(imageArea.contains(input)).toBe(true)
    })

    it("text_only: NO replace button + NO file input (no image to upload)", () => {
        render(
            <PageCanvas
                page={makePage({layout: "text_only"})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(screen.queryByTestId("page-canvas-image-replace")).toBeNull()
        expect(screen.queryByTestId("page-canvas-file-input")).toBeNull()
    })

    it("CSS source pins the overlay positioning contract (top + right + position absolute)", () => {
        // Structural assertion per the jsdom-cant-compute-layout
        // discipline (see "Radix DropdownMenu + happy-dom is brittle"
        // lessons-learned rule). The overlay is what makes the button
        // visible-on-hover instead of permanent chrome below the
        // canvas; the rule MUST exist for the UX contract.
        const overlayBlock = css.match(/\.imageReplaceBtn\s*\{[^}]*\}/)
        expect(overlayBlock).not.toBeNull()
        expect(overlayBlock![0]).toMatch(/position:\s*absolute/)
        expect(overlayBlock![0]).toMatch(/top:\s*8px/)
        expect(overlayBlock![0]).toMatch(/right:\s*8px/)
        expect(overlayBlock![0]).toMatch(/opacity:\s*0/)
    })

    it("CSS source pins the hover + focus-within reveal rule", () => {
        // The reveal rule's three triggers — hover, focus-within,
        // focus-visible — are the keyboard-accessibility contract.
        // Without focus-within, a keyboard user tabbing to the
        // button could never see it.
        const revealBlock = css.match(
            /\.regionImage:hover \.imageReplaceBtn,\s*\.regionImage:focus-within \.imageReplaceBtn,\s*\.imageReplaceBtn:focus-visible\s*\{[^}]*\}/,
        )
        expect(revealBlock).not.toBeNull()
        expect(revealBlock![0]).toMatch(/opacity:\s*1/)
        expect(revealBlock![0]).toMatch(/pointer-events:\s*auto/)
    })

    it("upload flow still calls api.assets.upload + onUpdate (regression after overlay refactor)", async () => {
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
})

// --- Session 4c Commit 4: speech-bubble anchor + opacity from layout_config ---

describe("PageCanvas - speech_bubble layout_config integration (Session 4c Commit 4)", () => {
    it("defaults to bottom-center anchor + opacity 1 when layout_config is NULL", () => {
        render(
            <PageCanvas
                page={makePage({layout: "speech_bubble", layout_config: null})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const bubble = screen.getByTestId("page-canvas-speech-bubble")
        const style = bubble.getAttribute("style") || ""
        expect(style).toContain("bottom: 16px")
        expect(style).toContain("left: 50%")
        expect(style).toContain("translateX(-50%)")
        expect(style).toContain("rgba(255, 255, 255, 1)")
    })

    it("top-left anchor produces top:16 + left:16 + transform:none", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {anchor_position: "top-left"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const bubble = screen.getByTestId("page-canvas-speech-bubble")
        const style = bubble.getAttribute("style") || ""
        expect(style).toContain("top: 16px")
        expect(style).toContain("left: 16px")
        expect(style).toContain("transform: none")
        // bottom + right must be neutralised so they don't fight the
        // CSS-Module's bottom: 16px default.
        expect(style).toContain("bottom: auto")
        expect(style).toContain("right: auto")
    })

    it("top-right anchor produces top:16 + right:16", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {anchor_position: "top-right"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ||
            ""
        expect(style).toContain("top: 16px")
        expect(style).toContain("right: 16px")
        expect(style).toContain("bottom: auto")
        expect(style).toContain("left: auto")
    })

    it("bottom-left anchor produces bottom:16 + left:16", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {anchor_position: "bottom-left"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ||
            ""
        expect(style).toContain("bottom: 16px")
        expect(style).toContain("left: 16px")
        expect(style).toContain("top: auto")
        expect(style).toContain("right: auto")
    })

    it("bottom-right anchor produces bottom:16 + right:16", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {anchor_position: "bottom-right"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ||
            ""
        expect(style).toContain("bottom: 16px")
        expect(style).toContain("right: 16px")
        expect(style).toContain("top: auto")
        expect(style).toContain("left: auto")
    })

    it("center anchor produces top:50% + left:50% + translate(-50%, -50%)", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {anchor_position: "center"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ||
            ""
        expect(style).toContain("top: 50%")
        expect(style).toContain("left: 50%")
        expect(style).toContain("translate(-50%, -50%)")
    })

    it("opacity 0.6 -> background rgba(255, 255, 255, 0.6)", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {opacity: 0.6},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ||
            ""
        expect(style).toContain("rgba(255, 255, 255, 0.6)")
    })

    it("opacity is clamped into [0.3, 1] even if config carries an out-of-range value", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {opacity: 1.5},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ||
            ""
        expect(style).toContain("rgba(255, 255, 255, 1)")
    })

    it("data-anchor on the bubble div reflects the persisted anchor (E2E targeting)", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {anchor_position: "top-left"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen
                .getByTestId("page-canvas-speech-bubble")
                .getAttribute("data-anchor"),
        ).toBe("top-left")
    })

    it("non-speech-bubble layouts: no inline style on the text region", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_top_text_bottom",
                    layout_config: {anchor_position: "top-left"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        // page-canvas-region-text gets no inline style (the layout_config
        // for non-speech-bubble layouts is consumed by Commit 5's
        // image-position / split-ratio / text-position controls).
        const text = screen.getByTestId("page-canvas-region-text")
        expect(text.getAttribute("style")).toBeNull()
        expect(text.getAttribute("data-anchor")).toBeNull()
    })
})
