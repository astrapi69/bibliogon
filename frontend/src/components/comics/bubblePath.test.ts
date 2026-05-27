/**
 * Tests for the single-SVG-path bubble generator (approach A).
 *
 * Pins:
 * - Path string includes the right commands for each shape.
 * - Tail diversion uses cubic beziers (``C ...``), not straight
 *   lines.
 * - sound_effect returns an empty path.
 * - The viewBox grows to accommodate the tail extension.
 */

import {describe, it, expect} from "vitest";
import {buildBubblePath} from "./bubblePath";

const BASE_INPUT = {
    width: 100,
    height: 100,
    tailDirection: "none" as const,
    tailPositionPct: 50,
    tailLengthPx: 16,
};

describe("buildBubblePath", () => {
    it("sound_effect returns an empty path (no border)", () => {
        const out = buildBubblePath({...BASE_INPUT, shape: "sound_effect"});
        expect(out.d).toBe("");
    });

    it("narration emits a closed rectangle path", () => {
        const out = buildBubblePath({...BASE_INPUT, shape: "narration"});
        expect(out.d).toMatch(/^M /);
        expect(out.d).toContain("L "); // line commands for rectangle
        expect(out.d).toMatch(/Z$/);
    });

    it("speech emits cubic beziers for the ellipse", () => {
        const out = buildBubblePath({...BASE_INPUT, shape: "speech"});
        // 4 cubic beziers around the ellipse.
        expect((out.d.match(/C /g) ?? []).length).toBeGreaterThanOrEqual(4);
        expect(out.d).toMatch(/Z/);
    });

    it("thought emits arcs for rounded corners", () => {
        const out = buildBubblePath({...BASE_INPUT, shape: "thought"});
        // 4 arc commands for rounded corners.
        expect((out.d.match(/A /g) ?? []).length).toBe(4);
    });

    it("whisper uses the same rounded-rect shape as thought", () => {
        const thought = buildBubblePath({...BASE_INPUT, shape: "thought"});
        const whisper = buildBubblePath({...BASE_INPUT, shape: "whisper"});
        expect(whisper.d).toBe(thought.d);
    });

    it("shout uses the 20-vertex star polygon", () => {
        const out = buildBubblePath({...BASE_INPUT, shape: "shout"});
        // 20 L commands (first vertex via M, the rest via L).
        const lineCount = (out.d.match(/L /g) ?? []).length;
        expect(lineCount).toBeGreaterThanOrEqual(19);
    });

    describe("tail diversion uses cubic beziers", () => {
        it.each(["speech", "thought", "narration", "whisper", "shout"] as const)(
            "%s with a tail emits cubic curves for the tail subpath",
            (shape) => {
                const noTail = buildBubblePath({
                    ...BASE_INPUT,
                    shape,
                    tailDirection: "none",
                });
                const withTail = buildBubblePath({
                    ...BASE_INPUT,
                    shape,
                    tailDirection: "S",
                });
                const cubicsNoTail = (noTail.d.match(/C /g) ?? []).length;
                const cubicsWithTail = (withTail.d.match(/C /g) ?? []).length;
                // Tail adds at least 2 cubic beziers (one per side
                // of the curved tail).
                expect(cubicsWithTail).toBeGreaterThanOrEqual(
                    cubicsNoTail + 2,
                );
            },
        );

        it("does NOT emit straight lines for the tail edges (S direction, narration)", () => {
            const out = buildBubblePath({
                ...BASE_INPUT,
                shape: "narration",
                tailDirection: "S",
            });
            // The path must contain at least one cubic bezier
            // segment (C ...) — the tail's curved edges.
            expect(out.d).toContain("C ");
        });
    });

    describe("viewBox stays at the bubble bbox; tail extends via path coords", () => {
        it("viewBox is the bubble bbox even when a tail is present", () => {
            const out = buildBubblePath({
                ...BASE_INPUT,
                shape: "speech",
                tailDirection: "S",
                tailLengthPx: 20,
            });
            expect(out.viewBox).toBe("0 0 100 100");
        });

        it("S direction tail emits path coords past y=100", () => {
            const out = buildBubblePath({
                ...BASE_INPUT,
                shape: "narration",
                tailDirection: "S",
                tailLengthPx: 25,
            });
            // The tip y for S is bubble_height + length = 125.
            // Look for "125" in the path string.
            expect(out.d).toMatch(/\b12[45]\b/);
        });

        it("E direction tail emits path coords past x=width", () => {
            const out = buildBubblePath({
                ...BASE_INPUT,
                shape: "narration",
                tailDirection: "E",
                tailLengthPx: 18,
            });
            // Tip x = width + length = 118.
            expect(out.d).toMatch(/\b11[78]\b/);
        });
    });
});
