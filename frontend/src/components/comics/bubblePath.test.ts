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

    it("speech emits arcs for rounded corners (rounded-rect outline)", () => {
        const out = buildBubblePath({...BASE_INPUT, shape: "speech"});
        // 4 arc commands for the rounded-rect corners. No tail in
        // BASE_INPUT so no bezier-tail cubics.
        expect((out.d.match(/A /g) ?? []).length).toBe(4);
        expect((out.d.match(/C /g) ?? []).length).toBe(0);
    });

    it("thought emits cubic beziers for the ellipse outline", () => {
        const out = buildBubblePath({...BASE_INPUT, shape: "thought"});
        // 4 cubic beziers around the ellipse outline. No tail in
        // BASE_INPUT so no circle-chain arcs.
        expect((out.d.match(/C /g) ?? []).length).toBe(4);
        expect((out.d.match(/A /g) ?? []).length).toBe(0);
    });

    it("whisper uses the same rounded-rect shape as speech", () => {
        // After the speech/thought shape swap, whisper and speech
        // share the rounded-rect outline + bezier-tail behaviour;
        // only the stroke-dasharray differs at render time.
        const speech = buildBubblePath({...BASE_INPUT, shape: "speech"});
        const whisper = buildBubblePath({...BASE_INPUT, shape: "whisper"});
        expect(whisper.d).toBe(speech.d);
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
        // drifting outward, NOT a bezier balloon-tail. Post-swap
        // (2026-05-28), thought's outline is an ellipse (4 cubic
        // beziers); the circle chain only adds arcs.
        it("tail uses arcs only, never cubic beziers", () => {
            const noTail = buildBubblePath({...BASE_INPUT, shape: "thought"});
            const withTail = buildBubblePath({
                ...BASE_INPUT,
                shape: "thought",
                tailDirection: "S",
                tailLengthPx: 35,
            });
            // Ellipse outline contributes 4 cubics. The tail does
            // NOT introduce additional cubics — circles are arcs.
            expect((noTail.d.match(/C /g) ?? []).length).toBe(4);
            expect((withTail.d.match(/C /g) ?? []).length).toBe(4);
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
            // Each circle is one sub-path with two A commands.
            // The ellipse outline contributes 0 arcs (only cubics),
            // so the total arc count = 2 × circle count.
            const arcsOf = (d: string) => (d.match(/A /g) ?? []).length;
            expect(arcsOf(sub15.d)).toBe(2 * 1); // 1 circle
            expect(arcsOf(mid.d)).toBe(2 * 2); // 2 circles
            expect(arcsOf(long.d)).toBe(2 * 3); // 3 circles
        });

        it("no chain when tail_direction is none", () => {
            const out = buildBubblePath({
                ...BASE_INPUT,
                shape: "thought",
                tailDirection: "none",
                tailLengthPx: 40,
            });
            // Just the ellipse outline: 4 cubics, 0 arcs.
            expect((out.d.match(/A /g) ?? []).length).toBe(0);
            expect((out.d.match(/C /g) ?? []).length).toBe(4);
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
                "M 0 50 C 0 22.4 22.4 0 50 0 " +
                    "C 77.6 0 100 22.4 100 50 " +
                    "C 100 77.6 77.6 100 50 100 " +
                    "C 22.4 100 0 77.6 0 50 Z " +
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
