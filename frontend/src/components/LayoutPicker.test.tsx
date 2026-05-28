/**
 * Tests for LayoutPicker.
 *
 * Phase 1 C4 (2026-05-28) restructured the picker from a 2-default
 * + "More layouts" disclosure into 4 category groups
 * ("Bild mit Text" / "Nur Bild" / "Nur Text" / "Spezial") covering
 * the 5 historical layouts + 3 new Phase 1 entries. Two more
 * categories arrive with Phase 2 + Phase 3.
 */

import React from "react"
import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import LayoutPicker from "./LayoutPicker"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

describe("LayoutPicker", () => {
    it("renders the picker root with the namespaced testid", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        expect(screen.getByTestId("page-editor-layout-picker")).toBeTruthy()
    })

    it("renders all 8 layout options across the 4 categories", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        for (const layout of [
            "image_top_text_bottom",
            "image_bottom_text_top",
            "image_left_text_right",
            "image_right_text_left",
            "image_full_text_overlay",
            "image_full_no_text",
            "text_only",
            "speech_bubble",
        ]) {
            expect(
                screen.getByTestId(`page-editor-layout-option-${layout}`),
            ).toBeTruthy()
        }
    })

    it("renders the 4 category sections with their headings", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        for (const category of [
            "bild_mit_text",
            "nur_bild",
            "nur_text",
            "spezial",
        ]) {
            expect(
                screen.getByTestId(`page-editor-layout-category-${category}`),
            ).toBeTruthy()
            expect(
                screen.getByTestId(
                    `page-editor-layout-category-heading-${category}`,
                ),
            ).toBeTruthy()
        }
    })

    it("groups image-with-text layouts (5 entries) under 'Bild mit Text'", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        const section = screen.getByTestId(
            "page-editor-layout-category-bild_mit_text",
        )
        for (const layout of [
            "image_top_text_bottom",
            "image_bottom_text_top",
            "image_left_text_right",
            "image_right_text_left",
            "image_full_text_overlay",
        ]) {
            expect(
                section.querySelector(
                    `[data-testid="page-editor-layout-option-${layout}"]`,
                ),
            ).not.toBeNull()
        }
    })

    it("groups image_full_no_text alone under 'Nur Bild'", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        const section = screen.getByTestId(
            "page-editor-layout-category-nur_bild",
        )
        expect(
            section.querySelector(
                '[data-testid="page-editor-layout-option-image_full_no_text"]',
            ),
        ).not.toBeNull()
        // No other options inside the category.
        expect(
            section.querySelectorAll("[data-testid^='page-editor-layout-option-']")
                .length,
        ).toBe(1)
    })

    it("does NOT render the comic_panel_grid option (picture-book picker only)", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        expect(
            screen.queryByTestId("page-editor-layout-option-comic_panel_grid"),
        ).toBeNull()
    })

    it("marks the selected option via data-selected='true' (others 'false')", () => {
        render(
            <LayoutPicker
                selected="image_top_text_bottom"
                onChange={vi.fn()}
            />,
        )
        expect(
            screen
                .getByTestId("page-editor-layout-option-image_top_text_bottom")
                .getAttribute("data-selected"),
        ).toBe("true")
        expect(
            screen
                .getByTestId("page-editor-layout-option-speech_bubble")
                .getAttribute("data-selected"),
        ).toBe("false")
    })

    it("invokes onChange with the picked layout when an unselected option is clicked", () => {
        const onChange = vi.fn()
        render(<LayoutPicker selected="speech_bubble" onChange={onChange} />)
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_top_text_bottom"),
        )
        expect(onChange).toHaveBeenCalledWith("image_top_text_bottom")
    })

    it("does NOT invoke onChange when the already-selected option is clicked", () => {
        const onChange = vi.fn()
        render(<LayoutPicker selected="speech_bubble" onChange={onChange} />)
        fireEvent.click(screen.getByTestId("page-editor-layout-option-speech_bubble"))
        expect(onChange).not.toHaveBeenCalled()
    })

    it("disables every option when disabled=true", () => {
        const onChange = vi.fn()
        render(
            <LayoutPicker
                selected="speech_bubble"
                onChange={onChange}
                disabled
            />,
        )
        const option = screen.getByTestId(
            "page-editor-layout-option-image_top_text_bottom",
        )
        expect((option as HTMLButtonElement).disabled).toBe(true)
        fireEvent.click(option)
        expect(onChange).not.toHaveBeenCalled()
    })

    it("invokes onChange when a Phase 1 mirror layout is picked", () => {
        const onChange = vi.fn()
        render(<LayoutPicker selected="speech_bubble" onChange={onChange} />)
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_bottom_text_top"),
        )
        expect(onChange).toHaveBeenCalledWith("image_bottom_text_top")
    })

    it("invokes onChange when image_full_no_text is picked", () => {
        const onChange = vi.fn()
        render(<LayoutPicker selected="speech_bubble" onChange={onChange} />)
        fireEvent.click(
            screen.getByTestId("page-editor-layout-option-image_full_no_text"),
        )
        expect(onChange).toHaveBeenCalledWith("image_full_no_text")
    })
})
