/**
 * ComicBubble tests (Comics-Session-2 C5).
 *
 * Pins:
 * - Anchor → CSS left/top.
 * - width_pct / height_pct → CSS width/height as %.
 * - bubble_type → CSS-Module class name (via bubbleTypeClassName).
 * - bubble_config Tier-1/Tier-2 overrides cascade as inline style.
 * - BubbleTail child renders when tail_direction is not 'none'.
 */

import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";

import {ComicBubble, type ComicBubbleData} from "./ComicBubble";

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
        text_content: "hi",
        ...overrides,
    };
}

describe("ComicBubble", () => {
    it("positions itself per anchor + dimensions", () => {
        render(<ComicBubble bubble={makeBubble()} />);
        const el = screen.getByTestId("comic-bubble-b1") as HTMLElement;
        expect(el.style.left).toBe("10%");
        expect(el.style.top).toBe("20%");
        expect(el.style.width).toBe("30%");
        expect(el.style.height).toBe("20%");
    });

    it("exposes bubble_type via data-bubble-type attr", () => {
        render(<ComicBubble bubble={makeBubble({bubble_type: "shout"})} />);
        expect(
            screen.getByTestId("comic-bubble-b1").getAttribute(
                "data-bubble-type",
            ),
        ).toBe("shout");
    });

    it("renders text_content", () => {
        render(<ComicBubble bubble={makeBubble({text_content: "Boom!"})} />);
        expect(screen.getByTestId("comic-bubble-b1").textContent).toContain(
            "Boom!",
        );
    });

    it("renders the BubbleTail child when tail_direction != 'none'", () => {
        render(<ComicBubble bubble={makeBubble({tail_direction: "S"})} />);
        expect(screen.getByTestId("bubble-tail-svg")).toBeInTheDocument();
    });

    it("omits the BubbleTail child when tail_direction === 'none'", () => {
        const {container} = render(
            <ComicBubble bubble={makeBubble({tail_direction: "none"})} />,
        );
        expect(
            container.querySelector("[data-testid=bubble-tail-svg]"),
        ).toBeNull();
    });

    it("applies bubble_config border + radius overrides as inline style", () => {
        render(
            <ComicBubble
                bubble={makeBubble({
                    bubble_config: {
                        border_color: "#ff0000",
                        border_width: 3,
                        border_style: "dashed",
                        border_radius: 25,
                    },
                })}
            />,
        );
        const el = screen.getByTestId("comic-bubble-b1") as HTMLElement;
        expect(el.style.border).toContain("dashed");
        expect(el.style.borderRadius).toBe("25%");
    });

    it("clamps out-of-range anchor pct into [0, 100]", () => {
        render(
            <ComicBubble
                bubble={makeBubble({anchor: {x_pct: -10, y_pct: 250}})}
            />,
        );
        const el = screen.getByTestId("comic-bubble-b1") as HTMLElement;
        expect(el.style.left).toBe("0%");
        expect(el.style.top).toBe("100%");
    });
});
