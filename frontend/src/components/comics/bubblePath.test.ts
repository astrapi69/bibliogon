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
        it.each(["speech", "narration", "whisper", "shout"] as const)(
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

    describe("thought tail = circle-chain (concept doc)", () => {
        // The thought tail is a chain of 1-3 shrinking circles
        // drifting outward, NOT a bezier balloon-tail.
        it("emits NO cubic beziers for its tail (only arcs)", () => {
            const noTail = buildBubblePath({...BASE_INPUT, shape: "thought"});
            const withTail = buildBubblePath({
                ...BASE_INPUT,
                shape: "thought",
                tailDirection: "S",
                tailLengthPx: 35,
            });
            // Rounded-rect outline alone uses 4 A commands and 0
            // C commands. The tail must not introduce any cubics.
            expect((noTail.d.match(/C /g) ?? []).length).toBe(0);
            expect((withTail.d.match(/C /g) ?? []).length).toBe(0);
        });

        it("count scales with tail_length_px (3/2/1)", () => {
            const sub15 = buildBubblePath({
                ...BASE_INPUT,
                shape: "thought",
                tailDirection: "S",
                tailLengthPx: 10,
            });
            const mid = buildBubblePath({
                ...BASE_INPUT,
                shape: "thought",
                tailDirection: "S",
                tailLengthPx: 20,
            });
            const long = buildBubblePath({
                ...BASE_INPUT,
                shape: "thought",
                tailDirection: "S",
                tailLengthPx: 35,
            });
            // Each circle is one sub-path with two A commands +
            // 1 M + 1 Z. Outline contributes 4 A commands.
            const arcsOf = (d: string) => (d.match(/A /g) ?? []).length;
            expect(arcsOf(sub15.d)).toBe(4 + 2 * 1); // outline + 1 circle
            expect(arcsOf(mid.d)).toBe(4 + 2 * 2); // outline + 2 circles
            expect(arcsOf(long.d)).toBe(4 + 2 * 3); // outline + 3 circles
        });

        it("no chain when tail_direction is none", () => {
            const out = buildBubblePath({
                ...BASE_INPUT,
                shape: "thought",
                tailDirection: "none",
                tailLengthPx: 40,
            });
            // Just the rounded-rect outline (4 arcs).
            expect((out.d.match(/A /g) ?? []).length).toBe(4);
        });

        it("direction drives chain offset (S vs N)", () => {
            const south = buildBubblePath({
                ...BASE_INPUT,
                shape: "thought",
                tailDirection: "S",
                tailLengthPx: 40,
            });
            const north = buildBubblePath({
                ...BASE_INPUT,
                shape: "thought",
                tailDirection: "N",
                tailLengthPx: 40,
            });
            // S chain has cy values past y=100; N chain has cy
            // values past y=0 (i.e. negative).
            expect(south.d).toMatch(/\b1[0-3][0-9](\.\d)?\b/); // 100-139
            expect(north.d).toMatch(/-[0-9]+(\.\d)?\b/);
        });

        // Cross-language snapshot pin. Mirrors
        // ``plugins/bibliogon-plugin-comics/tests/test_bubble_path.py``
        // — same input must produce a byte-identical ``d`` string
        // in both TS and Python.
        it("cross-language snapshot pin (thought, S, 35px)", () => {
            const out = buildBubblePath({
                shape: "thought",
                width: 100,
                height: 100,
                tailDirection: "S",
                tailPositionPct: 50,
                tailLengthPx: 35,
            });
            expect(out.d).toBe(
                "M 30 0 L 70 0 A 30 30 0 0 1 100 30 " +
                    "L 100 70 A 30 30 0 0 1 70 100 " +
                    "L 30 100 A 30 30 0 0 1 0 70 " +
                    "L 0 30 A 30 30 0 0 1 30 0 Z " +
                    "M 44 108.8 A 6 6 0 1 0 56 108.8 A 6 6 0 1 0 44 108.8 Z " +
                    "M 46.4 121 A 3.6 3.6 0 1 0 53.6 121 A 3.6 3.6 0 1 0 46.4 121 Z " +
                    "M 47.8 135 A 2.2 2.2 0 1 0 52.2 135 A 2.2 2.2 0 1 0 47.8 135 Z",
            );
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
