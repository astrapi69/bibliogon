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

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

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

/** Helper that mounts the bubble inside a fake parent with a fixed
 *  bounding rect. ``offsetParent`` returns the wrapping ``<div>``
 *  in happy-dom, and ``getBoundingClientRect`` is patched on it so
 *  the pointer math has a deterministic panel size to work with. */
function renderWithFakePanel(
    bubble: ComicBubbleData,
    handlers: {
        onDragEnd?: (x_pct: number, y_pct: number) => void;
        onClick?: () => void;
    },
    rect: {width: number; height: number} = {width: 400, height: 300},
) {
    const Wrapper = () => (
        <div
            ref={(node) => {
                if (!node) return;
                // Patch the parent's getBoundingClientRect so the
                // drag math has predictable dimensions in happy-dom.
                node.getBoundingClientRect = () =>
                    ({
                        x: 0,
                        y: 0,
                        left: 0,
                        top: 0,
                        right: rect.width,
                        bottom: rect.height,
                        width: rect.width,
                        height: rect.height,
                        toJSON: () => ({}),
                    }) as DOMRect;
            }}
            style={{position: "relative", width: rect.width, height: rect.height}}
            data-testid="fake-panel"
        >
            <ComicBubble bubble={bubble} {...handlers} />
        </div>
    );
    return render(<Wrapper />);
}

describe("ComicBubble - drag-to-position", () => {
    it("fires onDragEnd with clamped pct after a drag exceeds 5px", () => {
        const onDragEnd = vi.fn();
        renderWithFakePanel(
            // Anchor at (10, 20), bubble 30x20. Panel 400x300.
            // Drag 80px right (= 20pct of 400) + 60px down (= 20pct of 300).
            // Expected anchor: (30, 40), inside the clamp range.
            {
                id: "b1",
                panel_id: "p1",
                position: 0,
                bubble_type: "speech",
                anchor: {x_pct: 10, y_pct: 20},
                width_pct: 30,
                height_pct: 20,
                tail_direction: "none",
                tail_position_pct: 50,
                tail_length_px: 16,
                bubble_config: null,
                text_content: "",
            },
            {onDragEnd},
        );
        const el = screen.getByTestId("comic-bubble-b1");
        fireEvent.pointerDown(el, {pointerId: 1, button: 0, clientX: 50, clientY: 60});
        fireEvent.pointerMove(el, {pointerId: 1, clientX: 130, clientY: 120});
        fireEvent.pointerUp(el, {pointerId: 1, clientX: 130, clientY: 120});
        expect(onDragEnd).toHaveBeenCalledTimes(1);
        const [x_pct, y_pct] = onDragEnd.mock.calls[0];
        expect(Math.round(x_pct)).toBe(30);
        expect(Math.round(y_pct)).toBe(40);
    });

    it("clamps the anchor to [0, 100 - width_pct] × [0, 100 - height_pct]", () => {
        const onDragEnd = vi.fn();
        renderWithFakePanel(
            {
                id: "b1",
                panel_id: "p1",
                position: 0,
                bubble_type: "speech",
                anchor: {x_pct: 80, y_pct: 70},
                width_pct: 30,
                height_pct: 20,
                tail_direction: "none",
                tail_position_pct: 50,
                tail_length_px: 16,
                bubble_config: null,
                text_content: "",
            },
            {onDragEnd},
        );
        const el = screen.getByTestId("comic-bubble-b1");
        // Drag 200px right + 200px down — would overshoot the panel.
        fireEvent.pointerDown(el, {pointerId: 1, button: 0, clientX: 100, clientY: 100});
        fireEvent.pointerMove(el, {pointerId: 1, clientX: 300, clientY: 300});
        fireEvent.pointerUp(el, {pointerId: 1, clientX: 300, clientY: 300});
        const [x_pct, y_pct] = onDragEnd.mock.calls[0];
        // Width 30 → max anchor X = 70. Height 20 → max anchor Y = 80.
        expect(x_pct).toBe(70);
        expect(y_pct).toBe(80);
    });

    it("treats a short pointer-up as a click (no drag fired)", () => {
        const onDragEnd = vi.fn();
        const onClick = vi.fn();
        renderWithFakePanel(
            {
                id: "b1",
                panel_id: "p1",
                position: 0,
                bubble_type: "speech",
                anchor: {x_pct: 10, y_pct: 20},
                width_pct: 30,
                height_pct: 20,
                tail_direction: "none",
                tail_position_pct: 50,
                tail_length_px: 16,
                bubble_config: null,
                text_content: "",
            },
            {onDragEnd, onClick},
        );
        const el = screen.getByTestId("comic-bubble-b1");
        // 2px movement — below the 5px threshold.
        fireEvent.pointerDown(el, {pointerId: 1, button: 0, clientX: 50, clientY: 60});
        fireEvent.pointerMove(el, {pointerId: 1, clientX: 51, clientY: 61});
        fireEvent.pointerUp(el, {pointerId: 1, clientX: 51, clientY: 61});
        expect(onDragEnd).not.toHaveBeenCalled();
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("renders move cursor + touchAction:none when onDragEnd is wired", () => {
        renderWithFakePanel(
            {
                id: "b1",
                panel_id: "p1",
                position: 0,
                bubble_type: "speech",
                anchor: {x_pct: 10, y_pct: 20},
                width_pct: 30,
                height_pct: 20,
                tail_direction: "none",
                tail_position_pct: 50,
                tail_length_px: 16,
                bubble_config: null,
                text_content: "",
            },
            {onDragEnd: () => {}},
        );
        const el = screen.getByTestId("comic-bubble-b1") as HTMLElement;
        expect(el.style.cursor).toBe("move");
        expect(el.style.touchAction).toBe("none");
    });
});
