/**
 * Editor fullscreen affordances smoke
 * (EDITOR-FULLSCREEN-NATIVE-01 C6).
 *
 * Pins the browser-native fullscreen toggle across the 3
 * integration points landed in C2 - C4:
 *
 * 1. Editor.tsx Toolbar (testid ``toolbar-fullscreen``) -
 *    covers ArticleEditor + BookEditor (both compose
 *    Editor.tsx).
 * 2. PageEditor header (testid ``page-editor-fullscreen``) -
 *    Picture-Book per-page editor.
 * 3. ComicBookEditor header (testid
 *    ``comic-book-editor-fullscreen``) - plugin-comics
 *    Session 1 placeholder; Session 2 inherits the button.
 *
 * The spec asserts the buttons render with the correct
 * aria-keyshortcuts attribute. Asserting the actual Fullscreen
 * API state change is unreliable in headless Playwright -
 * Chromium may reject ``requestFullscreen()`` outside a real
 * user gesture flow, AND ``document.fullscreenElement`` is
 * tracked by the browser process not the page DOM. The hook's
 * Vitest cases (useFullscreenToggle.test.ts) already pin the
 * state machine.
 *
 * Per PLUGIN-COMICS-E2E-SMOKE-01 precedent: this spec runs
 * against a live uvicorn + vite dev server. Bibliogon's
 * convention is Claude Code writes specs, Aster runs them.
 */

import {
    test,
    expect,
    createBook,
    createChapter,
    createPictureBook,
    createComicBook,
} from "../fixtures/base";

test.describe("Editor fullscreen toggles (EDITOR-FULLSCREEN-NATIVE-01)", () => {
    test("Editor.tsx Toolbar renders toolbar-fullscreen with ARIA shortcuts", async ({
        page,
    }) => {
        // Create a prose book + chapter via API (resetDb wipes the
        // dashboard each test), then open it so Editor.tsx mounts.
        const book = await createBook("Fullscreen Prose");
        await createChapter(book.id, "Chapter 1", "<p>Body</p>");
        await page.goto(`/book/${book.id}`);

        const fsButton = page.getByTestId("toolbar-fullscreen");
        await expect(fsButton).toBeVisible({timeout: 8000});
        await expect(fsButton).toHaveAttribute(
            "aria-keyshortcuts",
            "F11 Control+Shift+F",
        );
        await expect(fsButton).toHaveAttribute("aria-pressed", "false");
    });

    test("PageEditor renders page-editor-fullscreen with ARIA shortcuts", async ({
        page,
    }) => {
        const book = await createPictureBook("Fullscreen Picture Book");
        await page.goto(`/book/${book.id}`);

        const fsButton = page.getByTestId("page-editor-fullscreen");
        await expect(fsButton).toBeVisible({timeout: 8000});
        await expect(fsButton).toHaveAttribute(
            "aria-keyshortcuts",
            "F11 Control+Shift+F",
        );
        await expect(fsButton).toHaveAttribute("aria-pressed", "false");
    });

    test("ComicBookEditor renders comic-book-editor-fullscreen with ARIA shortcuts", async ({
        page,
    }) => {
        const book = await createComicBook("Fullscreen Comic Book");
        await page.goto(`/book/${book.id}`);

        const fsButton = page.getByTestId("comic-book-editor-fullscreen");
        await expect(fsButton).toBeVisible({timeout: 8000});
        await expect(fsButton).toHaveAttribute(
            "aria-keyshortcuts",
            "F11 Control+Shift+F",
        );
        await expect(fsButton).toHaveAttribute("aria-pressed", "false");
    });
});
