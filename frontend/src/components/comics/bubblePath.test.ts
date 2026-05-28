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
        it.each(["speech", "whisper"] as const)(
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

        it("does NOT emit straight lines for the tail edges (S direction, speech)", () => {
            const out = buildBubblePath({
                ...BASE_INPUT,
                shape: "speech",
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
        // ``backend/tests/test_comic_book_pdf.py::TestThoughtCircleChain``
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
                shape: "speech",
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
                shape: "speech",
                tailDirection: "E",
                tailLengthPx: 18,
            });
            // Tip x = width + length = 118.
            expect(out.d).toMatch(/\b11[78]\b/);
        });
    });

    describe("narration force no-tail (concept doc)", () => {
        // Narration boxes are narrator voice and don't point at
        // a speaker. The walker must IGNORE any stored
        // tail_direction and render no tail regardless.
        it.each(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "auto"] as const)(
            "ignores tail_direction=%s and produces the no-tail rect",
            (dir) => {
                const ignored = buildBubblePath({
                    shape: "narration",
                    width: 100,
                    height: 100,
                    tailDirection: dir,
                    tailPositionPct: 50,
                    tailLengthPx: 30,
                });
                const noTail = buildBubblePath({
                    shape: "narration",
                    width: 100,
                    height: 100,
                    tailDirection: "none",
                    tailPositionPct: 50,
                    tailLengthPx: 30,
                });
                expect(ignored.d).toBe(noTail.d);
            },
        );

        it("emits NO cubic beziers regardless of stored direction", () => {
            const out = buildBubblePath({
                shape: "narration",
                width: 100,
                height: 100,
                tailDirection: "S",
                tailPositionPct: 50,
                tailLengthPx: 30,
            });
            expect((out.d.match(/C /g) ?? []).length).toBe(0);
        });

        // Cross-language snapshot pin. Mirrors
        // ``backend/tests/test_comic_book_pdf.py::TestNarrationForceNoTail``.
        it("cross-language snapshot pin (narration, S, 25px)", () => {
            const out = buildBubblePath({
                shape: "narration",
                width: 100,
                height: 100,
                tailDirection: "S",
                tailPositionPct: 50,
                tailLengthPx: 25,
            });
            expect(out.d).toBe(
                "M 0 0 L 100 0 A 0 0 0 0 1 100 0 " +
                    "L 100 100 A 0 0 0 0 1 100 100 " +
                    "L 0 100 A 0 0 0 0 1 0 100 " +
                    "L 0 0 A 0 0 0 0 1 0 0 Z",
            );
        });
    });

    describe("shout tail = extended spike (concept doc)", () => {
        // The shout tail is one of the star's existing spikes
        // lengthened in the requested direction. Adjacent vertices
        // (unchanged) form the natural tail base — no separate
        // sub-path.
        it("no spike extension when tail_direction is none", () => {
            const noTail = buildBubblePath({
                ...BASE_INPUT,
                shape: "shout",
                tailDirection: "none",
                tailLengthPx: 30,
            });
            // Star = 1 M + 19 L + 1 Z, no other commands.
            const lCount = (noTail.d.match(/L /g) ?? []).length;
            expect(lCount).toBe(19);
            // 20 vertices' worth of coordinates; max y stays <= 100
            // because no vertex is pushed outside the bbox.
            expect(noTail.d).not.toMatch(/\b1[2-9][0-9](\.\d)?\b/);
        });

        it("S direction extends the bottom-most spike past y=100", () => {
            const withTail = buildBubblePath({
                ...BASE_INPUT,
                shape: "shout",
                tailDirection: "S",
                tailLengthPx: 20,
            });
            // bottom-most vertex [45, 100] gets pushed to y=120.
            expect(withTail.d).toMatch(/\b120\b/);
            // still exactly 19 L commands — same vertex count.
            const lCount = (withTail.d.match(/L /g) ?? []).length;
            expect(lCount).toBe(19);
        });

        it("N direction extends the top-most spike past y=0 (negative)", () => {
            const withTail = buildBubblePath({
                ...BASE_INPUT,
                shape: "shout",
                tailDirection: "N",
                tailLengthPx: 25,
            });
            // Closest spike to N at center-x is [40, 0]; pushed to
            // y = -25.
            expect(withTail.d).toMatch(/-25\b/);
        });

        it("E direction extends the right-most spike past x=100", () => {
            const withTail = buildBubblePath({
                ...BASE_INPUT,
                shape: "shout",
                tailDirection: "E",
                tailLengthPx: 18,
            });
            // Right-edge vertex pushed to x=118.
            expect(withTail.d).toMatch(/\b118\b/);
        });

        it("no separate cubic-bezier tail sub-path is appended", () => {
            const withTail = buildBubblePath({
                ...BASE_INPUT,
                shape: "shout",
                tailDirection: "S",
                tailLengthPx: 20,
            });
            // Spike-extension uses the star's existing L commands;
            // no curves and no extra M (only the opening one).
            expect((withTail.d.match(/C /g) ?? []).length).toBe(0);
            expect((withTail.d.match(/M /g) ?? []).length).toBe(1);
            // Single Z at the close.
            expect((withTail.d.match(/Z/g) ?? []).length).toBe(1);
        });

        // Cross-language snapshot pin. Mirrors
        // ``backend/tests/test_comic_book_pdf.py::TestShoutSpikeExtension``.
        it("cross-language snapshot pin (shout, S, 20px)", () => {
            const out = buildBubblePath({
                shape: "shout",
                width: 100,
                height: 100,
                tailDirection: "S",
                tailPositionPct: 50,
                tailLengthPx: 20,
            });
            expect(out.d).toBe(
                "M 0 20 L 10 0 L 25 15 L 40 0 L 55 15 L 70 0 " +
                    "L 85 15 L 100 20 L 90 40 L 100 60 L 85 75 " +
                    "L 100 90 L 75 100 L 60 85 L 45 120 L 30 85 " +
                    "L 15 100 L 0 80 L 10 60 L 0 40 Z",
            );
        });
    });
});
