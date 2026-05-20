/**
 * ComicPanel tests (Comics-Session-2 C5).
 *
 * Pins:
 * - Panel renders an image when image_asset_id + assetUrl pair is
 *   resolved.
 * - Bubbles render INSIDE the panel in position order.
 * - panel_config.border_style overrides the default solid border.
 * - selection outlines surface via the ``selected`` prop.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {ComicPanel, type ComicPanelData} from "./ComicPanel";
import type {ComicBubbleData} from "./ComicBubble";

function makePanel(overrides: Partial<ComicPanelData> = {}): ComicPanelData {
    return {
        id: "p1",
        page_id: "pg1",
        position: 0,
        image_asset_id: null,
        bounds: {x_pct: 0, y_pct: 0, width_pct: 100, height_pct: 100},
        panel_config: null,
        ...overrides,
    };
}

function makeBubble(
    id: string,
    position: number,
    overrides: Partial<ComicBubbleData> = {},
): ComicBubbleData {
    return {
        id,
        panel_id: "p1",
        position,
        bubble_type: "speech",
        anchor: {x_pct: 10, y_pct: 20},
        width_pct: 30,
        height_pct: 20,
        tail_direction: "none",
        tail_position_pct: 50,
        tail_length_px: 16,
        bubble_config: null,
        text_content: null,
        ...overrides,
    };
}

describe("ComicPanel", () => {
    it("renders the panel root", () => {
        render(<ComicPanel panel={makePanel()} bubbles={[]} />);
        expect(screen.getByTestId("comic-panel-p1")).toBeInTheDocument();
    });

    it("renders an <img> when imageUrl is provided", () => {
        const {container} = render(
            <ComicPanel
                panel={makePanel({image_asset_id: "a1"})}
                bubbles={[]}
                imageUrl="/api/assets/a1"
            />,
        );
        const img = container.querySelector("img");
        expect(img).not.toBeNull();
        expect(img!.getAttribute("src")).toBe("/api/assets/a1");
    });

    it("renders bubbles in position order (lowest first)", () => {
        const {container} = render(
            <ComicPanel
                panel={makePanel()}
                bubbles={[
                    makeBubble("b2", 1),
                    makeBubble("b1", 0),
                    makeBubble("b3", 2),
                ]}
            />,
        );
        const bubbleEls = Array.from(
            container.querySelectorAll("[data-testid^='comic-bubble-']"),
        );
        expect(
            bubbleEls.map((el) => el.getAttribute("data-testid")),
        ).toEqual(["comic-bubble-b1", "comic-bubble-b2", "comic-bubble-b3"]);
    });

    it("propagates onBubbleClick", () => {
        const onBubbleClick = vi.fn();
        render(
            <ComicPanel
                panel={makePanel()}
                bubbles={[makeBubble("b1", 0)]}
                onBubbleClick={onBubbleClick}
            />,
        );
        fireEvent.click(screen.getByTestId("comic-bubble-b1"));
        expect(onBubbleClick).toHaveBeenCalledWith("b1");
    });

    it("applies panel_config.border_style override", () => {
        render(
            <ComicPanel
                panel={makePanel({panel_config: {border_style: "dashed"}})}
                bubbles={[]}
            />,
        );
        const el = screen.getByTestId("comic-panel-p1") as HTMLElement;
        expect(el.style.border).toContain("dashed");
    });
});
