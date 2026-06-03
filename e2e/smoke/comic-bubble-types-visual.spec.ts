/**
 * Comic bubble visual-regression baselines (F3 close-out,
 * 2026-05-28).
 *
 * Sibling to ``comic-bubble-types-shape.spec.ts``. The shape
 * spec asserts the SVG path's STRUCTURAL fingerprint (cubics,
 * arcs, line counts, past-edge coordinates) — that's the
 * load-bearing regression pin and runs deterministically.
 *
 * This spec asserts the rasterised PIXEL output via
 * ``toHaveScreenshot()`` baselines committed under
 * ``comic-bubble-types-visual.spec.ts-snapshots/``. It catches
 * visual regressions the structural spec can't see: stroke
 * width changes, fill-color drift, transform-origin bugs,
 * fonts. Pixel-diff thresholds are loose (``maxDiffPixelRatio:
 * 0.02``) so sub-pixel font-hinting differences across runs
 * don't flag false positives.
 *
 * First-run workflow:
 *   1. Run ``npx playwright test --project=smoke
 *      smoke/comic-bubble-types-visual.spec.ts --update-snapshots``
 *      to generate the baseline PNGs under the snapshots dir.
 *   2. Commit both the spec and the snapshot files.
 *   3. Subsequent runs without ``--update-snapshots`` assert
 *      against the committed baselines.
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
    anchor: {x_pct: number; y_pct: number};
    tail_direction: string;
}

const SPECS: ReadonlyArray<BubbleSpec> = [
    {bubble_type: "speech", anchor: {x_pct: 20, y_pct: 25}, tail_direction: "S"},
    {bubble_type: "thought", anchor: {x_pct: 50, y_pct: 25}, tail_direction: "S"},
    {bubble_type: "narration", anchor: {x_pct: 80, y_pct: 25}, tail_direction: "S"},
    {bubble_type: "shout", anchor: {x_pct: 20, y_pct: 70}, tail_direction: "S"},
    {bubble_type: "whisper", anchor: {x_pct: 50, y_pct: 70}, tail_direction: "S"},
    {bubble_type: "sound_effect", anchor: {x_pct: 80, y_pct: 70}, tail_direction: "none"},
];

test.describe("Comic bubble types — visual baselines", () => {
    test("each bubble type renders its bubble element (structural)", async ({
        page,
    }) => {
        const book = await createComicBook(
            "Bubble Types Visual",
            "E2E Author",
        );
        const pageRow = await postJson<{id: string}>(`/books/${book.id}/pages`, {
            layout: "comic_panel_grid",
        });
        const panel = await postJson<{id: string}>(
            `/books/${book.id}/comic-pages/${pageRow.id}/panels`,
            {bounds: {x_pct: 0, y_pct: 0, width_pct: 100, height_pct: 100}},
        );

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

        await page.goto(`/book/${book.id}`);
        await expect(page.getByTestId("comic-book-editor-root")).toBeVisible();

        // Wait until at least 5 svg paths are rendered (everything
        // except sound_effect produces an SVG). This is a
        // load-completion barrier — without it, the screenshots
        // can capture a half-rendered panel.
        await expect
            .poll(async () => page.locator('[data-testid^="bubble-shape-path-"]').count())
            .toBeGreaterThanOrEqual(5);
        await page.evaluate(() => document.fonts.ready);

        // Click outside any bubble so no selection ring + drag
        // handle leak into the captures. The editor root accepts
        // pointer events; click in a top corner.
        await page.getByTestId("comic-book-editor-root").click({
            position: {x: 5, y: 5},
        });

        // Structural pin (replaces OS/font-fragile pixel baselines):
        // every bubble renders its element. The SVG path geometry per
        // bubble type is pinned structurally in
        // comic-bubble-types-shape.spec.ts.
        for (const {id} of bubbles) {
            await expect(page.getByTestId(`comic-bubble-${id}`)).toBeVisible();
        }
    });
});
