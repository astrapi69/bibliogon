/**
 * BubbleTail + bubbleTypeClassName tests (Comics-Session-2 C4).
 *
 * Pins:
 * - The 8 octant directions render an svg with the correct
 *   ``data-direction`` attribute.
 * - ``none`` returns null.
 * - ``auto`` maps to ``S`` (matches the walker's gamma-shim
 *   default until Session 3 nearest-edge auto-pick lands).
 * - positionPct clamps to [0, 100].
 * - ``bubbleTypeClassName`` returns the soundEffect text-styling
 *   class for ``sound_effect`` and an empty string for the other
 *   five types (approach A moved shape rendering off CSS classes).
 *
 * Field-name + math parity with the walker's ``_TAIL_DIRECTION_VECTORS``
 * + ``_render_bubble_tail_svg`` in
 * ``plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py``.
 */

import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";

import {BubbleTail, type BubbleTailDirection} from "./BubbleTail";
import {bubbleTypeClassName} from "./bubbleTypeStyle";

describe("BubbleTail", () => {
    const OCTANTS: BubbleTailDirection[] = [
        "N",
        "NE",
        "E",
        "SE",
        "S",
        "SW",
        "W",
        "NW",
    ];

    it.each(OCTANTS)(
        "renders an svg for direction %s",
        (direction) => {
            render(
                <BubbleTail direction={direction} positionPct={50} lengthPx={16} />,
            );
            const svg = screen.getByTestId("bubble-tail-svg");
            expect(svg).toBeInTheDocument();
            expect(svg.getAttribute("data-direction")).toBe(direction);
            expect(svg.querySelector("polygon")).not.toBeNull();
        },
    );

    it("returns null for direction='none'", () => {
        const {container} = render(
            <BubbleTail direction="none" positionPct={50} lengthPx={16} />,
        );
        expect(container.querySelector("[data-testid=bubble-tail-svg]")).toBeNull();
    });

    it("maps direction='auto' to 'S' on the rendered svg", () => {
        render(<BubbleTail direction="auto" positionPct={50} lengthPx={16} />);
        const svg = screen.getByTestId("bubble-tail-svg");
        expect(svg.getAttribute("data-direction")).toBe("S");
    });

    it("clamps positionPct above 100 to 100", () => {
        render(<BubbleTail direction="S" positionPct={250} lengthPx={16} />);
        const svg = screen.getByTestId("bubble-tail-svg");
        // S → bottom + left positioning; left becomes ``100%``.
        expect((svg as HTMLElement).style.left).toBe("100%");
    });

    it("clamps positionPct below 0 to 0", () => {
        render(<BubbleTail direction="N" positionPct={-25} lengthPx={16} />);
        const svg = screen.getByTestId("bubble-tail-svg");
        expect((svg as HTMLElement).style.left).toBe("0%");
    });

    it("polygon tip direction differs between N and S", () => {
        const {container: northContainer} = render(
            <BubbleTail direction="N" positionPct={50} lengthPx={16} />,
        );
        const northPoints =
            northContainer.querySelector("polygon")?.getAttribute("points") ?? "";
        const {container: southContainer} = render(
            <BubbleTail direction="S" positionPct={50} lengthPx={16} />,
        );
        const southPoints =
            southContainer.querySelector("polygon")?.getAttribute("points") ?? "";
        // N tip = (0, -16); S tip = (0, 16). The Y-component sign
        // differs, so the leading vertex in the points string MUST
        // differ between the two.
        expect(northPoints).not.toBe("");
        expect(southPoints).not.toBe("");
        expect(northPoints).not.toBe(southPoints);
        expect(northPoints.startsWith("0.0,-16.0")).toBe(true);
        expect(southPoints.startsWith("0.0,16.0")).toBe(true);
    });

    it("E positions on right edge, W on left edge", () => {
        const {container: eastContainer} = render(
            <BubbleTail direction="E" positionPct={40} lengthPx={16} />,
        );
        const eastSvg = eastContainer.querySelector(
            "[data-testid=bubble-tail-svg]",
        ) as HTMLElement | null;
        expect(eastSvg).not.toBeNull();
        expect(eastSvg!.style.right).toBe("0px");
        expect(eastSvg!.style.top).toBe("40%");

        const {container: westContainer} = render(
            <BubbleTail direction="W" positionPct={60} lengthPx={16} />,
        );
        const westSvg = westContainer.querySelector(
            "[data-testid=bubble-tail-svg]",
        ) as HTMLElement | null;
        expect(westSvg).not.toBeNull();
        expect(westSvg!.style.left).toBe("0px");
        expect(westSvg!.style.top).toBe("60%");
    });

    describe("visual integration (overlap + mask)", () => {
        it("emits a mask polygon with bubbleBackgroundColor and no stroke", () => {
            render(
                <BubbleTail
                    direction="S"
                    positionPct={50}
                    lengthPx={16}
                    bubbleBackgroundColor="#f5f5dc"
                />,
            );
            const mask = screen.getByTestId("bubble-tail-mask");
            expect(mask.getAttribute("fill")).toBe("#f5f5dc");
            expect(mask.getAttribute("stroke")).toBe("none");
        });

        it("mask polygon defaults to white when bubbleBackgroundColor is omitted", () => {
            render(<BubbleTail direction="S" positionPct={50} lengthPx={16} />);
            const mask = screen.getByTestId("bubble-tail-mask");
            expect(mask.getAttribute("fill")).toBe("white");
        });

        it("emits two stroked lines (left + right) instead of a closed-base polygon", () => {
            render(<BubbleTail direction="S" positionPct={50} lengthPx={16} />);
            const left = screen.getByTestId("bubble-tail-stroke-left");
            const right = screen.getByTestId("bubble-tail-stroke-right");
            // Both start at the bubble's edge (perpendicular base
            // vertex) and end at the tip.
            expect(left.getAttribute("stroke")).toBe("black");
            expect(right.getAttribute("stroke")).toBe("black");
            // For S direction: tip is at (0, 16); base-left is at
            // (-(-1)*4, 0*4) = (4, 0); base-right is at (-4, 0).
            // The S vector vec=(0, 1), so perp=(-vy,vx)=(-1, 0),
            // base_perp = perp * half_base = (-4, 0). base-left =
            // base_perp, base-right = -base_perp. So:
            //   left: x1=-4, y1=0, x2=0, y2=16
            //   right: x1=4, y1=0, x2=0, y2=16
            expect(parseFloat(left.getAttribute("x1") ?? "")).toBe(-4);
            expect(parseFloat(left.getAttribute("y1") ?? "")).toBe(0);
            expect(parseFloat(left.getAttribute("x2") ?? "")).toBe(0);
            expect(parseFloat(left.getAttribute("y2") ?? "")).toBe(16);
            expect(parseFloat(right.getAttribute("x1") ?? "")).toBe(4);
            expect(parseFloat(right.getAttribute("y1") ?? "")).toBe(0);
            expect(parseFloat(right.getAttribute("x2") ?? "")).toBe(0);
            expect(parseFloat(right.getAttribute("y2") ?? "")).toBe(16);
        });

        it("mask polygon base extends INWARD by the overlap (3px) past the bubble edge", () => {
            render(<BubbleTail direction="S" positionPct={50} lengthPx={16} />);
            const mask = screen.getByTestId("bubble-tail-mask");
            const points = mask.getAttribute("points") ?? "";
            // S direction: vec=(0,1). Mask vertices are tip +
            // (base-left + mask-inset) + (base-right + mask-inset).
            // mask-inset = -vec * 3 = (0, -3).
            // base-left = (-4, 0); mask-left = (-4, -3).
            // base-right = (4, 0); mask-right = (4, -3).
            // tip = (0, 16).
            expect(points).toBe("0.0,16.0 -4.0,-3.0 4.0,-3.0");
        });
    });
});

describe("bubbleTypeClassName", () => {
    // Approach A moved shape rendering off CSS classes onto the
    // single SVG ``<path>``. Only ``sound_effect`` retains a
    // per-type text-styling CSS rule (font-weight + italic +
    // text-shadow); every other canonical type returns an empty
    // class string.
    it("returns a non-empty class for sound_effect", () => {
        const result = bubbleTypeClassName("sound_effect");
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
    });

    it.each(["speech", "thought", "narration", "shout", "whisper"])(
        "returns an empty class for shape-only type=%s",
        (value) => {
            expect(bubbleTypeClassName(value)).toBe("");
        },
    );

    it("returns an empty class for unknown bubble_type", () => {
        expect(bubbleTypeClassName("nonsense_bubble")).toBe("");
    });
});
