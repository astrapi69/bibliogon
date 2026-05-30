/**
 * Tests for LayoutConfigSpeechBubble (PB-PHASE4 Session 4c Commit 4).
 *
 * Pins the D4 contract:
 * - 5 anchor presets (TL/TR/BL/BR/CENTER) as radio inputs
 * - Opacity slider 0.3 to 1.0, 300ms debounce
 * - Discrete (anchor) controls fire onChange immediately
 * - Continuous (opacity) controls debounce
 * - NULL config: no radio selected; slider at default 1.0
 * - Pre-filled config: matching radio selected; slider at value
 */

import React from "react"
import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {render, screen, fireEvent, act} from "@testing-library/react"

import LayoutConfigSpeechBubble from "./LayoutConfigSpeechBubble"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
})

afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
})

describe("LayoutConfigSpeechBubble - shape", () => {
    it("renders the 5-preset anchor grid", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        expect(screen.getByTestId("speech-bubble-anchor-grid")).toBeTruthy()
        for (const preset of [
            "top-left",
            "top-right",
            "center",
            "bottom-left",
            "bottom-right",
        ]) {
            expect(
                screen.getByTestId(`speech-bubble-anchor-${preset}`),
            ).toBeTruthy()
        }
    })

    it("renders the opacity slider + value display", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        const slider = screen.getByTestId(
            "speech-bubble-opacity-slider",
        ) as HTMLInputElement
        expect(slider.type).toBe("range")
        expect(slider.min).toBe("0.3")
        expect(slider.max).toBe("1")
        expect(screen.getByTestId("speech-bubble-opacity-value")).toBeTruthy()
    })
})

describe("LayoutConfigSpeechBubble - NULL config (no presets picked yet)", () => {
    it("no radio is selected when config is NULL", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        for (const preset of [
            "top-left",
            "top-right",
            "center",
            "bottom-left",
            "bottom-right",
        ]) {
            const radio = screen.getByTestId(
                `speech-bubble-anchor-${preset}`,
            ) as HTMLInputElement
            expect(radio.checked).toBe(false)
        }
    })

    it("opacity displays 1.00 (default) when config is NULL", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        expect(
            screen.getByTestId("speech-bubble-opacity-value").textContent,
        ).toBe("1.00")
    })
})

describe("LayoutConfigSpeechBubble - pre-filled config", () => {
    it("checks the radio matching anchor_position from config", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{anchor_position: "top-right"}}
                onChange={vi.fn()}
            />,
        )
        const selected = screen.getByTestId(
            "speech-bubble-anchor-top-right",
        ) as HTMLInputElement
        expect(selected.checked).toBe(true)
        // Other 4 stay unselected.
        const others = ["top-left", "center", "bottom-left", "bottom-right"]
        for (const preset of others) {
            const radio = screen.getByTestId(
                `speech-bubble-anchor-${preset}`,
            ) as HTMLInputElement
            expect(radio.checked).toBe(false)
        }
    })

    it("clamps opacity into [0.3, 1] for display", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{opacity: 0.65}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-opacity-value").textContent,
        ).toBe("0.65")
    })

    it("ignores unknown anchor_position values (radio stays unselected)", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{anchor_position: "garbage"}}
                onChange={vi.fn()}
            />,
        )
        for (const preset of [
            "top-left",
            "top-right",
            "center",
            "bottom-left",
            "bottom-right",
        ]) {
            const radio = screen.getByTestId(
                `speech-bubble-anchor-${preset}`,
            ) as HTMLInputElement
            expect(radio.checked).toBe(false)
        }
    })
})

describe("LayoutConfigSpeechBubble - onChange flow", () => {
    it("picking an anchor preset fires onChange IMMEDIATELY (discrete control)", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigSpeechBubble config={null} onChange={onChange} />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-anchor-top-left"))
        // 4c-B-2 C1: writes go through bubbles[0] wrapper.
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{anchor_position: "top-left"}],
        })
    })

    it("changing each anchor preset persists the right value", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigSpeechBubble config={null} onChange={onChange} />,
        )
        for (const preset of [
            "top-left",
            "top-right",
            "center",
            "bottom-left",
            "bottom-right",
        ]) {
            onChange.mockClear()
            fireEvent.click(
                screen.getByTestId(`speech-bubble-anchor-${preset}`),
            )
            expect(onChange).toHaveBeenCalledWith({
                bubbles: [{anchor_position: preset}],
            })
        }
    })

    it("dragging the opacity slider fires onChange DEBOUNCED (300ms)", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigSpeechBubble config={null} onChange={onChange} />,
        )
        const slider = screen.getByTestId(
            "speech-bubble-opacity-slider",
        ) as HTMLInputElement
        fireEvent.change(slider, {target: {value: "0.5"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({bubbles: [{opacity: 0.5}]})
    })

    it("consecutive slider changes within 300ms collapse into one onChange call (last value)", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigSpeechBubble config={null} onChange={onChange} />,
        )
        const slider = screen.getByTestId(
            "speech-bubble-opacity-slider",
        ) as HTMLInputElement
        fireEvent.change(slider, {target: {value: "0.5"}})
        act(() => {
            vi.advanceTimersByTime(100)
        })
        fireEvent.change(slider, {target: {value: "0.7"}})
        act(() => {
            vi.advanceTimersByTime(100)
        })
        fireEvent.change(slider, {target: {value: "0.85"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledWith({bubbles: [{opacity: 0.85}]})
    })
})

// --- PB-PHASE4 Session 4c-B-1 smoke Bug 1 (2026-05-18) ---
//
// bubble_width + bubble_height replace the legacy size knob.
// Backward-compat: a config carrying only `size` (no bubble_width)
// renders + clamps as the width.

describe("LayoutConfigSpeechBubble - width slider (Bug 1)", () => {
    it("renders the width slider + value display", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        const slider = screen.getByTestId(
            "speech-bubble-width-slider",
        ) as HTMLInputElement
        expect(slider.type).toBe("range")
        expect(slider.min).toBe("20")
        expect(slider.max).toBe("80")
        expect(slider.step).toBe("5")
        expect(screen.getByTestId("speech-bubble-width-value")).toBeTruthy()
    })

    it("default width is 40% when config is NULL", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        expect(
            screen.getByTestId("speech-bubble-width-value").textContent,
        ).toBe("40%")
    })

    it("dragging the width slider fires onChange DEBOUNCED (300ms) with bubble_width key", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigSpeechBubble config={null} onChange={onChange} />,
        )
        const slider = screen.getByTestId(
            "speech-bubble-width-slider",
        ) as HTMLInputElement
        fireEvent.change(slider, {target: {value: "70"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{bubble_width: 70}],
        })
    })

    it("clamps out-of-range width into [20, 80] for display", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{bubble_width: 100}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-width-value").textContent,
        ).toBe("80%")
    })

    it("pre-filled bubble_width echoes the persisted value", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{bubble_width: 55}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-width-value").textContent,
        ).toBe("55%")
    })

    it("legacy `size` key falls through as the width when bubble_width is absent (backward-compat)", () => {
        // Pre-Bug-1 pages persist `size`. The width slider must
        // read it as the legacy width so existing bubbles don't
        // visually pop on the first open after the upgrade.
        render(
            <LayoutConfigSpeechBubble
                config={{size: 50}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-width-value").textContent,
        ).toBe("50%")
    })

    it("bubble_width takes precedence over legacy `size` when both are set", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{bubble_width: 70, size: 30}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-width-value").textContent,
        ).toBe("70%")
    })
})

describe("LayoutConfigSpeechBubble - height slider (Bug 1)", () => {
    it("renders the height slider + value display", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        const slider = screen.getByTestId(
            "speech-bubble-height-slider",
        ) as HTMLInputElement
        expect(slider.type).toBe("range")
        expect(slider.min).toBe("15")
        expect(slider.max).toBe("60")
        expect(slider.step).toBe("5")
        expect(screen.getByTestId("speech-bubble-height-value")).toBeTruthy()
    })

    it("default height is 30% when config is NULL", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        expect(
            screen.getByTestId("speech-bubble-height-value").textContent,
        ).toBe("30%")
    })

    it("dragging the height slider fires onChange DEBOUNCED (300ms) with bubble_height key", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigSpeechBubble config={null} onChange={onChange} />,
        )
        const slider = screen.getByTestId(
            "speech-bubble-height-slider",
        ) as HTMLInputElement
        fireEvent.change(slider, {target: {value: "45"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{bubble_height: 45}],
        })
    })

    it("clamps out-of-range height into [15, 60] for display", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{bubble_height: 99}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-height-value").textContent,
        ).toBe("60%")
    })

    it("pre-filled bubble_height echoes the persisted value", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{bubble_height: 50}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-height-value").textContent,
        ).toBe("50%")
    })
})

// --- PB-PHASE4 Session 4c-B-1 manual smoke Finding A: 9-cell anchor grid ---

describe("LayoutConfigSpeechBubble - 9-cell anchor grid (Finding A)", () => {
    const ALL_PRESETS = [
        "top-left",
        "top-center",
        "top-right",
        "middle-left",
        "center",
        "middle-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
    ] as const

    it("renders all 9 anchor cells", () => {
        render(
            <LayoutConfigSpeechBubble
                config={null}
                onChange={vi.fn()}
            />,
        )
        for (const preset of ALL_PRESETS) {
            expect(
                screen.getByTestId(`speech-bubble-anchor-${preset}`),
            ).toBeTruthy()
        }
    })

    it.each(ALL_PRESETS)(
        "clicking %s preset persists anchor_position via onChange",
        (preset) => {
            const onChange = vi.fn()
            render(
                <LayoutConfigSpeechBubble
                    config={null}
                    onChange={onChange}
                />,
            )
            fireEvent.click(screen.getByTestId(`speech-bubble-anchor-${preset}`))
            expect(onChange).toHaveBeenCalledWith({
                bubbles: [{anchor_position: preset}],
            })
        },
    )

    it("pre-filled middle-left anchor reflects as selected (new edge-midpoint preset)", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{anchor_position: "middle-left"}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen
                .getByTestId("speech-bubble-anchor-middle-left")
                .closest("label")
                ?.className,
        ).toContain("anchorCellSelected")
    })

    it("pre-filled top-center anchor reflects as selected (new edge-midpoint preset)", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{anchor_position: "top-center"}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen
                .getByTestId("speech-bubble-anchor-top-center")
                .closest("label")
                ?.className,
        ).toContain("anchorCellSelected")
    })
})

// --- 4c-B-2 C1: bubbles[0] wrapper-shape (NQ2 scope-anticipate) ---
//
// Reads honour bubbles[0] precedence over flat top-level keys
// (legacy fallback). Writes always go through bubbles[0]. Both
// directions verified here so plugin-comics Session 2 can
// inherit the wrapper shape without surprise.

describe("LayoutConfigSpeechBubble - bubbles[0] wrapper (4c-B-2 C1)", () => {
    it("reads anchor_position from bubbles[0] in preference over flat", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{
                    anchor_position: "top-left",
                    bubbles: [{anchor_position: "bottom-right"}],
                }}
                onChange={vi.fn()}
            />,
        )
        const winner = screen.getByTestId(
            "speech-bubble-anchor-bottom-right",
        ) as HTMLInputElement
        expect(winner.checked).toBe(true)
        const loser = screen.getByTestId(
            "speech-bubble-anchor-top-left",
        ) as HTMLInputElement
        expect(loser.checked).toBe(false)
    })

    it("reads opacity from bubbles[0] in preference over flat", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{opacity: 0.4, bubbles: [{opacity: 0.85}]}}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-opacity-value").textContent,
        ).toBe("0.85")
    })

    it("reads bubble_width from bubbles[0] in preference over flat + legacy size", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{
                    size: 30,
                    bubble_width: 50,
                    bubbles: [{bubble_width: 70}],
                }}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-width-value").textContent,
        ).toBe("70%")
    })

    it("reads bubble_height from bubbles[0] in preference over flat", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{
                    bubble_height: 20,
                    bubbles: [{bubble_height: 55}],
                }}
                onChange={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("speech-bubble-height-value").textContent,
        ).toBe("55%")
    })

    it("falls back to flat top-level keys when bubbles[0] is empty / absent", () => {
        // Pre-C1 picture-book pages have flat shape; the read-path
        // shim must keep them rendering correctly.
        render(
            <LayoutConfigSpeechBubble
                config={{
                    anchor_position: "top-right",
                    opacity: 0.65,
                    bubble_width: 60,
                    bubble_height: 25,
                }}
                onChange={vi.fn()}
            />,
        )
        const selected = screen.getByTestId(
            "speech-bubble-anchor-top-right",
        ) as HTMLInputElement
        expect(selected.checked).toBe(true)
        expect(
            screen.getByTestId("speech-bubble-opacity-value").textContent,
        ).toBe("0.65")
        expect(
            screen.getByTestId("speech-bubble-width-value").textContent,
        ).toBe("60%")
        expect(
            screen.getByTestId("speech-bubble-height-value").textContent,
        ).toBe("25%")
    })

    it("writes preserve prior bubble fields when a single field is edited", () => {
        // The dispatcher reads the prior bubble state (which honours
        // flat fallback) and writes the merged bubble back. Editing
        // anchor while opacity is set MUST NOT drop opacity.
        const onChange = vi.fn()
        render(
            <LayoutConfigSpeechBubble
                config={{
                    opacity: 0.6,
                    bubble_width: 55,
                    bubbles: [{anchor_position: "bottom-left"}],
                }}
                onChange={onChange}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-anchor-top-right"))
        expect(onChange).toHaveBeenCalledTimes(1)
        const [partial] = onChange.mock.calls[0]
        expect(partial.bubbles).toHaveLength(1)
        const written = partial.bubbles[0]
        // New field is set.
        expect(written.anchor_position).toBe("top-right")
        // Prior bubble field preserved.
        expect(written.opacity).toBe(0.6)
        // Flat fallback field also pulled into the bubble.
        expect(written.bubble_width).toBe(55)
    })
})

// --- 4c-B-2 C2: Tier 1 Visual Style (6 fields) ---
//
// Six per-bubble visual-style properties: background_color,
// border_color, border_width, border_style, border_radius,
// shadow + shadow_intensity. All land under bubbles[0] via
// writeBubble per C1's wrapper-shape decision. Field-name parity
// with comic_bubbles.bubble_config (docs/explorations/
// comic-foundation.md NQ2).

describe("LayoutConfigSpeechBubble - Tier 1 Visual Style (4c-B-2 C2)", () => {
    it("renders the Tier 1 collapsible section trigger", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        expect(screen.getByTestId("speech-bubble-tier1-trigger")).toBeTruthy()
    })

    it("Tier 1 section is collapsed by default (controls not rendered)", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        // Radix Collapsible mounts Content lazily; before the
        // trigger is clicked, the inner controls are not in the DOM.
        expect(
            screen.queryByTestId("speech-bubble-background-color"),
        ).toBeNull()
    })

    it("clicking the Tier 1 trigger reveals the 6 controls", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        expect(
            screen.getByTestId("speech-bubble-background-color"),
        ).toBeTruthy()
        expect(screen.getByTestId("speech-bubble-border-color")).toBeTruthy()
        expect(
            screen.getByTestId("speech-bubble-border-width-slider"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("speech-bubble-border-style-trigger"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("speech-bubble-border-radius-slider"),
        ).toBeTruthy()
        expect(screen.getByTestId("speech-bubble-shadow-toggle")).toBeTruthy()
        expect(
            screen.getByTestId("speech-bubble-shadow-intensity-slider"),
        ).toBeTruthy()
    })

    it("background_color picker writes bubbles[0].background_color (debounced)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const picker = screen.getByTestId(
            "speech-bubble-background-color",
        ) as HTMLInputElement
        fireEvent.change(picker, {target: {value: "#ff8800"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{background_color: "#ff8800"}],
        })
    })

    it("border_color picker writes bubbles[0].border_color (debounced)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const picker = screen.getByTestId(
            "speech-bubble-border-color",
        ) as HTMLInputElement
        fireEvent.change(picker, {target: {value: "#00aaff"}})
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{border_color: "#00aaff"}],
        })
    })

    it("border_width slider writes bubbles[0].border_width (debounced, clamped to 0-8)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const slider = screen.getByTestId(
            "speech-bubble-border-width-slider",
        ) as HTMLInputElement
        expect(slider.min).toBe("0")
        expect(slider.max).toBe("8")
        fireEvent.change(slider, {target: {value: "5"}})
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{border_width: 5}],
        })
    })

    it("border_style select writes bubbles[0].border_style (immediate, all 4 values)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const select = screen.getByTestId(
            "speech-bubble-border-style-trigger",
        ) as HTMLSelectElement
        for (const style of ["solid", "dashed", "dotted", "none"]) {
            onChange.mockClear()
            fireEvent.change(select, {target: {value: style}})
            expect(onChange).toHaveBeenCalledWith({
                bubbles: [{border_style: style}],
            })
        }
    })

    it("border_radius slider writes bubbles[0].border_radius (debounced, 0-50%)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const slider = screen.getByTestId(
            "speech-bubble-border-radius-slider",
        ) as HTMLInputElement
        expect(slider.min).toBe("0")
        expect(slider.max).toBe("50")
        fireEvent.change(slider, {target: {value: "25"}})
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{border_radius: 25}],
        })
    })

    it("shadow toggle writes bubbles[0].shadow (immediate boolean)", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigSpeechBubble
                config={{bubbles: [{shadow: true}]}}
                onChange={onChange}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const toggle = screen.getByTestId(
            "speech-bubble-shadow-toggle",
        ) as HTMLInputElement
        fireEvent.click(toggle)
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{shadow: false}],
        })
    })

    it("Q3 (a): shadow_intensity slider is DISABLED when shadow is off", () => {
        // Q3 decision: intensity stays visible but disabled when
        // shadow=false. Preserves last value so the user can flip
        // back without losing their pick.
        render(
            <LayoutConfigSpeechBubble
                config={{bubbles: [{shadow: false, shadow_intensity: 7}]}}
                onChange={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const slider = screen.getByTestId(
            "speech-bubble-shadow-intensity-slider",
        ) as HTMLInputElement
        expect(slider.disabled).toBe(true)
        // Value display still echoes the persisted intensity.
        expect(
            screen.getByTestId("speech-bubble-shadow-intensity-value")
                .textContent,
        ).toBe("7")
    })

    it("shadow_intensity slider writes bubbles[0].shadow_intensity (debounced, 0-10)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const slider = screen.getByTestId(
            "speech-bubble-shadow-intensity-slider",
        ) as HTMLInputElement
        expect(slider.min).toBe("0")
        expect(slider.max).toBe("10")
        // Shadow is ON by default so the slider is enabled.
        expect(slider.disabled).toBe(false)
        fireEvent.change(slider, {target: {value: "8"}})
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{shadow_intensity: 8}],
        })
    })

    // PADDING-FONT-STYLE-01 C1: padding slider (uniform).
    it("padding slider renders inside Tier 1 with 0-32 px range, default 12", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const slider = screen.getByTestId(
            "speech-bubble-padding-slider",
        ) as HTMLInputElement
        expect(slider.type).toBe("range")
        expect(slider.min).toBe("0")
        expect(slider.max).toBe("32")
        expect(slider.step).toBe("1")
        expect(
            screen.getByTestId("speech-bubble-padding-value").textContent,
        ).toBe("12px")
    })

    it("padding slider writes bubbles[0].padding (debounced, 0-32 px)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const slider = screen.getByTestId(
            "speech-bubble-padding-slider",
        ) as HTMLInputElement
        fireEvent.change(slider, {target: {value: "20"}})
        expect(onChange).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{padding: 20}],
        })
    })

    it("padding clamps out-of-range values into [0, 32] for display", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{bubbles: [{padding: 99}]}}
                onChange={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        expect(
            screen.getByTestId("speech-bubble-padding-value").textContent,
        ).toBe("32px")
    })

    it("padding read honours bubbles[0] precedence over flat", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{padding: 5, bubbles: [{padding: 22}]}}
                onChange={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        expect(
            screen.getByTestId("speech-bubble-padding-value").textContent,
        ).toBe("22px")
    })

    it("Tier 1 reads honour bubbles[0] precedence over flat (background_color)", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{
                    background_color: "#000000",
                    bubbles: [{background_color: "#ff00ff"}],
                }}
                onChange={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"))
        const picker = screen.getByTestId(
            "speech-bubble-background-color",
        ) as HTMLInputElement
        expect(picker.value).toBe("#ff00ff")
    })
})

// --- 4c-B-2 C3: Tier 2 Typography (5 fields) ---
//
// Five per-bubble typography properties: font_family, font_size,
// font_weight, text_color, text_align. Font catalog reuses the
// v0.35.0 5-font OFL set (Q4 decision). All land under bubbles[0]
// via writeBubble per C1's wrapper-shape decision.

describe("LayoutConfigSpeechBubble - Tier 2 Typography (4c-B-2 C3)", () => {
    it("renders the Tier 2 collapsible section trigger", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        expect(screen.getByTestId("speech-bubble-tier2-trigger")).toBeTruthy()
    })

    it("Tier 2 section is collapsed by default (controls not rendered)", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        expect(
            screen.queryByTestId("speech-bubble-font-family-trigger"),
        ).toBeNull()
    })

    it("clicking the Tier 2 trigger reveals the 5 controls", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        expect(
            screen.getByTestId("speech-bubble-font-family-trigger"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("speech-bubble-font-size-slider"),
        ).toBeTruthy()
        expect(
            screen.getByTestId("speech-bubble-font-weight-trigger"),
        ).toBeTruthy()
        expect(screen.getByTestId("speech-bubble-text-color")).toBeTruthy()
        expect(
            screen.getByTestId("speech-bubble-text-align-trigger"),
        ).toBeTruthy()
    })

    it("font_family dropdown lists the 5 OFL fonts from v0.35.0 (Q4 decision)", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        const select = screen.getByTestId(
            "speech-bubble-font-family-trigger",
        ) as HTMLSelectElement
        const values = Array.from(select.options).map((o) => o.value)
        expect(values).toEqual([
            "Atkinson Hyperlegible",
            "Andika",
            "Comic Neue",
            "Lexend",
            "OpenDyslexic",
        ])
    })

    it("font_family select writes bubbles[0].font_family (immediate)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        const select = screen.getByTestId(
            "speech-bubble-font-family-trigger",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "Comic Neue"}})
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{font_family: "Comic Neue"}],
        })
    })

    it("font_size slider writes bubbles[0].font_size (debounced, 10-32 pt)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        const slider = screen.getByTestId(
            "speech-bubble-font-size-slider",
        ) as HTMLInputElement
        expect(slider.min).toBe("10")
        expect(slider.max).toBe("32")
        fireEvent.change(slider, {target: {value: "20"}})
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{font_size: 20}],
        })
    })

    it("font_weight select writes bubbles[0].font_weight (immediate, both values)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        const select = screen.getByTestId(
            "speech-bubble-font-weight-trigger",
        ) as HTMLSelectElement
        for (const weight of ["bold", "normal"]) {
            onChange.mockClear()
            fireEvent.change(select, {target: {value: weight}})
            expect(onChange).toHaveBeenCalledWith({
                bubbles: [{font_weight: weight}],
            })
        }
    })

    it("text_color picker writes bubbles[0].text_color (debounced)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        const picker = screen.getByTestId(
            "speech-bubble-text-color",
        ) as HTMLInputElement
        fireEvent.change(picker, {target: {value: "#aa1122"}})
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{text_color: "#aa1122"}],
        })
    })

    it("text_align select writes bubbles[0].text_align (immediate, all 3 values)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        const select = screen.getByTestId(
            "speech-bubble-text-align-trigger",
        ) as HTMLSelectElement
        for (const align of ["left", "right", "center"]) {
            onChange.mockClear()
            fireEvent.change(select, {target: {value: align}})
            expect(onChange).toHaveBeenCalledWith({
                bubbles: [{text_align: align}],
            })
        }
    })

    // PADDING-FONT-STYLE-01 C2: italic toggle (boolean).
    it("italic toggle renders inside Tier 2 (default off)", () => {
        render(<LayoutConfigSpeechBubble config={null} onChange={vi.fn()} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        const toggle = screen.getByTestId(
            "speech-bubble-italic-toggle",
        ) as HTMLInputElement
        expect(toggle.type).toBe("checkbox")
        expect(toggle.checked).toBe(false)
    })

    it("italic toggle writes bubbles[0].italic boolean (immediate)", () => {
        const onChange = vi.fn()
        render(<LayoutConfigSpeechBubble config={null} onChange={onChange} />)
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        fireEvent.click(screen.getByTestId("speech-bubble-italic-toggle"))
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{italic: true}],
        })
    })

    it("italic toggle reflects persisted bubbles[0].italic=true", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{bubbles: [{italic: true}]}}
                onChange={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        const toggle = screen.getByTestId(
            "speech-bubble-italic-toggle",
        ) as HTMLInputElement
        expect(toggle.checked).toBe(true)
    })

    it("italic toggle flips persisted true back to false (immediate)", () => {
        const onChange = vi.fn()
        render(
            <LayoutConfigSpeechBubble
                config={{bubbles: [{italic: true}]}}
                onChange={onChange}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        fireEvent.click(screen.getByTestId("speech-bubble-italic-toggle"))
        expect(onChange).toHaveBeenCalledWith({
            bubbles: [{italic: false}],
        })
    })

    it("italic read honours bubbles[0] precedence over flat", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{italic: false, bubbles: [{italic: true}]}}
                onChange={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        const toggle = screen.getByTestId(
            "speech-bubble-italic-toggle",
        ) as HTMLInputElement
        expect(toggle.checked).toBe(true)
    })

    it("Tier 2 reads honour bubbles[0] precedence over flat (font_size)", () => {
        render(
            <LayoutConfigSpeechBubble
                config={{font_size: 10, bubbles: [{font_size: 22}]}}
                onChange={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("speech-bubble-tier2-trigger"))
        expect(
            screen.getByTestId("speech-bubble-font-size-value").textContent,
        ).toBe("22pt")
    })
})
