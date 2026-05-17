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
})

afterEach(() => {
    vi.useRealTimers()
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
        expect(onChange).toHaveBeenCalledWith({anchor_position: "top-left"})
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
            expect(onChange).toHaveBeenCalledWith({anchor_position: preset})
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
        expect(onChange).toHaveBeenCalledWith({opacity: 0.5})
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
        expect(onChange).toHaveBeenCalledWith({opacity: 0.85})
    })
})
