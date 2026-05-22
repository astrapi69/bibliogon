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

import PageCanvas, {extractPlainText} from "./PageCanvas"
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

describe("PageCanvas - text area (Tier-Property layouts: speech_bubble + image_full_text_overlay)", () => {
    // PB-PHASE4 Session 4c-B-1 Commit 2: existing textarea tests
    // pivoted to a Tier-Property layout. After Commit 2, the
    // makePage() default ``image_top_text_bottom`` is a TipTap
    // layout (renders via RichTextEditor, NOT textarea). These
    // tests still pin the textarea behavior for the two layouts
    // that KEEP using it (speech_bubble + image_full_text_overlay).
    const TIER_PROPERTY_PAGE = (overrides: Partial<Page> = {}) =>
        makePage({layout: "speech_bubble", ...overrides})

    it("seeds the textarea from page.text_content", () => {
        render(
            <PageCanvas
                page={TIER_PROPERTY_PAGE({text_content: "Hello world"})}
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
        render(<PageCanvas page={TIER_PROPERTY_PAGE()} bookId="b1" onUpdate={onUpdate} />)
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
                page={TIER_PROPERTY_PAGE({text_content: "Previous"})}
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
                page={TIER_PROPERTY_PAGE({text_content: "Same"})}
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
                page={TIER_PROPERTY_PAGE({id: "p1", text_content: "First page"})}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        )
        expect(
            (screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement).value,
        ).toBe("First page")
        rerender(
            <PageCanvas
                page={TIER_PROPERTY_PAGE({id: "p2", text_content: "Second page"})}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        )
        expect(
            (screen.getByTestId("page-canvas-text-input") as HTMLTextAreaElement).value,
        ).toBe("Second page")
    })

    it("image_full_text_overlay (the OTHER Tier-Property layout) also keeps textarea", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_full_text_overlay",
                    text_content: "Overlay text",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(screen.getByTestId("page-canvas-text-input")).toBeTruthy()
        // No RichTextEditor for Tier-Property layouts.
        expect(
            screen.queryByTestId(/^page-canvas-richtext-/),
        ).toBeNull()
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
        // The text region is still the editable surface. Post-
        // Commit 2: text_only is a TipTap layout, so the editable
        // surface is the RichTextEditor's root container (NOT a
        // textarea). The region wrapper is still present.
        expect(screen.getByTestId("page-canvas-region-text")).toBeTruthy()
        expect(
            screen.getByTestId("page-canvas-richtext-p1-root"),
        ).toBeTruthy()
        expect(screen.queryByTestId("page-canvas-text-input")).toBeNull()
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

    it("text-blur saves text_content in Tier-Property layouts (speech_bubble + image_full_text_overlay)", async () => {
        // PB-PHASE4 Session 4c-B-1 Commit 2: TipTap layouts
        // (image_top_text_bottom, image_left_text_right, text_only)
        // no longer use the textarea — they save via the debounced
        // RichTextEditor onChange path tested separately below.
        for (const layout of [
            "speech_bubble",
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
        // Bug 2 (2026-05-18): bumped 1px -> 2px for visual weight.
        const block = blockFor(".canvasLayoutImageTopTextBottom .regionImage")
        expect(block).not.toBe("")
        expect(block).toMatch(/border-bottom:\s*2px\s+solid/)
    })

    it("image_left_text_right: image region has border-right (vertical divider)", () => {
        const block = blockFor(".canvasLayoutImageLeftTextRight .regionImage")
        expect(block).not.toBe("")
        expect(block).toMatch(/border-right:\s*2px\s+solid/)
    })

    it("standard layouts: text region has a background tint to separate from image", () => {
        // Post-Fix-B (4c-B-1 manual smoke): the 2 image+text-coexist
        // layouts (image_top_text_bottom + image_left_text_right) share
        // one rule with the BUMPED 10% background tint (was 5%). The
        // text_only layout keeps the original 5% tint in its own rule.
        // Both rules must carry a ``background:`` declaration.
        const imageTextGroup = css.match(
            /\.canvasLayoutImageTopTextBottom \.regionText,\s*\.canvasLayoutImageLeftTextRight \.regionText\s*\{[^}]*\}/,
        )
        expect(imageTextGroup).not.toBeNull()
        expect(imageTextGroup![0]).toMatch(/background:/)
        // Fix B: 10% opacity (bumped from 5%) on image+text layouts
        // for visual separator clarity. The exact CSS value is part
        // of the visual contract; assert the percentage explicitly.
        expect(imageTextGroup![0]).toMatch(/var\(--text\)\s+10%/)

        const textOnlyRule = css.match(
            /\.canvasLayoutTextOnly \.regionText\s*\{[^}]*\}/,
        )
        expect(textOnlyRule).not.toBeNull()
        expect(textOnlyRule![0]).toMatch(/background:/)
        // text_only intentionally keeps the 5% tint (no image region
        // to separate from; tint is decoration not separation).
        expect(textOnlyRule![0]).toMatch(/var\(--text\)\s+5%/)
    })

    it("Bug 2: image+text-coexist layouts use 2px solid var(--border-strong) for the region border", () => {
        // Bug 2 (2026-05-18): the prior Fix B (border 1px solid
        // 25%-opacity-mix) was still too subtle in user re-smoke.
        // Switched to the dedicated --border-strong theme token
        // (purpose-built for visible dividers, defined in all 10
        // theme variants) + bumped from 1px to 2px for clear
        // visual weight against the RichTextEditor's text padding.
        // History: 14% (orig) -> 25% (Fix B) -> var(--border-strong)
        // 2px (Bug 2). Token-driven so dark + light themes both
        // carry the appropriate contrast.
        const topBottom = css.match(
            /\.canvasLayoutImageTopTextBottom \.regionImage\s*\{[^}]*\}/,
        )
        expect(topBottom).not.toBeNull()
        expect(topBottom![0]).toMatch(
            /border-bottom:\s*2px solid var\(--border-strong\)/,
        )

        const leftRight = css.match(
            /\.canvasLayoutImageLeftTextRight \.regionImage\s*\{[^}]*\}/,
        )
        expect(leftRight).not.toBeNull()
        expect(leftRight![0]).toMatch(
            /border-right:\s*2px solid var\(--border-strong\)/,
        )
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

    // Session 4c-A Bug B regression pin: image_full_text_overlay
    // image defaults to object-fit: cover so it fills the canvas.
    // Without this, letterbox bars expose the gap between the
    // image's visible bounds and the absolutely-positioned text
    // region (which uses left: 0; right: 0 to span the canvas
    // width). The fix mirrors speech_bubble's same override.
    it("Bug B fix: image_full_text_overlay defaults image to object-fit: cover", () => {
        const block = css.match(
            /\.canvasLayoutImageFullTextOverlay\s+\.image\s*\{[^}]*\}/,
        )
        expect(block).not.toBeNull()
        expect(block![0]).toMatch(/object-fit:\s*cover/)
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

    it("default width is 40% when layout_config has no size key (Session 4c refinement)", () => {
        render(
            <PageCanvas
                page={makePage({layout: "speech_bubble", layout_config: null})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style"),
        ).toContain("width: 40%")
    })

    it("legacy `size`=30 falls through as width:30% (backward-compat for pre-Bug-1 pages)", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {size: 30},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style"),
        ).toContain("width: 30%")
    })

    // Bug 1 (2026-05-18): bubble_width clamp expanded to [20, 80]
    // (was [20, 60] when `size` was the only width knob). Legacy
    // size values out of the new range clamp to 80% (was 60%).
    it("width out-of-range clamps to [20, 80] in the inline style", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {size: 90},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style"),
        ).toContain("width: 80%")
    })

    // --- Bug 1: bubble_width + bubble_height (2026-05-18) ---

    it("bubble_width takes precedence over legacy `size` when both present", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubble_width: 65, size: 30},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style"),
        ).toContain("width: 65%")
    })

    it("default height is 30% when layout_config has no bubble_height key", () => {
        render(
            <PageCanvas
                page={makePage({layout: "speech_bubble", layout_config: null})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style"),
        ).toContain("height: 30%")
    })

    it("bubble_height=45 produces height:45% in the inline style", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubble_height: 45},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style"),
        ).toContain("height: 45%")
    })

    it("bubble_height out-of-range clamps to [15, 60] in the inline style", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubble_height: 99},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style"),
        ).toContain("height: 60%")
    })

    it("non-speech-bubble layouts: speech-bubble inline style does NOT apply", () => {
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
        // No data-anchor on non-speech-bubble layouts (the anchor
        // concept is bubble-specific).
        const text = screen.getByTestId("page-canvas-region-text")
        expect(text.getAttribute("data-anchor")).toBeNull()
    })
})

// --- Session 4c Commit 5: image_top_text_bottom / image_left_text_right /
//     image_full_text_overlay layout_config integration ---

describe("PageCanvas - image_top_text_bottom config (Session 4c Commit 5)", () => {
    it("defaults: data-image-position='center', data-image-fit='contain'", () => {
        render(
            <PageCanvas
                page={makePage({layout: "image_top_text_bottom", layout_config: null})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const root = screen.getByTestId("page-canvas-root")
        expect(root.getAttribute("data-image-position")).toBe("center")
        expect(root.getAttribute("data-image-fit")).toBe("contain")
    })

    it("image_position='left' justifies the image region flex-start", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_top_text_bottom",
                    image_asset_id: "asset-1",
                    layout_config: {image_position: "left"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const imgArea = screen.getByTestId("page-canvas-image-area")
        expect(imgArea.getAttribute("style")).toContain(
            "justify-content: flex-start",
        )
    })

    it("image_fit='cover' applies object-fit:cover to the <img>", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_top_text_bottom",
                    image_asset_id: "asset-1",
                    layout_config: {image_fit: "cover"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const img = screen.getByTestId("page-canvas-image")
        expect(img.getAttribute("style")).toContain("object-fit: cover")
    })
})

describe("PageCanvas - image_left_text_right config (Session 4c Commit 5)", () => {
    it("defaults: data-split-ratio='60'", () => {
        render(
            <PageCanvas
                page={makePage({layout: "image_left_text_right", layout_config: null})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-root").getAttribute("data-split-ratio"),
        ).toBe("60")
    })

    it("split_ratio=65 produces grid-template-columns '65% 35%'", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_left_text_right",
                    layout_config: {split_ratio: 65},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const root = screen.getByTestId("page-canvas-root")
        expect(root.getAttribute("style")).toContain(
            "grid-template-columns: 65% 35%",
        )
        expect(root.getAttribute("data-split-ratio")).toBe("65")
    })

    it("clamps split_ratio out-of-range value into [50, 70]", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_left_text_right",
                    layout_config: {split_ratio: 90},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-root").getAttribute("data-split-ratio"),
        ).toBe("70")
    })
})

describe("PageCanvas - image_full_text_overlay config (Session 4c Commit 5)", () => {
    it("defaults: data-text-position='bottom', backdrop opacity 0.45", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_full_text_overlay",
                    layout_config: null,
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const root = screen.getByTestId("page-canvas-root")
        expect(root.getAttribute("data-text-position")).toBe("bottom")
        const style = screen.getByTestId("page-canvas-region-text").getAttribute("style") || ""
        expect(style).toContain("rgba(0, 0, 0, 0.45)")
        expect(style).toContain("top: auto")
        expect(style).toContain("bottom: 0")
    })

    it("text_position='top' positions the overlay at the top of the canvas", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_full_text_overlay",
                    layout_config: {text_position: "top"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style = screen.getByTestId("page-canvas-region-text").getAttribute("style") || ""
        expect(style).toContain("top: 0")
        expect(style).toContain("bottom: auto")
    })

    it("text_position='middle' uses 50% top + translateY(-50%) centering", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_full_text_overlay",
                    layout_config: {text_position: "middle"},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style = screen.getByTestId("page-canvas-region-text").getAttribute("style") || ""
        expect(style).toContain("top: 50%")
        expect(style).toContain("translateY(-50%)")
    })

    it("text_backdrop_opacity=0.7 produces rgba(0,0,0,0.7) background", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "image_full_text_overlay",
                    layout_config: {text_backdrop_opacity: 0.7},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-canvas-region-text").getAttribute("style"),
        ).toContain("rgba(0, 0, 0, 0.7)")
    })
})

// --- PB-PHASE4 Session 4c-B-1 Commit 2: TipTap layouts ---

describe("PageCanvas - TipTap layouts render via RichTextEditor", () => {
    const TIPTAP_LAYOUTS = [
        "image_top_text_bottom",
        "image_left_text_right",
        "text_only",
    ] as const

    it.each(TIPTAP_LAYOUTS)(
        "%s: renders RichTextEditor (not textarea)",
        async (layout) => {
            render(
                <PageCanvas
                    page={makePage({layout, text_content: null})}
                    bookId="b1"
                    onUpdate={vi.fn()}
                />,
            )
            // Anchor on -root explicitly so it doesn't also match
            // ``-content`` (both share the prefix; would multi-match).
            await waitFor(() =>
                expect(screen.getByTestId("page-canvas-richtext-p1-root")).toBeTruthy(),
            )
            // No textarea on TipTap layouts.
            expect(screen.queryByTestId("page-canvas-text-input")).toBeNull()
        },
    )

    it("parses legacy plain-text content into a TipTap doc on first read", async () => {
        // Backward-compat per D4 migration: existing rows with
        // plain-text page.text_content auto-wrap into a TipTap doc
        // on read for TipTap layouts. The user sees their text
        // intact + can now apply formatting on top.
        render(
            <PageCanvas
                page={makePage({
                    id: "p-legacy",
                    layout: "image_top_text_bottom",
                    text_content: "Legacy plain text body",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        await waitFor(() =>
            expect(
                screen.getByTestId("page-canvas-richtext-p-legacy-content")
                    .textContent,
            ).toContain("Legacy plain text body"),
        )
    })

    it("renders JSON-formatted text_content directly (no double-wrap)", async () => {
        // Already-migrated rows store a TipTap JSON string. They
        // get parsed + rendered as-is, NOT re-wrapped in an extra
        // doc level.
        const doc = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [{type: "text", text: "Already JSON"}],
                },
            ],
        })
        render(
            <PageCanvas
                page={makePage({
                    id: "p-json",
                    layout: "text_only",
                    text_content: doc,
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        await waitFor(() =>
            expect(
                screen.getByTestId("page-canvas-richtext-p-json-content")
                    .textContent,
            ).toContain("Already JSON"),
        )
    })

    it("malformed JSON falls back to plain-text wrap (defensive)", async () => {
        // Defensive: a row with text_content starting with ``{``
        // but invalid JSON should NOT crash the parse. Fall back
        // to wrap-as-plain-text instead.
        render(
            <PageCanvas
                page={makePage({
                    id: "p-bad",
                    layout: "text_only",
                    text_content: "{not valid json at all",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        await waitFor(() =>
            expect(
                screen.getByTestId("page-canvas-richtext-p-bad-content")
                    .textContent,
            ).toContain("{not valid json"),
        )
    })

    it("mount does NOT fire onUpdate (debounce + no-spurious-save guarantee)", async () => {
        // The debounced-onChange path is exercised end-to-end in
        // the Session 4c-B-1 Playwright spec (Commit 6). At unit
        // level the actionable assertion is: simply rendering the
        // editor must NOT call onUpdate. Without that guarantee, a
        // user switching pages would auto-save the active page
        // every navigation tick.
        const onUpdate = vi.fn().mockResolvedValue(undefined)
        render(
            <PageCanvas
                page={makePage({
                    id: "p-mount",
                    layout: "text_only",
                    text_content: null,
                })}
                bookId="b1"
                onUpdate={onUpdate}
            />,
        )
        // Let useEditor's mount effects + the debounce timer
        // window pass; no edit happened, so no onUpdate should
        // fire (real timers; 1s window > the 800 ms debounce).
        await new Promise((resolve) => setTimeout(resolve, 1000))
        expect(onUpdate).not.toHaveBeenCalled()
    })

    it("page switch re-mounts the RichTextEditor with the new page's testid namespace", async () => {
        // The richtext testidNamespace is per-page (``page-canvas-
        // richtext-{id}``). Switching pages renders the editor with
        // a fresh namespace; the previous-page testid disappears.
        // Content-level assertions live in the RichTextEditor unit
        // tests; this integration test pins the per-page mount.
        const {rerender} = render(
            <PageCanvas
                page={makePage({
                    id: "p1",
                    layout: "text_only",
                    text_content: "First page",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        await waitFor(() =>
            expect(screen.getByTestId("page-canvas-richtext-p1-root")).toBeTruthy(),
        )
        rerender(
            <PageCanvas
                page={makePage({
                    id: "p2",
                    layout: "text_only",
                    text_content: "Second page",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        await waitFor(() =>
            expect(screen.getByTestId("page-canvas-richtext-p2-root")).toBeTruthy(),
        )
        expect(screen.queryByTestId("page-canvas-richtext-p1-root")).toBeNull()
    })

    it("layout switch from Tier-Property to TipTap swaps textarea for RichTextEditor", async () => {
        const {rerender} = render(
            <PageCanvas
                page={makePage({
                    id: "p-swap",
                    layout: "speech_bubble",
                    text_content: "Bubble text",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        // Tier-Property: textarea present, no RichTextEditor.
        expect(screen.getByTestId("page-canvas-text-input")).toBeTruthy()
        expect(
            screen.queryByTestId("page-canvas-richtext-p-swap-root"),
        ).toBeNull()

        // Swap layout to a TipTap one — textarea disappears,
        // RichTextEditor mounts in its place.
        rerender(
            <PageCanvas
                page={makePage({
                    id: "p-swap",
                    layout: "text_only",
                    text_content: "Bubble text",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        await waitFor(() =>
            expect(
                screen.getByTestId("page-canvas-richtext-p-swap-root"),
            ).toBeTruthy(),
        )
        expect(screen.queryByTestId("page-canvas-text-input")).toBeNull()
    })
})

// --- PB-PHASE4 Session 4c-B-1 Fix C: defensive plain-text extraction ---

describe("extractPlainText helper", () => {
    it("returns empty string for null / undefined / empty", () => {
        expect(extractPlainText(null)).toBe("")
        expect(extractPlainText(undefined)).toBe("")
        expect(extractPlainText("")).toBe("")
    })

    it("returns plain text as-is when input does NOT start with '{'", () => {
        expect(extractPlainText("Hello world")).toBe("Hello world")
        expect(extractPlainText("  leading whitespace OK  ")).toBe(
            "  leading whitespace OK  ",
        )
        expect(extractPlainText("Multi\nline\ntext")).toBe("Multi\nline\ntext")
    })

    it("extracts plain text from a single-paragraph TipTap doc", () => {
        const doc = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [{type: "text", text: "Once upon a time."}],
                },
            ],
        })
        expect(extractPlainText(doc)).toBe("Once upon a time.")
    })

    it("joins multi-paragraph TipTap doc with newlines", () => {
        const doc = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [{type: "text", text: "First paragraph."}],
                },
                {
                    type: "paragraph",
                    content: [{type: "text", text: "Second paragraph."}],
                },
            ],
        })
        expect(extractPlainText(doc)).toBe("First paragraph.\nSecond paragraph.")
    })

    it("drops formatting marks (bold/italic become plain text)", () => {
        const doc = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        {type: "text", text: "plain "},
                        {type: "text", marks: [{type: "bold"}], text: "bold"},
                        {type: "text", text: " more plain"},
                    ],
                },
            ],
        })
        expect(extractPlainText(doc)).toBe("plain bold more plain")
    })

    it("extracts text from heading nodes (preserves block boundary)", () => {
        const doc = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "heading",
                    attrs: {level: 2},
                    content: [{type: "text", text: "Chapter One"}],
                },
                {
                    type: "paragraph",
                    content: [{type: "text", text: "Once upon a time."}],
                },
            ],
        })
        expect(extractPlainText(doc)).toBe("Chapter One\nOnce upon a time.")
    })

    it("falls back to the original string on malformed JSON starting with '{'", () => {
        const malformed = "{not valid json"
        expect(extractPlainText(malformed)).toBe(malformed)
    })

    it("falls back to the original string on JSON that is NOT a TipTap doc", () => {
        const otherJson = '{"foo": "bar"}'
        expect(extractPlainText(otherJson)).toBe(otherJson)
    })

    it("handles deeply-nested lists", () => {
        const doc = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "bulletList",
                    content: [
                        {
                            type: "listItem",
                            content: [
                                {
                                    type: "paragraph",
                                    content: [{type: "text", text: "Item 1"}],
                                },
                            ],
                        },
                        {
                            type: "listItem",
                            content: [
                                {
                                    type: "paragraph",
                                    content: [{type: "text", text: "Item 2"}],
                                },
                            ],
                        },
                    ],
                },
            ],
        })
        expect(extractPlainText(doc)).toBe("Item 1\nItem 2")
    })
})

// --- PB-PHASE4 Session 4c-B-1 Fix C: regression-pin for textarea-shows-JSON bug ---

describe("PageCanvas - Tier-Property textarea defends against JSON-shaped text_content (Fix C)", () => {
    const TIPTAP_DOC = JSON.stringify({
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: [{type: "text", text: "Authored in TipTap"}],
            },
        ],
    })

    it("speech_bubble: textarea shows extracted plain text, NOT raw JSON", () => {
        render(
            <PageCanvas
                page={makePage({
                    id: "p-bubble",
                    layout: "speech_bubble",
                    text_content: TIPTAP_DOC,
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const ta = screen.getByTestId(
            "page-canvas-text-input",
        ) as HTMLTextAreaElement
        expect(ta.value).toBe("Authored in TipTap")
        expect(ta.value).not.toContain('"type":"doc"')
    })

    it("image_full_text_overlay: textarea shows extracted plain text, NOT raw JSON", () => {
        // This is the exact bug from the 4c-B-1 manual smoke: user
        // authors in image_top_text_bottom (TipTap), switches to
        // image_full_text_overlay (Tier-Property), textarea then
        // displays the raw JSON. After Fix C, textarea shows the
        // extracted plain text.
        render(
            <PageCanvas
                page={makePage({
                    id: "p-overlay",
                    layout: "image_full_text_overlay",
                    text_content: TIPTAP_DOC,
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const ta = screen.getByTestId(
            "page-canvas-text-input",
        ) as HTMLTextAreaElement
        expect(ta.value).toBe("Authored in TipTap")
        expect(ta.value).not.toContain('"type":"doc"')
    })

    it("malformed JSON in text_content falls back to literal display (defensive)", () => {
        render(
            <PageCanvas
                page={makePage({
                    id: "p-bad",
                    layout: "speech_bubble",
                    text_content: "{broken",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const ta = screen.getByTestId(
            "page-canvas-text-input",
        ) as HTMLTextAreaElement
        // Falls back to literal string rather than crashing or
        // truncating the user's content.
        expect(ta.value).toBe("{broken")
    })

    it("plain legacy text_content displays unchanged (no false extraction)", () => {
        render(
            <PageCanvas
                page={makePage({
                    id: "p-legacy",
                    layout: "speech_bubble",
                    text_content: "Bubble text!",
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const ta = screen.getByTestId(
            "page-canvas-text-input",
        ) as HTMLTextAreaElement
        expect(ta.value).toBe("Bubble text!")
    })
})

// --- 4c-B-2 C1: bubbles[0] wrapper-shape (NQ2 scope-anticipate) ---
//
// PageCanvas's speechBubbleInlineStyle must resolve identically
// whether per-bubble fields live under bubbles[0] (canonical) or
// at the top level (legacy fallback). The Python parallel in
// picture_book_pdf.py::_speech_bubble_style is pinned by
// test_picture_book_pdf.py.

describe("PageCanvas - bubbles[0] wrapper read-path (4c-B-2 C1)", () => {
    it("bubbles[0].anchor_position overrides flat anchor_position", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {
                        anchor_position: "top-left",
                        bubbles: [{anchor_position: "bottom-right"}],
                    },
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const bubble = screen.getByTestId("page-canvas-speech-bubble")
        const style = bubble.getAttribute("style") ?? ""
        // bottom-right wins (16pt from bottom + 16pt from right)
        expect(style).toContain("bottom: 16")
        expect(style).toContain("right: 16")
        // data-anchor surfaces the canonical value (used by E2E).
        expect(bubble.getAttribute("data-anchor")).toBe("bottom-right")
    })

    it("bubbles[0].opacity overrides flat opacity", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {opacity: 0.4, bubbles: [{opacity: 0.9}]},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("rgba(255, 255, 255, 0.9)")
    })

    it("bubbles[0].bubble_width overrides flat bubble_width and legacy size", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {
                        size: 30,
                        bubble_width: 50,
                        bubbles: [{bubble_width: 70}],
                    },
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("width: 70%")
    })

    it("bubbles[0].bubble_height overrides flat bubble_height", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {
                        bubble_height: 20,
                        bubbles: [{bubble_height: 55}],
                    },
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("height: 55%")
    })

    it("falls back to flat top-level keys when bubbles[0] is absent (legacy pages)", () => {
        // Pre-C1 picture-books carry flat shape. The shim must
        // keep them rendering correctly under the new read-path.
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {
                        anchor_position: "center",
                        opacity: 0.5,
                        bubble_width: 60,
                        bubble_height: 40,
                    },
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const bubble = screen.getByTestId("page-canvas-speech-bubble")
        const style = bubble.getAttribute("style") ?? ""
        expect(bubble.getAttribute("data-anchor")).toBe("center")
        expect(style).toContain("rgba(255, 255, 255, 0.5)")
        expect(style).toContain("width: 60%")
        expect(style).toContain("height: 40%")
    })

    it("empty bubbles array does NOT shadow flat keys (regression-pin)", () => {
        // Defensive: a write that produced `bubbles: []` (zero
        // entries) must NOT discard the flat fallback values; the
        // shim treats the missing first element as "no override".
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {
                        anchor_position: "top-left",
                        bubbles: [],
                    },
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
})

// --- 4c-B-2 C2: Tier 1 Visual Style render path ---
//
// speechBubbleInlineStyle emits CSS for the 6 Tier 1 properties.
// Mirrors the Python parallel in test_picture_book_pdf.py.

describe("PageCanvas - Tier 1 Visual Style render (4c-B-2 C2)", () => {
    it("default bubble emits white rgba background composed with full opacity", () => {
        render(
            <PageCanvas
                page={makePage({layout: "speech_bubble", layout_config: null})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        // Default: white background, full opacity, 2px solid black
        // border, 50% radius, shadow on.
        expect(style).toContain("rgba(255, 255, 255, 1)")
        expect(style).toContain("border: 2px solid")
        expect(style).toContain("border-radius: 50%")
        expect(style).toContain("box-shadow")
    })

    it("background_color hex composes with opacity into rgba()", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {
                        bubbles: [{background_color: "#ff8800", opacity: 0.5}],
                    },
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("rgba(255, 136, 0, 0.5)")
    })

    it("border_color + border_width + border_style emit a composed border", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {
                        bubbles: [
                            {
                                border_color: "#0000ff",
                                border_width: 4,
                                border_style: "dashed",
                            },
                        ],
                    },
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("border: 4px dashed rgb(0, 0, 255)")
    })

    it("border_radius emits a percentage value", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubbles: [{border_radius: 20}]},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("border-radius: 20%")
    })

    it("shadow=false emits box-shadow: none", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubbles: [{shadow: false}]},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("box-shadow: none")
    })

    it("shadow_intensity scales the box-shadow blur (intensity*2 px)", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {
                        bubbles: [{shadow: true, shadow_intensity: 10}],
                    },
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        // intensity 10 -> offset_y = 10/2 = 5 px, blur = 10*2 = 20 px.
        expect(style).toContain("box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3)")
    })

    // PADDING-FONT-STYLE-01 C1: padding (uniform) render path.
    it("default bubble emits padding: 12px (mean of legacy 10px / 14px asymmetric default)", () => {
        render(
            <PageCanvas
                page={makePage({layout: "speech_bubble", layout_config: null})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("padding: 12px")
    })

    it("custom padding value emits in the inline style (clamped to 0-32)", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubbles: [{padding: 24}]},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("padding: 24px")
    })

    it("padding clamps out-of-range values for the inline style", () => {
        const highStyle = (() => {
            const {container} = render(
                <PageCanvas
                    page={makePage({
                        layout: "speech_bubble",
                        layout_config: {bubbles: [{padding: 99}]},
                    })}
                    bookId="b1"
                    onUpdate={vi.fn()}
                />,
            )
            return (
                container
                    .querySelector("[data-testid=page-canvas-speech-bubble]")
                    ?.getAttribute("style") ?? ""
            )
        })()
        expect(highStyle).toContain("padding: 32px")
    })

    it("border_style none + radius 0 emits a square bubble with no border", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {
                        bubbles: [
                            {
                                border_style: "none",
                                border_width: 0,
                                border_radius: 0,
                            },
                        ],
                    },
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("border: 0px none")
        expect(style).toContain("border-radius: 0%")
    })
})

// --- 4c-B-2 C3: Tier 2 Typography render path ---
//
// speechBubbleInlineStyle emits CSS for the 5 Tier 2 properties on
// the parent bubble element; ``.textInput`` inside inherits via
// the CSS-module override (font-family / font-size / font-weight /
// color / text-align all set to ``inherit`` for speech_bubble's
// textInput). Mirrors the Python parallel in test_picture_book_pdf.py.

describe("PageCanvas - Tier 2 Typography render (4c-B-2 C3)", () => {
    it("default bubble emits Atkinson Hyperlegible 14pt normal black centered", () => {
        render(
            <PageCanvas
                page={makePage({layout: "speech_bubble", layout_config: null})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        // browser may normalize " quotes; just check the family name.
        expect(style).toContain("font-family")
        expect(style).toContain("Atkinson Hyperlegible")
        expect(style).toContain("font-size: 14pt")
        expect(style).toContain("font-weight: normal")
        expect(style).toContain("text-align: center")
        // color: default #000000 -> rgb(0, 0, 0)
        expect(style).toContain("color: rgb(0, 0, 0)")
    })

    it("font_family emits the selected catalog font", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubbles: [{font_family: "Comic Neue"}]},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("Comic Neue")
    })

    it("font_size clamps to 10-32 pt range", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubbles: [{font_size: 24}]},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("font-size: 24pt")
    })

    it("font_weight=bold emits font-weight: bold", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubbles: [{font_weight: "bold"}]},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("font-weight: bold")
    })

    it("text_color hex emits rgb(...) on the parent element", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubbles: [{text_color: "#aa1122"}]},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("color: rgb(170, 17, 34)")
    })

    // PADDING-FONT-STYLE-01 C2: italic boolean -> font-style emit.
    it("default bubble emits font-style: normal (italic toggle off)", () => {
        render(
            <PageCanvas
                page={makePage({layout: "speech_bubble", layout_config: null})}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("font-style: normal")
    })

    it("italic=true emits font-style: italic", () => {
        render(
            <PageCanvas
                page={makePage({
                    layout: "speech_bubble",
                    layout_config: {bubbles: [{italic: true}]},
                })}
                bookId="b1"
                onUpdate={vi.fn()}
            />,
        )
        const style =
            screen.getByTestId("page-canvas-speech-bubble").getAttribute("style") ??
            ""
        expect(style).toContain("font-style: italic")
    })

    it("text_align variants all emit", () => {
        for (const align of ["left", "right", "center"] as const) {
            const {container} = render(
                <PageCanvas
                    page={makePage({
                        layout: "speech_bubble",
                        layout_config: {bubbles: [{text_align: align}]},
                    })}
                    bookId="b1"
                    onUpdate={vi.fn()}
                />,
            )
            const style =
                container
                    .querySelector("[data-testid=page-canvas-speech-bubble]")
                    ?.getAttribute("style") ?? ""
            expect(style).toContain(`text-align: ${align}`)
        }
    })
})
