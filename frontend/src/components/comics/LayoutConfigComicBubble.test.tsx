/**
 * LayoutConfigComicBubble tests (Comics-Session-2 C5).
 *
 * Pins:
 * - 6 bubble-type radios + their selection.
 * - 10 tail-direction radios + their selection.
 * - Tier1Section + Tier2Section mount under comic-bubble testid
 *   prefix.
 * - Tail position + length sliders disable when direction='none'.
 * - bubble_type radio fires onChange with the new value.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {LayoutConfigComicBubble} from "./LayoutConfigComicBubble";
import type {ComicBubbleData} from "./ComicBubble";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

function makeBubble(overrides: Partial<ComicBubbleData> = {}): ComicBubbleData {
    return {
        id: "b1",
        panel_id: "p1",
        position: 0,
        bubble_type: "speech",
        anchor: {x_pct: 10, y_pct: 20},
        width_pct: 30,
        height_pct: 20,
        tail_direction: "S",
        tail_position_pct: 50,
        tail_length_px: 16,
        bubble_config: null,
        text_content: null,
        ...overrides,
    };
}

describe("LayoutConfigComicBubble", () => {
    it("renders 6 bubble-type radios", () => {
        render(
            <LayoutConfigComicBubble
                bubble={makeBubble()}
                onChange={() => {}}
            />,
        );
        for (const bt of [
            "speech",
            "thought",
            "narration",
            "shout",
            "whisper",
            "sound_effect",
        ]) {
            expect(
                screen.getByTestId(`comic-bubble-type-${bt}`),
            ).toBeInTheDocument();
        }
    });

    it("renders 10 tail-direction radios (8 octants + none + auto)", () => {
        render(
            <LayoutConfigComicBubble
                bubble={makeBubble()}
                onChange={() => {}}
            />,
        );
        for (const d of [
            "N",
            "NE",
            "E",
            "SE",
            "S",
            "SW",
            "W",
            "NW",
            "none",
            "auto",
        ]) {
            expect(
                screen.getByTestId(`comic-bubble-tail-direction-${d}`),
            ).toBeInTheDocument();
        }
    });

    it("mounts Tier1Section + Tier2Section under comic-bubble prefix", () => {
        render(
            <LayoutConfigComicBubble
                bubble={makeBubble()}
                onChange={() => {}}
            />,
        );
        expect(
            screen.getByTestId("comic-bubble-tier1-trigger"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("comic-bubble-tier2-trigger"),
        ).toBeInTheDocument();
    });

    it("picking a different bubble_type fires onChange immediately", () => {
        const onChange = vi.fn();
        render(
            <LayoutConfigComicBubble
                bubble={makeBubble()}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByTestId("comic-bubble-type-thought"));
        expect(onChange).toHaveBeenCalledWith({bubble_type: "thought"});
    });

    it("changing tail_direction fires onChange immediately", () => {
        const onChange = vi.fn();
        render(
            <LayoutConfigComicBubble
                bubble={makeBubble()}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByTestId("comic-bubble-tail-direction-NE"));
        expect(onChange).toHaveBeenCalledWith({tail_direction: "NE"});
    });

    it("disables tail-position + tail-length sliders when direction='none'", () => {
        render(
            <LayoutConfigComicBubble
                bubble={makeBubble({tail_direction: "none"})}
                onChange={() => {}}
            />,
        );
        expect(
            (
                screen.getByTestId(
                    "comic-bubble-tail-position-slider",
                ) as HTMLInputElement
            ).disabled,
        ).toBe(true);
        expect(
            (
                screen.getByTestId(
                    "comic-bubble-tail-length-slider",
                ) as HTMLInputElement
            ).disabled,
        ).toBe(true);
    });

    it("displays the bubble's current width / height", () => {
        render(
            <LayoutConfigComicBubble
                bubble={makeBubble({width_pct: 45, height_pct: 25})}
                onChange={() => {}}
            />,
        );
        expect(
            screen.getByTestId("comic-bubble-width-value").textContent,
        ).toBe("45%");
        expect(
            screen.getByTestId("comic-bubble-height-value").textContent,
        ).toBe("25%");
    });
});
