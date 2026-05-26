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
})
