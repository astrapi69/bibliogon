/**
 * Tests for LayoutPicker (PB-PHASE4 Session 3 Commit 4).
 *
 * Covers: 2 default-visible options, 3 behind the "More layouts"
 * disclosure, selected marking, onChange wiring, disabled state.
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

    it("shows the 2 default-visible layout options (A + B)", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        expect(screen.getByTestId("page-editor-layout-option-speech_bubble")).toBeTruthy()
        expect(
            screen.getByTestId("page-editor-layout-option-image_top_text_bottom"),
        ).toBeTruthy()
    })

    it("hides the 3 additional layouts by default", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        expect(screen.queryByTestId("page-editor-layout-options-more")).toBeNull()
        expect(
            screen.queryByTestId("page-editor-layout-option-image_left_text_right"),
        ).toBeNull()
        expect(
            screen.queryByTestId("page-editor-layout-option-image_full_text_overlay"),
        ).toBeNull()
        expect(screen.queryByTestId("page-editor-layout-option-text_only")).toBeNull()
    })

    it("expands the 3 additional layouts when 'More layouts' is clicked", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        fireEvent.click(screen.getByTestId("page-editor-layout-more-toggle"))
        expect(screen.getByTestId("page-editor-layout-options-more")).toBeTruthy()
        expect(
            screen.getByTestId("page-editor-layout-option-image_left_text_right"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("page-editor-layout-option-image_full_text_overlay"),
        ).toBeTruthy()
        expect(screen.getByTestId("page-editor-layout-option-text_only")).toBeTruthy()
    })

    it("flips the data-expanded attribute on the toggle button", () => {
        render(<LayoutPicker selected="speech_bubble" onChange={vi.fn()} />)
        const toggle = screen.getByTestId("page-editor-layout-more-toggle")
        expect(toggle.getAttribute("data-expanded")).toBe("false")
        fireEvent.click(toggle)
        expect(toggle.getAttribute("data-expanded")).toBe("true")
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
        const option = screen.getByTestId("page-editor-layout-option-image_top_text_bottom")
        expect((option as HTMLButtonElement).disabled).toBe(true)
        fireEvent.click(option)
        expect(onChange).not.toHaveBeenCalled()
    })

    it("invokes onChange with a layout from the expanded set after toggling 'More'", () => {
        const onChange = vi.fn()
        render(<LayoutPicker selected="speech_bubble" onChange={onChange} />)
        fireEvent.click(screen.getByTestId("page-editor-layout-more-toggle"))
        fireEvent.click(screen.getByTestId("page-editor-layout-option-text_only"))
        expect(onChange).toHaveBeenCalledWith("text_only")
    })
})
