/**
 * Comic bubble visual-shape smoke (Path B C4, 2026-05-28).
 *
 * One spec, six bubble types. Each bubble is created via API
 * (faster + more controllable than driving the UI picker for
 * 6 types), then the spec asserts the rendered SVG path's
 * structural fingerprint matches the contract from the
 * concept doc (docs/audits/comic-bubble-konzept.md):
 *
 *   speech       — bezier S-curve tail (cubic ``C`` commands)
 *   thought      — chain of 1-3 circles drifting outward (arc
 *                  ``A`` commands; NO ``C``)
 *   narration    — no tail regardless of stored direction (no
 *                  spike past the bbox edge; no ``C``)
 *   shout        — extended star spike absorbed into the
 *                  outline (one vertex past the bbox; NO ``C``)
 *   whisper      — bezier S-curve tail like speech, dashed
 *                  stroke (cubic ``C`` commands)
 *   sound_effect — no SVG path at all (text-only render)
 *
 * Visual baseline: ``page.screenshot()`` saves a snapshot of
 * the panel showing all 6 bubble types together. Saved to
 * ``test-results/`` (per the playwright config); the user
 * reviews them manually. NOT a ``toHaveScreenshot()`` gate
 * because the visual baseline infra (committable snapshot
 * directory) isn't yet a repo convention.
 *
 * The cross-language snapshot pin in Vitest + pytest
 * (TestThoughtCircleChain / TestShoutSpikeExtension /
 * TestNarrationForceNoTail) covers the byte-identity contract
 * between TS and Python walkers. This spec covers the
 * "actually renders in a real browser" contract.
 */

import {test, expect, createComicBook} from "../fixtures/base";

const API = "http://localhost:8000/api";

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(
            `POST ${path}: ${res.status} ${await res.text()}`,
        );
    }
    return res.json();
}

interface BubbleSpec {
    bubble_type:
        | "speech"
        | "thought"
        | "narration"
        | "shout"
        | "whisper"
        | "sound_effect";
    /** (x_pct, y_pct) of the bubble's centre within the panel. */
    anchor: {x_pct: number; y_pct: number};
    /** Stored tail direction. For narration this should be
     *  IGNORED at render time per C3 ("force no tail"). */
    tail_direction: string;
}

// Lay 6 bubble types across a 3×2 grid inside the panel.
const SPECS: ReadonlyArray<BubbleSpec> = [
    {bubble_type: "speech", anchor: {x_pct: 20, y_pct: 25}, tail_direction: "S"},
    {bubble_type: "thought", anchor: {x_pct: 50, y_pct: 25}, tail_direction: "S"},
    {bubble_type: "narration", anchor: {x_pct: 80, y_pct: 25}, tail_direction: "S"},
    {bubble_type: "shout", anchor: {x_pct: 20, y_pct: 70}, tail_direction: "S"},
    {bubble_type: "whisper", anchor: {x_pct: 50, y_pct: 70}, tail_direction: "S"},
    {bubble_type: "sound_effect", anchor: {x_pct: 80, y_pct: 70}, tail_direction: "none"},
];

test.describe("Comic bubble types — visual shape contract", () => {
    test("all 6 bubble types render their expected SVG path fingerprint", async ({
        page,
    }) => {
        const book = await createComicBook(
            "Bubble Types Smoke",
            "E2E Author",
        );

        // Create one comic-grid page directly via API.
        const pageRow = await postJson<{id: string}>(`/books/${book.id}/pages`, {
            layout: "comic_panel_grid",
        });

        // One panel filling the whole page.
        const panel = await postJson<{id: string}>(
            `/books/${book.id}/comic-pages/${pageRow.id}/panels`,
            {bounds: {x_pct: 0, y_pct: 0, width_pct: 100, height_pct: 100}},
        );

        // Six bubbles, one per type.
        const bubbles: Array<{id: string; spec: BubbleSpec}> = [];
        for (const spec of SPECS) {
            const created = await postJson<{id: string}>(
                `/books/${book.id}/comic-panels/${panel.id}/bubbles`,
                {
                    bubble_type: spec.bubble_type,
                    anchor: spec.anchor,
                    width_pct: 22,
                    height_pct: 22,
                    tail_direction: spec.tail_direction,
                    tail_position_pct: 50,
                    tail_length_px: 30,
                    text_content: spec.bubble_type,
                },
            );
            bubbles.push({id: created.id, spec});
        }

        // Open the editor and wait for the bubbles to render.
        await page.goto(`/book/${book.id}`);
        await expect(page.getByTestId("comic-book-editor-root")).toBeVisible();

        // Each bubble's rendered SVG path lives at
        // ``bubble-shape-path-{id}``. sound_effect does NOT
        // render an SVG (the path is the empty string) — the
        // testid won't appear in the DOM.
        for (const {id, spec} of bubbles) {
            if (spec.bubble_type === "sound_effect") {
                // No SVG element rendered for sound_effect.
                await expect(
                    page.locator(`[data-testid="bubble-shape-path-${id}"]`),
                ).toHaveCount(0);
                continue;
            }

            const path = page.getByTestId(`bubble-shape-path-${id}`);
            await expect(path).toBeAttached();
            const d = await path.getAttribute("d");
            expect(d, `bubble ${spec.bubble_type} path d`).toBeTruthy();
            const cubicCount = (d!.match(/C /g) ?? []).length;
            const arcCount = (d!.match(/A /g) ?? []).length;
            const lineCount = (d!.match(/L /g) ?? []).length;

            if (spec.bubble_type === "speech") {
                // Post-swap (2026-05-28): rounded-rect outline
                // (4 arcs) + bezier S-curve tail (>= 2 cubics).
                expect(cubicCount).toBeGreaterThanOrEqual(2);
                expect(arcCount).toBeGreaterThanOrEqual(4);
            } else if (spec.bubble_type === "thought") {
                // Post-swap: ellipse outline (4 cubics) + a
                // thought-circle chain. thoughtCircleChainSuffix
                // (bubblePath.ts) picks the circle count by tail
                // length: >30 → 3, >15 → 2, else 1. This spec creates
                // the bubbles with tail_length_px = 30 (NOT > 30), so
                // the chain is the "medium" 2-circle variant = 2 arcs
                // each = 4. The chain uses arcs, not cubics, so the
                // outline's 4 cubics are the total cubic count.
                expect(cubicCount).toBe(4);
                expect(arcCount).toBe(2 * 2);
            } else if (spec.bubble_type === "narration") {
                // Force-ignored tail_direction = no tail. Simple
                // zero-radius "rounded" rect (4 L + 4 A all
                // zero-radius), no cubics.
                expect(cubicCount).toBe(0);
                // No vertex past the 100×100 bbox (no tail spike).
                expect(d!).not.toMatch(/\b1[2-9][0-9]\b/);
            } else if (spec.bubble_type === "shout") {
                // 20-vertex star with one spike extended. 1 M +
                // 19 L + 1 Z. Spike pushed past y=100 (S direction,
                // 30 px → y=130 on vertex [45, 100]).
                expect(cubicCount).toBe(0);
                expect(lineCount).toBe(19);
                expect(d!).toMatch(/\b130\b/);
            } else if (spec.bubble_type === "whisper") {
                // Like speech but rounded-rect: 4 arcs + bezier
                // tail. At least 2 cubics for the tail.
                expect(cubicCount).toBeGreaterThanOrEqual(2);
                expect(arcCount).toBeGreaterThanOrEqual(4);
            }
        }

        // Composite visual baseline. Reviewer-friendly snapshot;
        // not gated as a pixel-diff (baseline directory isn't a
        // repo convention yet).
        await page.screenshot({
            path: `test-results/comic-bubble-types-shape/composite.png`,
            fullPage: false,
        });
    });
});
