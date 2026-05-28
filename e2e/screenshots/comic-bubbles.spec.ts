/**
 * Help-doc screenshot generator for the Comic bubble types page
 * (F4, 2026-05-28).
 *
 * Manual-only — invoke via:
 *   cd e2e && npx playwright test --project=screenshots
 *     screenshots/comic-bubbles.spec.ts
 *
 * Writes 7 PNGs to ``docs/help/assets/screenshots/``:
 *   comic-bubble-types-all.png       (composite)
 *   comic-bubble-speech.png          (per-type crop)
 *   comic-bubble-thought.png
 *   comic-bubble-narration.png
 *   comic-bubble-shout.png
 *   comic-bubble-whisper.png
 *   comic-bubble-sound-effect.png
 *
 * These are consumed by:
 *   docs/help/en/books/comic-bubbles.md
 *   docs/help/de/books/comic-bubbles.md
 *
 * Re-run only when the bubble rendering changes (path generator
 * tweak, theme palette change for the editor canvas, etc.).
 * Output PNGs are committed alongside the help-doc Markdown.
 */

import {test, expect} from "../fixtures/base";
import {createComicBook} from "../helpers/api";

const API = "http://localhost:8000/api";
const OUT_DIR = "../docs/help/assets/screenshots";

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

test.describe("Help-doc screenshot generator — Comic bubble types", () => {
    test("captures composite + per-type screenshots", async ({page}) => {
        const book = await createComicBook(
            "Comic Bubble Types Help",
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

        await expect
            .poll(async () =>
                page.locator('[data-testid^="bubble-shape-path-"]').count(),
            )
            .toBeGreaterThanOrEqual(5);
        await page.evaluate(() => document.fonts.ready);

        // Click outside any bubble so no selection ring leaks
        // into the per-bubble crops.
        await page.getByTestId("comic-book-editor-root").click({
            position: {x: 5, y: 5},
        });

        // Composite of the entire panel.
        const comicPanel = page
            .locator('[data-testid^="comic-panel-"]')
            .first();
        await comicPanel.screenshot({
            path: `${OUT_DIR}/comic-bubble-types-all.png`,
        });

        // Per-bubble crops.
        for (const {id, spec} of bubbles) {
            const bubble = page.getByTestId(`comic-bubble-${id}`);
            await expect(bubble).toBeVisible();
            const filename = `comic-bubble-${spec.bubble_type.replace(
                "_",
                "-",
            )}.png`;
            await bubble.screenshot({path: `${OUT_DIR}/${filename}`});
        }
    });
});
