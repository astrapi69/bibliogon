/**
 * Learnset scaffold export smoke (#763, Phase 1).
 *
 * Happy path through the real UI: create a book with a content
 * chapter, open the editor's tools group, click "Lernset
 * exportieren", and assert the browser download delivers a ZIP whose
 * name follows the <slug>-learnset.zip contract. The ZIP's inner
 * layout + schema validity are pinned by the backend tests
 * (test_learnset_export_endpoint.py); this spec pins the user-facing
 * wiring the unit layers cannot see (button visibility inside the
 * Collapsible, feature gate, download plumbing).
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";

function body(text: string): string {
    return JSON.stringify({
        type: "doc",
        content: [{type: "paragraph", content: [{type: "text", text}]}],
    });
}

test.describe("Learnset export (Phase 1 scaffold)", () => {
    test("tools-group button downloads the scaffold ZIP", async ({page}) => {
        const book = await createBook("Lernset Smoke Buch");
        await createChapter(book.id, "Einleitung", body("Der Einstieg in das Thema."));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`/book/${book.id}`);

        // Retry-open per the #720 lesson: React.StrictMode's dev
        // double-mount can swallow the first Collapsible-toggle click.
        const button = page.getByTestId("sidebar-export-learnset");
        await expect(async () => {
            if (!(await button.isVisible().catch(() => false))) {
                await page.getByRole("button", {name: /Werkzeuge/}).click();
            }
            await expect(button).toBeVisible({timeout: 1000});
        }).toPass({timeout: 15000});
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThan(20);

        const downloadPromise = page.waitForEvent("download");
        await button.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe("lernset-smoke-buch-learnset.zip");
    });
});
