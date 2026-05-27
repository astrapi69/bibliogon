/**
 * Tests for LayoutConfigImageRow (PB-PHASE4 Session 4c Commit 5).
 *
 * Three layout config bodies in one file (mirroring the file
 * structure): image_top_text_bottom, image_left_text_right,
 * image_full_text_overlay.
 *
 * Per Pre-Inspection D5:
 * - image_top_text_bottom: image_position (radio) + image_fit (select)
 * - image_left_text_right: split_ratio (slider) + image_fit (select)
 * - image_full_text_overlay: text_position (select) + opacity (slider)
 *
 * Discrete = immediate; continuous = 300ms debounce.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {render, screen, fireEvent, act} from "@testing-library/react"

import {
    LayoutConfigImageTopTextBottom,
    LayoutConfigImageLeftTextRight,
    LayoutConfigImageFullTextOverlay,
} from "./LayoutConfigImageRow"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe("LayoutConfigImageTopTextBottom", () => {
    it("defaults: image_position 'center', image_fit 'contain'", () => {
        render(
            <LayoutConfigImageTopTextBottom config={null} onChange={vi.fn()} />,
        )
        expect(
            (screen.getByTestId("image-position-center") as HTMLInputElement)
                .checked,
        ).toBe(true)
        expect(
            (screen.getByTestId("image-top-image-fit") as HTMLSelectElement)
                .value,
        ).toBe("contain")
    })

    it("picking 'right' fires onChange immediately with image_position", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigImageTopTextBottom config={null} onChange={onChange} />,
        )
        fireEvent.click(screen.getByTestId("image-position-right"))
        expect(onChange).toHaveBeenCalledWith({image_position: "right"})
    })

    it("changing image_fit to 'cover' fires onChange immediately", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigImageTopTextBottom config={null} onChange={onChange} />,
        )
        fireEvent.change(screen.getByTestId("image-top-image-fit"), {
            target: {value: "cover"},
        })
        expect(onChange).toHaveBeenCalledWith({image_fit: "cover"})
    })

    it("pre-filled config echoes the persisted values", () => {
        render(
            <LayoutConfigImageTopTextBottom
                config={{image_position: "left", image_fit: "cover"}}
                onChange={vi.fn()}
            />,
        )
        expect(
            (screen.getByTestId("image-position-left") as HTMLInputElement)
                .checked,
        ).toBe(true)
        expect(
            (screen.getByTestId("image-top-image-fit") as HTMLSelectElement)
                .value,
        ).toBe("cover")
    })
})

describe("LayoutConfigImageLeftTextRight", () => {
    it("defaults: split_ratio 60, image_fit 'contain'", () => {
        render(
            <LayoutConfigImageLeftTextRight config={null} onChange={vi.fn()} />,
        )
        expect(
            screen.getByTestId("image-left-split-ratio-value").textContent,
        ).toBe("60%")
        expect(
            (screen.getByTestId("image-left-image-fit") as HTMLSelectElement)
                .value,
        ).toBe("contain")
    })

    it("slider drag is debounced (300ms)", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigImageLeftTextRight config={null} onChange={onChange} />,
        )
        const slider = screen.getByTestId(
            "image-left-split-ratio-slider",
        ) as HTMLInputElement
        fireEvent.change(slider, {target: {value: "65"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({split_ratio: 65})
    })

    it("dropdown change for image_fit fires onChange immediately", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigImageLeftTextRight config={null} onChange={onChange} />,
        )
        fireEvent.change(screen.getByTestId("image-left-image-fit"), {
            target: {value: "cover"},
        })
        expect(onChange).toHaveBeenCalledWith({image_fit: "cover"})
    })

    it("clamps split_ratio into [50, 70] for display", () => {
        render(
            <LayoutConfigImageLeftTextRight
                config={{split_ratio: 90}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("image-left-split-ratio-value").textContent,
        ).toBe("70%")
    })
})

describe("LayoutConfigImageFullTextOverlay", () => {
    it("defaults: text_position 'bottom', opacity 0.45", () => {
        render(
            <LayoutConfigImageFullTextOverlay config={null} onChange={vi.fn()} />,
        )
        expect(
            (screen.getByTestId("image-full-text-position-select") as HTMLSelectElement)
                .value,
        ).toBe("bottom")
        expect(
            screen.getByTestId("image-full-backdrop-opacity-value").textContent,
        ).toBe("0.45")
    })

    it("text_position change fires onChange immediately", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigImageFullTextOverlay config={null} onChange={onChange} />,
        )
        fireEvent.change(screen.getByTestId("image-full-text-position-select"), {
            target: {value: "top"},
        })
        expect(onChange).toHaveBeenCalledWith({text_position: "top"})
    })

    it("backdrop opacity slider is debounced (300ms)", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigImageFullTextOverlay config={null} onChange={onChange} />,
        )
        const slider = screen.getByTestId(
            "image-full-backdrop-opacity-slider",
        ) as HTMLInputElement
        fireEvent.change(slider, {target: {value: "0.7"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({text_backdrop_opacity: 0.7})
    })

    it("clamps opacity into [0.3, 0.8] for display (out-of-range values normalised)", () => {
        render(
            <LayoutConfigImageFullTextOverlay
                config={{text_backdrop_opacity: 0.95}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("image-full-backdrop-opacity-value").textContent,
        ).toBe("0.80")
    })

    // --- C5 Tier sections (Visual Style + Typography) ---
    //
    // The Tier1Section + Tier2Section reusables ship from
    // comics/Tier1Section.tsx + Tier2Section.tsx with their own
    // unit tests. Here we pin that they MOUNT correctly under the
    // overlay-text testidPrefix so future refactors keep the
    // namespace stable.

    it("mounts Tier1Section with the overlay-text testid prefix", () => {
        render(
            <LayoutConfigImageFullTextOverlay
                config={null}
                onChange={vi.fn()}
            />,
        )
        expect(screen.getByTestId("overlay-text-tier1-section")).toBeTruthy()
        expect(screen.getByTestId("overlay-text-tier1-trigger")).toBeTruthy()
    })

    it("mounts Tier2Section with the overlay-text testid prefix", () => {
        render(
            <LayoutConfigImageFullTextOverlay
                config={null}
                onChange={vi.fn()}
            />,
        )
        expect(screen.getByTestId("overlay-text-tier2-section")).toBeTruthy()
        expect(screen.getByTestId("overlay-text-tier2-trigger")).toBeTruthy()
    })

    it("Tier1Section onChange writes through dispatcher's onChange (no bubbles[0] wrapping)", () => {
        // Overlay differs from speech_bubble: NO bubbles[0]
        // wrapping (single text region). The Tier1Section
        // onChange={onChange} pass-through means partials land
        // flat in the overlay namespace.
        const onChange = vi.fn()
        render(
            <LayoutConfigImageFullTextOverlay
                config={null}
                onChange={onChange}
            />,
        )
        // Open Tier 1 so the color input is interactable.
        fireEvent.click(screen.getByTestId("overlay-text-tier1-trigger"))
        const colorInput = screen.getByTestId(
            "overlay-text-background-color",
        ) as HTMLInputElement
        fireEvent.change(colorInput, {target: {value: "#ff6b6b"}})
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({background_color: "#ff6b6b"})
        // Crucially: NO bubbles wrapper. The partial is flat.
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
        expect(lastCall[0]).not.toHaveProperty("bubbles")
    })

    // --- C7 Bug D: text_container_width + text_container_height ---

    it("defaults: text_container_width 100%, height 'auto'", () => {
        render(
            <LayoutConfigImageFullTextOverlay
                config={null}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("image-full-text-container-width-value")
                .textContent,
        ).toBe("100%")
        expect(
            screen.getByTestId("image-full-text-container-height-value")
                .textContent,
        ).toBe("auto")
    })

    it("text_container_width slider is debounced (300ms)", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigImageFullTextOverlay
                config={null}
                onChange={onChange}
            />,
        )
        const slider = screen.getByTestId(
            "image-full-text-container-width-slider",
        ) as HTMLInputElement
        fireEvent.change(slider, {target: {value: "60"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({text_container_width: 60})
    })

    it("text_container_height slider is debounced (300ms) + writes the override", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigImageFullTextOverlay
                config={null}
                onChange={onChange}
            />,
        )
        const slider = screen.getByTestId(
            "image-full-text-container-height-slider",
        ) as HTMLInputElement
        fireEvent.change(slider, {target: {value: "40"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({text_container_height: 40})
    })

    it("renders persisted text_container_width value (clamped) in the value label", () => {
        render(
            <LayoutConfigImageFullTextOverlay
                config={{text_container_width: 75}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("image-full-text-container-width-value")
                .textContent,
        ).toBe("75%")
    })

    it("renders persisted text_container_height value in the value label", () => {
        render(
            <LayoutConfigImageFullTextOverlay
                config={{text_container_height: 50}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("image-full-text-container-height-value")
                .textContent,
        ).toBe("50%")
    })

    it("clamps text_container_width into [30, 100] for display", () => {
        render(
            <LayoutConfigImageFullTextOverlay
                config={{text_container_width: 5}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("image-full-text-container-width-value")
                .textContent,
        ).toBe("30%")
    })

    it("clamps text_container_height into [15, 100] for display", () => {
        render(
            <LayoutConfigImageFullTextOverlay
                config={{text_container_height: 200}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("image-full-text-container-height-value")
                .textContent,
        ).toBe("100%")
    })
})
