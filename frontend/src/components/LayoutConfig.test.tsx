/**
 * Tests for LayoutConfig dispatcher (PB-PHASE4 Session 4c Commit 3).
 *
 * The dispatcher mounts the right per-layout config body. Commit 3
 * (this commit) ships the dispatcher shell; concrete bodies arrive
 * in Commits 4-5. These tests pin the shell's contract:
 * - Renders for every layout (no crash)
 * - Exposes data-layout attr matching page.layout
 * - Exposes data-config-keys attr matching the page's layout_config
 *   dict keys (so future tests can verify which keys persisted)
 */

import React from "react"
import {describe, it, expect, vi} from "vitest"
import {render, screen} from "@testing-library/react"

import LayoutConfig from "./LayoutConfig"
import type {Page, PageLayout} from "../api/client"

function makePage(overrides: Partial<Page> = {}): Page {
    return {
        id: "p1",
        book_id: "b1",
        position: 1,
        layout: "speech_bubble",
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

describe("LayoutConfig dispatcher (Session 4c Commit 3)", () => {
    const LAYOUTS: PageLayout[] = [
        "speech_bubble",
        "image_top_text_bottom",
        "image_left_text_right",
        "image_full_text_overlay",
        "text_only",
        // Phase 1 layouts (C4, 2026-05-28). Each must mount without
        // crash and surface data-layout on the root.
        "image_bottom_text_top",
        "image_right_text_left",
        "image_full_no_text",
        // Phase 2 layouts (C2..C5, 2026-05-28).
        "two_images_text_center",
        "split_horizontal",
        "split_vertical",
        "image_border_text_center",
    ]

    it.each(LAYOUTS)("mounts for layout '%s' (no crash)", (layout) => {
        render(<LayoutConfig page={makePage({layout})} onChange={vi.fn()} />)
        expect(screen.getByTestId("layout-config-root")).toBeTruthy()
    })

    it.each(LAYOUTS)("exposes data-layout='%s' on the root", (layout) => {
        render(<LayoutConfig page={makePage({layout})} onChange={vi.fn()} />)
        expect(
            screen.getByTestId("layout-config-root").getAttribute("data-layout"),
        ).toBe(layout)
    })

    it("data-config-keys is empty when page.layout_config is NULL", () => {
        render(
            <LayoutConfig
                page={makePage({layout_config: null})}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen
                .getByTestId("layout-config-root")
                .getAttribute("data-config-keys"),
        ).toBe("")
    })

    it("data-config-keys reflects the keys currently in page.layout_config", () => {
        render(
            <LayoutConfig
                page={makePage({
                    layout_config: {
                        anchor_position: "bottom-right",
                        opacity: 0.8,
                    },
                })}
                onChange={vi.fn()}
            />,
        )
        const keys = screen
            .getByTestId("layout-config-root")
            .getAttribute("data-config-keys")!
            .split(",")
            .sort()
        expect(keys).toEqual(["anchor_position", "opacity"])
    })

    it("dispatches the two_images_text_center body for the multi-image layout", () => {
        // Phase 2 C2: the dispatcher routes two_images_text_center to
        // its dedicated body. The body's testid pins the contract
        // (the dispatcher MUST mount the right body component).
        render(
            <LayoutConfig
                page={makePage({layout: "two_images_text_center"})}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("layout-config-two-images-text-center"),
        ).toBeInTheDocument()
    })

    it("dispatches the split_horizontal body for the multi-image layout", () => {
        // Phase 2 C3: dispatcher routes split_horizontal to its body.
        render(
            <LayoutConfig
                page={makePage({layout: "split_horizontal"})}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("layout-config-split-horizontal"),
        ).toBeInTheDocument()
    })

    it("dispatches the split_vertical body for the multi-image layout", () => {
        // Phase 2 C4: dispatcher routes split_vertical to its body.
        render(
            <LayoutConfig
                page={makePage({layout: "split_vertical"})}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("layout-config-split-vertical"),
        ).toBeInTheDocument()
    })

    it("dispatches the image_border_text_center body for the single-image layout", () => {
        // Phase 2 C5: dispatcher routes image_border_text_center to
        // its body. Single-image layout — no secondary asset region
        // on the canvas.
        render(
            <LayoutConfig
                page={makePage({layout: "image_border_text_center"})}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("layout-config-image-border-text-center"),
        ).toBeInTheDocument()
    })
})
