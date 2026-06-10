/**
 * Smoke test for switching the active chapter in the BookEditor.
 *
 * Regression-pins the bug where clicking a chapter in the sidebar did
 * NOT change the editor content: the ``onSelect`` handler issued two
 * separate ``setSearchParams`` calls in one tick (set ``?chapter=``,
 * then clear ``?view=``). react-router resolves each against the
 * render-time snapshot, so the second navigate clobbered the first and
 * ``?chapter=`` never updated — the editor stayed on the previous
 * chapter. ``selectChapter`` now writes both params in one call.
 *
 * A Vitest pin (``BookEditor.test.tsx``) covers the URL-param write at
 * the component level; this spec verifies the user-visible symptom in a
 * real browser: the ProseMirror body actually shows the clicked
 * chapter's content. CC must run this spec (Aster) before release per
 * the Pre-Release Gate.
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";

function body(text: string): string {
    return JSON.stringify({
        type: "doc",
        content: [
            {type: "paragraph", content: [{type: "text", text}]},
        ],
    });
}

const WIDE = {width: 1440, height: 900};

test.describe("BookEditor chapter switch", () => {
    test("clicking a chapter loads that chapter's content + updates ?chapter=", async ({
        page,
    }) => {
        const book = await createBook("Chapter Switch");
        const c1 = await createChapter(book.id, "Chapter One", body("ALPHA-BODY"));
        const c2 = await createChapter(book.id, "Chapter Two", body("BETA-BODY"));
        const c3 = await createChapter(
            book.id,
            "Chapter Three",
            body("GAMMA-BODY"),
        );

        // Wide viewport so the sidebar is expanded by default and a chapter
        // click does NOT auto-collapse it (above the 768px mobile breakpoint).
        await page.setViewportSize(WIDE);
        await page.goto(`/book/${book.id}?chapter=${c1.id}`);

        const editor = page.locator(".ProseMirror").first();
        await expect(editor).toContainText("ALPHA-BODY");
        expect(page.url()).toContain(`chapter=${c1.id}`);

        // Switch to chapter 2: body + URL must follow.
        await page.getByTestId(`chapter-item-${c2.id}`).click();
        await expect(editor).toContainText("BETA-BODY");
        await expect(editor).not.toContainText("ALPHA-BODY");
        await expect.poll(() => page.url()).toContain(`chapter=${c2.id}`);
        expect(page.url()).not.toContain(`chapter=${c1.id}`);

        // Switch to chapter 3.
        await page.getByTestId(`chapter-item-${c3.id}`).click();
        await expect(editor).toContainText("GAMMA-BODY");
        await expect.poll(() => page.url()).toContain(`chapter=${c3.id}`);

        // And back to chapter 1.
        await page.getByTestId(`chapter-item-${c1.id}`).click();
        await expect(editor).toContainText("ALPHA-BODY");
        await expect.poll(() => page.url()).toContain(`chapter=${c1.id}`);
    });

    test("selecting a chapter from the metadata view returns to the editor", async ({
        page,
    }) => {
        const book = await createBook("Metadata To Chapter");
        const c1 = await createChapter(book.id, "Chapter One", body("ALPHA-BODY"));
        const c2 = await createChapter(book.id, "Chapter Two", body("BETA-BODY"));

        await page.setViewportSize(WIDE);
        // Start in the metadata view with chapter 1 active in the URL.
        await page.goto(`/book/${book.id}?view=metadata&chapter=${c1.id}`);

        // Click chapter 2 in the sidebar: must clear the metadata view AND
        // move ?chapter= to c2, landing on the editor with c2's content.
        await page.getByTestId(`chapter-item-${c2.id}`).click();
        const editor = page.locator(".ProseMirror").first();
        await expect(editor).toContainText("BETA-BODY");
        await expect.poll(() => page.url()).toContain(`chapter=${c2.id}`);
        expect(page.url()).not.toContain("view=metadata");
        expect(page.url()).not.toContain(`chapter=${c1.id}`);
    });
});
