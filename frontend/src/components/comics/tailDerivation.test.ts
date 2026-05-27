/**
 * tailDerivation math tests.
 *
 * Pins the bidirectional translation between
 * (direction, position_pct, length_px) and the visible tail-tip
 * position used by the drag handle.
 */

import {describe, it, expect} from "vitest";

import {
    computeVisibleTipPosition,
    deriveTailFromTip,
} from "./tailDerivation";

describe("computeVisibleTipPosition", () => {
    it("returns null for direction='none'", () => {
        expect(
            computeVisibleTipPosition("none", 50, 16, 100, 100),
        ).toBeNull();
    });

    it("returns null for an invalid direction", () => {
        expect(
            computeVisibleTipPosition(
                "INVALID" as never,
                50,
                16,
                100,
                100,
            ),
        ).toBeNull();
    });

    it("S direction with position_pct=50 + length=16 places tip below mid-bottom", () => {
        const tip = computeVisibleTipPosition("S", 50, 16, 100, 100);
        expect(tip).not.toBeNull();
        expect(tip!.x).toBeCloseTo(50, 1); // mid-bottom horizontally
        // svg_height for S = length + 8 = 24. SVG center y =
        // bubble_height - svg_height/2 = 100 - 12 = 88.
        // Tip y = svg_center_y + length = 88 + 16 = 104.
        expect(tip!.y).toBeCloseTo(104, 1);
    });

    it("E direction with position_pct=50 + length=16 places tip right of mid-right", () => {
        const tip = computeVisibleTipPosition("E", 50, 16, 100, 100);
        expect(tip).not.toBeNull();
        // svg_width for E = length + 8 = 24. SVG center x =
        // bubble_width - svg_width/2 = 100 - 12 = 88.
        // Tip x = svg_center_x + length = 88 + 16 = 104.
        expect(tip!.x).toBeCloseTo(104, 1);
        expect(tip!.y).toBeCloseTo(50, 1); // mid-right vertically
    });

    it("N direction with position_pct=25 places tip above quarter-top", () => {
        const tip = computeVisibleTipPosition("N", 25, 16, 100, 100);
        expect(tip).not.toBeNull();
        expect(tip!.x).toBeCloseTo(25, 1);
        // SVG attached at top, svg_height=24, svg_center_y = 12.
        // Tip y = 12 + (-1)*16 = -4.
        expect(tip!.y).toBeCloseTo(-4, 1);
    });

    it("auto maps to S", () => {
        const tipAuto = computeVisibleTipPosition("auto", 50, 16, 100, 100);
        const tipSouth = computeVisibleTipPosition("S", 50, 16, 100, 100);
        expect(tipAuto).toEqual(tipSouth);
    });
});

describe("deriveTailFromTip", () => {
    // 100x100 bubble. Center at (50, 50).

    it("tip at (50, 130) → S, mid-bottom, length matches distance", () => {
        const result = deriveTailFromTip(50, 130, 100, 100);
        expect(result.direction).toBe("S");
        expect(result.positionPct).toBe(50);
        // anchor at (50, 100). tip at (50, 130). distance = 30.
        expect(result.lengthPx).toBe(30);
    });

    it("tip at (130, 50) → E, mid-right, length matches distance", () => {
        const result = deriveTailFromTip(130, 50, 100, 100);
        expect(result.direction).toBe("E");
        expect(result.positionPct).toBe(50);
        expect(result.lengthPx).toBe(30);
    });

    it("tip at (50, -20) → N, mid-top, length matches distance", () => {
        const result = deriveTailFromTip(50, -20, 100, 100);
        expect(result.direction).toBe("N");
        expect(result.positionPct).toBe(50);
        // anchor at (50, 0). tip at (50, -20). distance = 20.
        expect(result.lengthPx).toBe(20);
    });

    it("tip at (-30, 50) → W, mid-left, length matches distance", () => {
        const result = deriveTailFromTip(-30, 50, 100, 100);
        expect(result.direction).toBe("W");
        expect(result.positionPct).toBe(50);
        expect(result.lengthPx).toBe(30);
    });

    it("tip down-right of center snaps to SE", () => {
        // Angle from center to (110, 110) is 45° = SE.
        const result = deriveTailFromTip(110, 110, 100, 100);
        expect(result.direction).toBe("SE");
    });

    it("tip up-right of center snaps to NE", () => {
        // Angle from center to (110, -10) is -45° = NE.
        const result = deriveTailFromTip(110, -10, 100, 100);
        expect(result.direction).toBe("NE");
    });

    it("clamps length to [0, 64]", () => {
        // Very far drag: tip 500px below.
        const result = deriveTailFromTip(50, 600, 100, 100);
        expect(result.lengthPx).toBe(64);
    });

    it("clamps position_pct to [0, 100]", () => {
        // Drag tip off-screen to the left while in S octant.
        // anchor x clamps to 0 → position_pct = 0.
        const result = deriveTailFromTip(-50, 130, 100, 100);
        expect(result.positionPct).toBeGreaterThanOrEqual(0);
        expect(result.positionPct).toBeLessThanOrEqual(100);
    });
});
